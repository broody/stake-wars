import { useCallback, useEffect, useRef, useState } from 'react';
import type { OperatorActivity, OperatorActivityType } from '../../types';
import {
  getOperatorActivityFeedPage,
  type OperatorActivityFeedCursor,
} from '../../services/torii';
import { formatStrk, shortAddress } from '../../utils/format';
import { voyagerTransactionUrl } from '../../utils/voyager';

interface OperatorActivityTableProps {
  operator: string;
  variant?: 'page' | 'modal';
}

const VISIBLE_ACTIVITY_PAGE_SIZE = 20;

const eventPresentation: Record<
  OperatorActivityType,
  { marker: string; label: string; markerClassName: string }
> = {
  capture: {
    marker: '+',
    label: 'CAPTURED',
    markerClassName: 'border-white text-white',
  },
  loss: {
    marker: '!',
    label: 'LOST CHALLENGE',
    markerClassName: 'border-amber-500 text-amber-400',
  },
  reinforcement: {
    marker: '↑',
    label: 'REINFORCED',
    markerClassName: 'border-white text-white',
  },
  release: {
    marker: '−',
    label: 'RELEASED',
    markerClassName: 'border-neutral-600 text-neutral-400',
  },
  challenge_initiated: {
    marker: '>',
    label: 'INITIATED CHALLENGE',
    markerClassName: 'border-white text-white',
  },
  challenge_escalated: {
    marker: '↑',
    label: 'ESCALATED CHALLENGE',
    markerClassName: 'border-white text-white',
  },
  settlement: {
    marker: '◆',
    label: 'SETTLED',
    markerClassName: 'border-white text-white',
  },
  retirement: {
    marker: '×',
    label: 'RETIRED',
    markerClassName: 'border-amber-500 text-amber-400',
  },
  disqualification: {
    marker: '×',
    label: 'BACKING FAILURE',
    markerClassName: 'border-amber-500 text-amber-400',
  },
  relinquishment: {
    marker: '×',
    label: 'RELINQUISHED ALL',
    markerClassName: 'border-amber-500 text-amber-400',
  },
  yield_claim: {
    marker: '◇',
    label: 'YIELD CLAIMED',
    markerClassName: 'border-white text-white',
  },
};

type ActivityFilter = OperatorActivityType | 'all';

const activityFilterOptions: Array<{
  value: ActivityFilter;
  label: string;
}> = [
  { value: 'all', label: 'ALL EVENTS' },
  { value: 'capture', label: 'CAPTURED' },
  { value: 'loss', label: 'LOST CHALLENGE' },
  { value: 'yield_claim', label: 'YIELD CLAIMED' },
  { value: 'reinforcement', label: 'REINFORCED' },
  { value: 'release', label: 'RELEASED' },
  { value: 'challenge_initiated', label: 'INITIATED CHALLENGE' },
  { value: 'challenge_escalated', label: 'ESCALATED CHALLENGE' },
  { value: 'settlement', label: 'SETTLED' },
  { value: 'retirement', label: 'RETIRED' },
  { value: 'disqualification', label: 'BACKING FAILURE' },
  { value: 'relinquishment', label: 'RELINQUISHED ALL' },
];

function pointLabel(id: number | undefined): string {
  return id === undefined ? '—' : `CP-${id.toString().padStart(4, '0')}`;
}

function eventDetail(activity: OperatorActivity): string {
  switch (activity.type) {
    case 'capture':
      return activity.counterparty ? 'TOOK HIGH GROUND' : 'NEUTRAL POINT';
    case 'loss':
      return 'FINAL COMMITMENT SPENT AT SETTLEMENT';
    case 'reinforcement':
      return activity.secondaryAmount === undefined
        ? 'CAPTURE FORCE INCREASED'
        : `NEW FORCE ${formatStrk(activity.secondaryAmount)} STRK`;
    case 'release':
      return 'CONTROL VOLUNTARILY RELEASED';
    case 'challenge_initiated':
      return 'PUBLIC CHALLENGE OPENED';
    case 'challenge_escalated':
      return 'NEW LEADER ESTABLISHED';
    case 'settlement':
      return 'CHALLENGE FINALIZED';
    case 'retirement':
      return 'ADDRESS PERMANENTLY RETIRED';
    case 'disqualification':
      return `ADDRESS RETIRED · ${activity.affectedPointCount ?? 0} POINTS INVALIDATED`;
    case 'relinquishment':
      return `${activity.affectedPointCount ?? 0} POINTS RELINQUISHED`;
    case 'yield_claim':
      return 'VALIDATOR REWARD TRANSFERRED';
  }
}

