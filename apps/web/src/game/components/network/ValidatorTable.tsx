import { useMemo, useState } from 'react';
import type { StakingSnapshot, StakingValidator } from '../../types/staking';
import { cn } from '../../utils/cn';
import { shortAddress } from '../../utils/format';
import {
  formatAmount,
  formatCommission,
  formatDuration,
  formatPercent,
  parseAmount,
} from '../../utils/stakingFormat';
import { voyagerValidatorUrl } from '../../utils/voyager';
import { ExternalLink, SectionHeading } from './primitives';

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
    <section aria-labelledby="validators" className="border border-grid">
      <div className="border-b border-grid p-5 sm:p-6">
        <SectionHeading
          id="validators"
          eyebrow={`${snapshot.totals.activeValidators} ACTIVE · ${snapshot.totals.exitingValidators} EXITING`}
          title="VALIDATORS"
        >
          <label className="flex w-full items-center border border-neutral-700 focus-within:border-white sm:w-72">
            <span className="sr-only">Search validators by address</span>
            <span aria-hidden="true" className="px-3 text-neutral-600">
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
              className="min-w-0 flex-1 bg-black py-2 pr-3 text-[10px] tracking-[0.12em] text-white outline-none placeholder:text-neutral-600"
            />
          </label>
        </SectionHeading>
      </div>

      <div className="activity-scrollbar overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-[11px]">
          <thead className="text-[9px] tracking-[0.16em] text-neutral-500">
            <tr className="border-b border-grid">
              <th scope="col" className="w-12 px-4 py-3 font-normal">
                #
              </th>
              <th scope="col" className="px-2 py-3 font-normal">
                VALIDATOR
              </th>
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
          </thead>
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
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-8 text-center text-[10px] tracking-[0.16em] text-neutral-600"
                >
                  NO VALIDATORS MATCH
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-grid px-5 py-3 text-[9px] tracking-[0.16em] text-neutral-500">
        <span>
          APR IS FOR DELEGATORS AFTER COMMISSION, ASSUMING FULL ATTESTATION.
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            className="border border-grid px-3 py-1.5 text-neutral-300 hover:border-white disabled:text-neutral-700 disabled:hover:border-grid"
          >
            ← PREV
          </button>
          <span className="tabular-nums">
            {currentPage + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}
            disabled={currentPage >= pageCount - 1}
            className="border border-grid px-3 py-1.5 text-neutral-300 hover:border-white disabled:text-neutral-700 disabled:hover:border-grid"
          >
            NEXT →
          </button>
        </div>
      </div>
    </section>
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
    <th
      scope="col"
      aria-sort={
        active ? (sort.descending ? 'descending' : 'ascending') : 'none'
      }
      className="px-2 py-3 text-right font-normal"
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'tracking-[0.16em] transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-white',
          active && 'text-white'
        )}
      >
        {label}
        <span aria-hidden="true" className="ml-1 inline-block w-2">
          {active ? (sort.descending ? '↓' : '↑') : ''}
        </span>
      </button>
    </th>
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
    <tr
      className={cn(
        'border-b border-grid tabular-nums transition-colors hover:bg-white/[0.03]',
        pinned && 'bg-[#ff4a04]/[0.07] hover:bg-[#ff4a04]/[0.1]'
      )}
    >
      <td
        className={cn(
          'px-4 py-3',
          pinned ? 'text-[#ff6a2f]' : 'text-neutral-500'
        )}
      >
        {validator.rank ?? '—'}
      </td>
      <td className="px-2 py-3">
        <div className="flex items-center gap-2">
          {pinned ? (
            <span className="font-bold tracking-[-0.02em] text-white">
              STAKE<span className="text-dim">//</span>WARS
            </span>
          ) : null}
          <ExternalLink
            href={voyagerValidatorUrl(validator.address)}
            className={pinned ? 'text-[#ff6a2f]' : 'text-neutral-200'}
          >
            {shortAddress(validator.address)}
          </ExternalLink>
          {validator.status === 'exiting' ? (
            <span className="border border-amber-500/60 px-1.5 py-0.5 text-[8px] tracking-[0.16em] text-amber-400">
              EXITING
              {validator.unstakeAt && validator.unstakeAt > now
                ? ` ${formatDuration(validator.unstakeAt - now)}`
                : ''}
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-2 py-3 text-right text-white">
        {formatAmount(parseAmount(validator.totalStrk))}
      </td>
      <td className="px-2 py-3 text-right text-neutral-300">
        {btc > 0n ? formatAmount(btc) : '—'}
      </td>
      <td className="px-2 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <span className="text-neutral-200">
            {validator.status === 'active'
              ? formatPercent(validator.stakingPowerPercent)
              : '—'}
          </span>
          <span
            aria-hidden="true"
            className="hidden h-1 w-12 bg-neutral-900 sm:block"
          >
            <span
              className={cn(
                'block h-full',
                pinned ? 'bg-[#ff4a04]' : 'bg-neutral-400'
              )}
              style={{
                width: `${Math.min(100, validator.stakingPowerPercent * 4)}%`,
              }}
            />
          </span>
        </div>
      </td>
      <td className="px-2 py-3 text-right text-neutral-300">
        {formatCommission(validator.commissionBps)}
      </td>
      <td className="px-2 py-3 text-right text-neutral-200">
        {formatPercent(validator.aprStrkPercent)}
      </td>
      <td className="px-2 py-3 text-right text-neutral-300">
        {validator.delegators === null
          ? '…'
          : validator.delegators.toLocaleString('en-US')}
      </td>
      <td className="px-2 py-3 pr-4 text-right text-amber-300/90">
        {pending > 0n ? (
          formatAmount(pending)
        ) : (
          <span className="text-neutral-700">—</span>
        )}
      </td>
    </tr>
  );
}
