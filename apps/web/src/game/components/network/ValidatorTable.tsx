import { useMemo, useState } from 'react';
import type { StakingSnapshot, StakingValidator } from '../../types/staking';
import { shortAddress } from '../../utils/format';
import {
  formatAmount,
  formatCommission,
  formatDuration,
  formatPercent,
  parseAmount,
} from '../../utils/stakingFormat';
import { voyagerValidatorUrl } from '../../utils/voyager';
import {
  Badge,
  Button,
  cn,
  ExternalLink,
  Panel,
  PanelSection,
  SectionHeading,
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../../ui';

type SortKey =
  | 'power'
  | 'stake'
  | 'btc'
  | 'commission'
  | 'apr'
  | 'delegators'
  | 'pending';

const PAGE_SIZE = 25;

const sortValue: Record<
  SortKey,
  (validator: StakingValidator) => number | bigint
> = {
  power: (validator) => validator.stakingPowerPercent,
  stake: (validator) => parseAmount(validator.totalStrk),
  btc: (validator) => parseAmount(validator.delegatedBtc),
  commission: (validator) =>
    validator.commissionBps ?? Number.POSITIVE_INFINITY,
  apr: (validator) => validator.aprStrkPercent ?? -1,
  delegators: (validator) => validator.delegators ?? -1,
  pending: (validator) => parseAmount(validator.pendingStrk),
};

// Addresses arrive as minimal hex; accept zero-padded input too.
function searchNeedle(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/^0x0+(?=[0-9a-f])/, '0x');
}

function compare(left: number | bigint, right: number | bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function ValidatorTable({ snapshot }: { snapshot: StakingSnapshot }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: 'power',
    descending: true,
  });
  const [page, setPage] = useState(0);
  const featured = snapshot.featured;

  const rows = useMemo(() => {
    const needle = searchNeedle(query);
    const matches = snapshot.validators.filter(
      (validator) =>
        !validator.featured &&
        (!needle ||
          validator.address.includes(needle) ||
          validator.rewardAddress.includes(needle) ||
          validator.pools.some((pool) => pool.address.includes(needle)))
    );
    const read = sortValue[sort.key];
    return matches.sort((left, right) => {
      // Exiting validators have no staking power; keep them after the active set.
      if (left.status !== right.status)
        return left.status === 'active' ? -1 : 1;
      const order = compare(read(left), read(right));
      return sort.descending ? -order : order;
    });
  }, [query, snapshot.validators, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = rows.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );
  const showFeatured =
    featured &&
    (!searchNeedle(query) ||
      featured.address.includes(searchNeedle(query)) ||
      'stake wars'.includes(searchNeedle(query)));

  const toggleSort = (key: SortKey) => {
    setPage(0);
    setSort((current) =>
      current.key === key
        ? { key, descending: !current.descending }
        : { key, descending: key !== 'commission' }
    );
  };

  return (
    <Panel aria-labelledby="validators">
      <PanelSection>
        <SectionHeading
          id="validators"
          eyebrow={`${snapshot.totals.activeValidators} ACTIVE · ${snapshot.totals.exitingValidators} EXITING`}
          title="VALIDATORS"
        >
          <label className="flex w-full items-center border border-line-strong focus-within:border-fg sm:w-72">
            <span className="sr-only">Search validators by address</span>
            <span aria-hidden="true" className="px-3 text-fg-subtle">
              ⌕
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="SEARCH ADDRESS OR POOL"
              className="min-w-0 flex-1 bg-surface py-2 pr-3 text-label text-fg outline-none placeholder:text-fg-subtle"
            />
          </label>
        </SectionHeading>
      </PanelSection>

      <div className="activity-scrollbar overflow-x-auto">
        <Table className="min-w-[980px]">
          <TableHead>
            <tr>
              <TableHeaderCell className="w-12 py-3 pl-5">#</TableHeaderCell>
              <TableHeaderCell className="py-3">VALIDATOR</TableHeaderCell>
              <SortHeader
                label="STAKE (STRK)"
                sortKey="stake"
                sort={sort}
                onSort={toggleSort}
              />
              <SortHeader
                label="BTC"
                sortKey="btc"
                sort={sort}
                onSort={toggleSort}
              />
              <SortHeader
                label="POWER"
                sortKey="power"
                sort={sort}
                onSort={toggleSort}
              />
              <SortHeader
                label="COMMISSION"
                sortKey="commission"
                sort={sort}
                onSort={toggleSort}
              />
              <SortHeader
                label="APR"
                sortKey="apr"
                sort={sort}
                onSort={toggleSort}
              />
              <SortHeader
                label="DELEGATORS"
                sortKey="delegators"
                sort={sort}
                onSort={toggleSort}
              />
              <SortHeader
                label="EXITING"
                sortKey="pending"
                sort={sort}
                onSort={toggleSort}
              />
            </tr>
          </TableHead>
          <tbody>
            {showFeatured && featured ? (
              <ValidatorRow
                validator={featured}
                now={snapshot.block.timestamp}
                pinned
              />
            ) : null}
            {visible.map((validator) => (
              <ValidatorRow
                key={validator.address}
                validator={validator}
                now={snapshot.block.timestamp}
              />
            ))}
            {visible.length === 0 && !showFeatured ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-8 text-center text-label text-fg-subtle"
                >
                  NO VALIDATORS MATCH
                </TableCell>
              </TableRow>
            ) : null}
          </tbody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
        <span className="text-caption text-fg-subtle">
          APR is for delegators after commission, assuming full attestation.
        </span>
        <div className="flex items-center gap-3 text-label text-fg-subtle">
          <Button
            size="sm"
            onClick={() => setPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
          >
            ← PREV
          </Button>
          <span className="tabular-nums">
            {currentPage + 1} / {pageCount}
          </span>
          <Button
            size="sm"
            onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}
            disabled={currentPage >= pageCount - 1}
          >
            NEXT →
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; descending: boolean };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <TableHeaderCell
      numeric
      aria-sort={
        active ? (sort.descending ? 'descending' : 'ascending') : 'none'
      }
      className="py-3"
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn('transition-colors hover:text-fg', active && 'text-fg')}
      >
        {label}
        <span aria-hidden="true" className="ml-1 inline-block w-2">
          {active ? (sort.descending ? '↓' : '↑') : ''}
        </span>
      </button>
    </TableHeaderCell>
  );
}