function stakeDetail(activity: OperatorActivity): string {
  const amount = `${formatStrk(
    activity.amount,
    activity.type === 'yield_claim' ? 6 : 4
  )} STRK`;
  switch (activity.type) {
    case 'loss':
      return `${amount} DEFEATED`;
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

function counterpartyDetail(activity: OperatorActivity): string {
  if (!activity.counterparty) return '—';
  if (activity.type === 'yield_claim') {
    return `TO ${shortAddress(activity.counterparty)}`;
  }
  const prefix = activity.type === 'loss' ? 'BY' : 'FROM';
  return `${prefix} ${shortAddress(activity.counterparty)}`;
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

  return (
    <section
      className={variant === 'page' ? 'mt-12 border-t border-grid pt-6' : ''}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        {variant === 'page' ? (
          <div>
            <div className="text-[10px] tracking-[0.24em] text-dim">
              DOJO EVENT LOG
            </div>
            <h2 className="mt-2 text-lg tracking-widest text-white">
              OPERATOR ACTIVITY
            </h2>
          </div>
        ) : (
          <div className="text-[9px] tracking-[0.2em] text-neutral-600">
            ALL INDEXED OPERATOR EVENTS
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label>
            <span className="sr-only">Filter operator activity</span>
            <select
              value={activityFilter}
              onChange={(event) =>
                setActivityFilter(event.target.value as ActivityFilter)
              }
              className="border border-neutral-700 bg-black px-3 py-2 text-[10px] tracking-[0.16em] text-neutral-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {activityFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {activity === null && !error && (
        <div className="flex items-center gap-3 border-y border-grid py-10 text-xs tracking-wider text-dim">
          <span className="h-1.5 w-1.5 animate-pulse bg-white" />
          READING INDEXED EVENTS…
        </div>
      )}

      {error && (
        <div className="border border-amber-500/40 p-4 text-xs">
          <p className="text-amber-400">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-3 text-[10px] tracking-[0.2em] text-white underline decoration-neutral-700 underline-offset-4 hover:decoration-white"
          >
            RETRY EVENT READ
          </button>
        </div>
      )}

      {warning && !error && (
        <div className="mb-4 border-l-2 border-amber-400 pl-3 text-[10px] leading-relaxed text-amber-400">
          PARTIAL EVENT LOG · {warning}
        </div>
      )}

      {activity?.length === 0 && !error && (
        <div className="border-y border-grid py-10 text-sm text-neutral-500">
          {activityFilter === 'all'
            ? 'No activity events recorded for this Operator yet.'
            : `No ${activityFilterOptions
                .find((option) => option.value === activityFilter)
                ?.label.toLowerCase()} events recorded for this Operator yet.`}
        </div>
      )}

      {activity && activity.length > 0 && !error && (
        <>
          <div className="activity-scrollbar overflow-x-auto border-l border-t border-grid">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <caption className="sr-only">
                Captures, challenges, reinforcements, releases, command resets,
                retirements, and yield claims for this Operator
              </caption>
              <thead>
                <tr className="text-[9px] tracking-[0.2em] text-dim">
                  <th className="border-b border-r border-grid px-4 py-3 font-normal">
                    EVENT
                  </th>
                  <th className="border-b border-r border-grid px-4 py-3 font-normal">
                    TARGET
                  </th>
                  <th className="border-b border-r border-grid px-4 py-3 font-normal">
                    VALUE
                  </th>
                  <th className="border-b border-r border-grid px-4 py-3 font-normal">
                    COUNTERPARTY
                  </th>
                  <th className="border-b border-r border-grid px-4 py-3 text-right font-normal">
                    BLOCK
                  </th>
                </tr>
              </thead>
              <tbody>
                {activity.map((item) => {
                  const presentation = eventPresentation[item.type];
                  return (
                    <tr
                      key={item.id}
                      className="group text-xs transition-colors hover:bg-white/[0.025]"
                    >
                      <td className="border-b border-r border-grid px-4 py-4">
                        <div className="flex items-start gap-3">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center border text-xs ${presentation.markerClassName}`}
                            aria-hidden="true"
                          >
                            {presentation.marker}
                          </span>
                          <div>
                            <div className="tracking-wider text-white">
                              {presentation.label}
                            </div>
                            <div className="mt-1 text-[9px] tracking-wider text-dim">
                              {eventDetail(item)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-r border-grid px-4 py-4 tracking-wider text-neutral-300">
                        {pointLabel(item.controlPointId)}
                      </td>
                      <td className="border-b border-r border-grid px-4 py-4 text-neutral-300">
                        {stakeDetail(item)}
                      </td>
                      <td className="border-b border-r border-grid px-4 py-4 text-neutral-500">
                        {counterpartyDetail(item)}
                      </td>
                      <td className="border-b border-r border-grid px-4 py-4 text-right">
                        <a
                          href={voyagerTransactionUrl(item.transactionHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-neutral-500 underline decoration-transparent underline-offset-4 transition-colors group-hover:text-neutral-300 hover:decoration-neutral-500 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
                          aria-label={`Open transaction for block ${item.blockNumber} in Voyager`}
                        >
                          #{item.blockNumber.toLocaleString()} ↗
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            ref={loadMoreRef}
            className="flex min-h-16 items-center justify-center border-x border-b border-grid px-4 py-4"
            aria-live="polite"
          >
            {isLoadingMore && (
              <div className="flex items-center gap-3 text-[10px] tracking-[0.2em] text-dim">
                <span className="h-1.5 w-1.5 animate-pulse bg-white" />
                READING OLDER EVENTS…
              </div>
            )}
            {loadMoreError && (
              <div className="text-center">
                <p className="text-[10px] text-amber-400">{loadMoreError}</p>
                <button
                  type="button"
                  onClick={loadMore}
                  className="mt-2 text-[10px] tracking-[0.2em] text-white underline decoration-neutral-700 underline-offset-4 hover:decoration-white"
                >
                  RETRY OLDER EVENTS
                </button>
              </div>
            )}
            {!hasMoreActivity && !isLoadingMore && !loadMoreError && (
              <span className="text-[9px] tracking-[0.2em] text-neutral-600">
                END OF INDEXED LOG
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
