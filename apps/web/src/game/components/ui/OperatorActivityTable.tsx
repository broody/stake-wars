import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { OperatorActivity, OperatorActivityType } from '../../types';
import {
  getOperatorActivityFeedPage,
  type OperatorActivityFeedCursor,
} from '../../services/torii';
import { formatStrk } from '../../utils/format';
import { voyagerTransactionUrl } from '../../utils/voyager';
import { AddressLink } from './AddressLink';
import {
  Button,
  Callout,
  ExternalLink,
  Eyebrow,
  fieldStyles,
  SectionHeading,
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../../ui';

interface OperatorActivityTableProps {
  operator: string;
  variant?: 'page' | 'modal';
}

const VISIBLE_ACTIVITY_PAGE_SIZE = 20;

/** Each cell draws its right and bottom rule; the wrapper draws the others. */
const GRID_CELL = 'border-b border-r border-line px-4 py-4';
const GRID_CELL_HEAD = 'border-b border-r border-line px-4 py-3';

const eventPresentation: Record<
  OperatorActivityType,
  { marker: string; label: string; markerClassName: string }
> = {
  capture: {
    marker: '+',
    label: 'CAPTURED',
    markerClassName: 'border-fg text-fg',
  },
  takeover: {
    marker: '>',
    label: 'TOOK OVER',
    markerClassName: 'border-fg text-fg',
  },
  displacement: {
    marker: '!',
    label: 'LOST SECTOR',
    markerClassName: 'border-warning-strong text-warning',
  },
  reinforcement: {
    marker: '↑',
    label: 'REINFORCED',
    markerClassName: 'border-fg text-fg',
  },
  release: {
    marker: '−',
    label: 'RELEASED',
    markerClassName: 'border-line-strong text-fg-muted',
  },
  retirement: {
    marker: '×',
    label: 'RETIRED',
    markerClassName: 'border-warning-strong text-warning',
  },
  disqualification: {
    marker: '×',
    label: 'BACKING FAILURE',
    markerClassName: 'border-warning-strong text-warning',
  },
  relinquishment: {
    marker: '×',
    label: 'RELINQUISHED ALL',
    markerClassName: 'border-warning-strong text-warning',
  },
  yield_claim: {
    marker: '◇',
    label: 'YIELD CLAIMED',
    markerClassName: 'border-fg text-fg',
  },
};

type ActivityFilter = OperatorActivityType | 'all';

const activityFilterOptions: Array<{
  value: ActivityFilter;
  label: string;
}> = [
  { value: 'all', label: 'ALL EVENTS' },
  { value: 'capture', label: 'CAPTURED' },
  { value: 'takeover', label: 'TOOK OVER' },
  { value: 'displacement', label: 'LOST SECTOR' },
  { value: 'yield_claim', label: 'YIELD CLAIMED' },
  { value: 'reinforcement', label: 'REINFORCED' },
  { value: 'release', label: 'RELEASED' },
  { value: 'retirement', label: 'RETIRED' },
  { value: 'disqualification', label: 'BACKING FAILURE' },
  { value: 'relinquishment', label: 'RELINQUISHED ALL' },
];

function sectorLabel(id: number | undefined): string {
  return id === undefined ? '—' : `SECTOR-${id.toString().padStart(4, '0')}`;
}

function eventDetail(activity: OperatorActivity): string {
  switch (activity.type) {
    case 'capture':
      return 'NEUTRAL SECTOR';
    case 'takeover':
      return activity.secondaryAmount === undefined
        ? 'SECTOR TAKEN OVER'
        : `${formatStrk(activity.secondaryAmount)} FORCE RETURNED TO PREVIOUS OWNER`;
    case 'displacement':
      return 'FORCE RETURNED TO AVAILABLE';
    case 'reinforcement':
      return activity.secondaryAmount === undefined
        ? 'CAPTURE FORCE INCREASED'
        : `NEW FORCE ${formatStrk(activity.secondaryAmount)} FORCE`;
    case 'release':
      return 'CONTROL VOLUNTARILY RELEASED';
    case 'retirement':
      return 'ADDRESS PERMANENTLY RETIRED';
    case 'disqualification':
      return `ADDRESS RETIRED · ${activity.affectedSectorCount ?? 0} SECTORS INVALIDATED`;
    case 'relinquishment':
      return `${activity.affectedSectorCount ?? 0} SECTORS RELINQUISHED`;
    case 'yield_claim':
      return 'VALIDATOR REWARD TRANSFERRED';
  }
}

function stakeDetail(activity: OperatorActivity): string {
  const unit = activity.type === 'yield_claim' ? 'STRK' : 'FORCE';
  const amount = `${formatStrk(
    activity.amount,
    activity.type === 'yield_claim' ? 6 : 4
  )} ${unit}`;
  switch (activity.type) {
    case 'displacement':
      return `+${amount} RETURNED`;
    case 'release':
      return `${amount} PRIOR FORCE`;
    case 'retirement':
      return `${amount} INVALIDATED`;
    case 'reinforcement':
    case 'yield_claim':
      return `+${amount}`;
    case 'disqualification':
      return `${amount} BACKING INVALIDATED`;
    case 'relinquishment':
      return `${amount} RELINQUISHED`;
    default:
      return amount;
  }
}

function counterpartyDetail(activity: OperatorActivity): ReactNode {
  if (!activity.counterparty) return '—';
  const prefix =
    activity.type === 'yield_claim'
      ? 'TO'
      : activity.type === 'displacement'
        ? 'BY'
        : 'FROM';
  return (
    <>
      {prefix} <AddressLink address={activity.counterparty} />
    </>
  );
}

function mergeActivity(
  current: OperatorActivity[],
  incoming: OperatorActivity[]
): OperatorActivity[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  return [...byId.values()].sort(
    (left, right) =>
      right.blockNumber - left.blockNumber || right.eventIndex - left.eventIndex
  );
}

function takeActivityPage(activity: OperatorActivity[]): {
  visible: OperatorActivity[];
  pending: OperatorActivity[];
} {
  return {
    visible: activity.slice(0, VISIBLE_ACTIVITY_PAGE_SIZE),
    pending: activity.slice(VISIBLE_ACTIVITY_PAGE_SIZE),
  };
}

export function OperatorActivityTable({
  operator,
  variant = 'page',
}: OperatorActivityTableProps) {
  const [activity, setActivity] = useState<OperatorActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [cursor, setCursor] = useState<
    OperatorActivityFeedCursor | null | undefined
  >(undefined);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [hasPendingActivity, setHasPendingActivity] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [revision, setRevision] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const loadMoreArmedRef = useRef(true);
  const pendingActivityRef = useRef<OperatorActivity[]>([]);

  const refresh = useCallback(() => {
    loadMoreControllerRef.current?.abort();
    setRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadMoreControllerRef.current?.abort();
    setActivity(null);
    setError(null);
    setWarning(null);
    setCursor(undefined);
    setLoadMoreError(null);
    setIsLoadingMore(false);
    setHasPendingActivity(false);
    loadMoreArmedRef.current = true;
    pendingActivityRef.current = [];

    getOperatorActivityFeedPage(
      operator,
      undefined,
      controller.signal,
      activityFilter === 'all' ? undefined : activityFilter
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        const page = takeActivityPage(result.activity);
        pendingActivityRef.current = page.pending;
        setHasPendingActivity(page.pending.length > 0);
        setActivity(page.visible);
        setWarning(result.warning);
        setCursor(result.cursor);
      })
      .catch((activityError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            activityError instanceof Error
              ? activityError.message
              : 'Unable to read Operator activity.'
          );
        }
      });

    return () => controller.abort();
  }, [activityFilter, operator, revision]);

  const loadMore = useCallback(() => {
    if ((!cursor && !hasPendingActivity) || isLoadingMore) return;

    const revealActivity = (incoming: OperatorActivity[]) => {
      const page = takeActivityPage(
        mergeActivity(pendingActivityRef.current, incoming)
      );
      pendingActivityRef.current = page.pending;
      setHasPendingActivity(page.pending.length > 0);
      setActivity((current) => [...(current ?? []), ...page.visible]);
    };

    if (!cursor) {
      revealActivity([]);
      return;
    }

    const controller = new AbortController();
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = controller;
    setIsLoadingMore(true);
    setLoadMoreError(null);

    getOperatorActivityFeedPage(
      operator,
      cursor,
      controller.signal,
      activityFilter === 'all' ? undefined : activityFilter
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        revealActivity(result.activity);
        setCursor(result.cursor);
        if (result.warning) setWarning(result.warning);
      })
      .catch((activityError: unknown) => {
        if (!controller.signal.aborted) {
          setLoadMoreError(
            activityError instanceof Error
              ? activityError.message
              : 'Unable to read older Operator activity.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingMore(false);
      });
  }, [activityFilter, cursor, hasPendingActivity, isLoadingMore, operator]);

  const hasMoreActivity = Boolean(cursor) || hasPendingActivity;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMoreActivity || loadMoreError) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      if (!entry.isIntersecting) {
        loadMoreArmedRef.current = true;
        return;
      }
      if (!loadMoreArmedRef.current) return;
      loadMoreArmedRef.current = false;
      loadMore();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMoreActivity, loadMore, loadMoreError]);

  useEffect(
    () => () => {
      loadMoreControllerRef.current?.abort();
    },
    []
  );

  const filterControl = (
    <div className="flex flex-wrap items-center gap-2">
      <label>
        <span className="sr-only">Filter operator activity</span>
        <select
          value={activityFilter}
          onChange={(event) =>
            setActivityFilter(event.target.value as ActivityFilter)
          }
          className={fieldStyles({
            size: 'sm',
            className: 'w-auto text-fg-secondary',
          })}
        >
          {activityFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <section
      className={variant === 'page' ? 'mt-12 border-t border-line pt-6' : ''}
    >
      {variant === 'page' ? (
        <SectionHeading
          eyebrow="DOJO EVENT LOG"
          title="OPERATOR ACTIVITY"
          className="mb-4"
        >
          {filterControl}
        </SectionHeading>
      ) : (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <Eyebrow>ALL INDEXED OPERATOR EVENTS</Eyebrow>
          {filterControl}
        </div>
      )}

      {activity === null && !error && (
        <div className="flex items-center gap-3 border-y border-line py-10 text-label text-fg-subtle">
          <span className="h-1.5 w-1.5 animate-pulse bg-fg" />
          READING INDEXED EVENTS…
        </div>
      )}

      {error && (
        <Callout
          tone="warning"
          action={
            <Button variant="link" onClick={refresh}>
              RETRY EVENT READ
            </Button>
          }
        >
          {error}
        </Callout>
      )}

      {warning && !error && (
        <Callout tone="warning" className="mb-4">
          PARTIAL EVENT LOG · {warning}
        </Callout>
      )}

      {activity?.length === 0 && !error && (
        <div className="border-y border-line py-10 text-body text-fg-subtle">
          {activityFilter === 'all'
            ? 'No activity events recorded for this Operator yet.'
            : `No ${activityFilterOptions
                .find((option) => option.value === activityFilter)
                ?.label.toLowerCase()} events recorded for this Operator yet.`}
        </div>
      )}

      {activity && activity.length > 0 && !error && (
        <>
          <div className="activity-scrollbar overflow-x-auto border-l border-t border-line">
            <Table className="min-w-[760px]">
              <caption className="sr-only">
                Captures, takeovers, lost Sectors, reinforcements, releases,
                command resets, retirements, and yield claims for this Operator
              </caption>
              <TableHead>
                <tr>
                  <TableHeaderCell className={GRID_CELL_HEAD}>
                    EVENT
                  </TableHeaderCell>
                  <TableHeaderCell className={GRID_CELL_HEAD}>
                    TARGET
                  </TableHeaderCell>
                  <TableHeaderCell className={GRID_CELL_HEAD}>
                    VALUE
                  </TableHeaderCell>
                  <TableHeaderCell className={GRID_CELL_HEAD}>
                    COUNTERPARTY
                  </TableHeaderCell>
                  <TableHeaderCell numeric className={GRID_CELL_HEAD}>
                    BLOCK
                  </TableHeaderCell>
                </tr>
              </TableHead>
              <tbody>
                {activity.map((item) => {
                  const presentation = eventPresentation[item.type];
                  return (
                    <TableRow
                      key={item.id}
                      className="group transition-colors hover:bg-fg/[0.025]"
                    >
                      <TableCell className={GRID_CELL}>
                        <div className="flex items-start gap-3">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center border text-caption ${presentation.markerClassName}`}
                            aria-hidden="true"
                          >
                            {presentation.marker}
                          </span>
                          <div>
                            <div className="tracking-caps text-fg">
                              {presentation.label}
                            </div>
                            <div className="mt-1 text-tag text-fg-subtle">
                              {eventDetail(item)}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className={`${GRID_CELL} tracking-caps`}>
                        {sectorLabel(item.sectorId)}
                      </TableCell>
                      <TableCell className={GRID_CELL}>
                        {stakeDetail(item)}
                      </TableCell>
                      <TableCell className={`${GRID_CELL} text-fg-subtle`}>
                        {counterpartyDetail(item)}
                      </TableCell>
                      <TableCell numeric className={GRID_CELL}>
                        <ExternalLink
                          quiet
                          href={voyagerTransactionUrl(item.transactionHash)}
                          className="text-fg-subtle underline decoration-transparent underline-offset-4 group-hover:text-fg-secondary hover:decoration-fg-subtle"
                          aria-label={`Open transaction for block ${item.blockNumber} in Voyager`}
                        >
                          #{item.blockNumber.toLocaleString()}
                        </ExternalLink>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </tbody>
            </Table>
          </div>
          <div
            ref={loadMoreRef}
            className="flex min-h-16 items-center justify-center border-x border-b border-line px-4 py-4"
            aria-live="polite"
          >
            {isLoadingMore && (
              <div className="flex items-center gap-3 text-label text-fg-subtle">
                <span className="h-1.5 w-1.5 animate-pulse bg-fg" />
                READING OLDER EVENTS…
              </div>
            )}
            {loadMoreError && (
              <div className="text-center">
                <p className="text-caption text-warning">{loadMoreError}</p>
                <Button variant="link" onClick={loadMore} className="mt-2">
                  RETRY OLDER EVENTS
                </Button>
              </div>
            )}
            {!hasMoreActivity && !isLoadingMore && !loadMoreError && (
              <span className="text-label text-fg-subtle">
                END OF INDEXED LOG
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