function ValidatorRow({
  validator,
  now,
  pinned = false,
}: {
  validator: StakingValidator;
  now: number;
  pinned?: boolean;
}) {
  const btc = parseAmount(validator.delegatedBtc);
  const pending = parseAmount(validator.pendingStrk);
  return (
    <TableRow
      className={cn(
        'tabular-nums transition-colors hover:bg-fg/[0.03]',
        pinned && 'bg-accent/[0.07] hover:bg-accent/[0.1]'
      )}
    >
      <TableCell
        className={cn('py-3 pl-5', pinned ? 'text-accent' : 'text-fg-subtle')}
      >
        {validator.rank ?? '—'}
      </TableCell>
      <TableCell className="py-3">
        <div className="flex items-center gap-2">
          {pinned ? (
            <span className="font-bold tracking-tight text-fg">
              STAKE<span className="text-fg-disabled">//</span>WARS
            </span>
          ) : null}
          <ExternalLink
            href={voyagerValidatorUrl(validator.address)}
            className={pinned ? 'text-accent' : undefined}
          >
            {shortAddress(validator.address)}
          </ExternalLink>
          {validator.status === 'exiting' ? (
            <Badge tone="warning">
              EXITING
              {validator.unstakeAt && validator.unstakeAt > now
                ? ` ${formatDuration(validator.unstakeAt - now)}`
                : ''}
            </Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell numeric className="py-3 text-fg">
        {formatAmount(parseAmount(validator.totalStrk))}
      </TableCell>
      <TableCell numeric className="py-3">
        {btc > 0n ? formatAmount(btc) : '—'}
      </TableCell>
      <TableCell numeric className="py-3">
        <div className="flex items-center justify-end gap-2">
          <span className="text-fg-secondary">
            {validator.status === 'active'
              ? formatPercent(validator.stakingPowerPercent)
              : '—'}
          </span>
          <span
            aria-hidden="true"
            className="hidden h-1 w-12 bg-surface-hover sm:block"
          >
            <span
              className={cn(
                'block h-full',
                pinned ? 'bg-accent' : 'bg-fg-muted'
              )}
              style={{
                width: `${Math.min(100, validator.stakingPowerPercent * 4)}%`,
              }}
            />
          </span>
        </div>
      </TableCell>
      <TableCell numeric className="py-3">
        {formatCommission(validator.commissionBps)}
      </TableCell>
      <TableCell numeric className="py-3">
        {formatPercent(validator.aprStrkPercent)}
      </TableCell>
      <TableCell numeric className="py-3">
        {validator.delegators === null
          ? '…'
          : validator.delegators.toLocaleString('en-US')}
      </TableCell>
      <TableCell numeric className="py-3 pr-5 text-warning">
        {pending > 0n ? (
          formatAmount(pending)
        ) : (
          <span className="text-fg-disabled">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
