import { useEffect, useState } from 'react';
import type { StakingSnapshot } from '../../types/staking';
import {
  amountToNumber,
  formatAmount,
  formatDuration,
  formatPercent,
  formatUsd,
  normalizeTokenAmount,
  parseAmount,
} from '../../utils/stakingFormat';
import { StatCell } from './primitives';

export function NetworkOverview({ snapshot }: { snapshot: StakingSnapshot }) {
  const { totals, prices, apr } = snapshot;
  const strkStaked = parseAmount(totals.strkStaked);
  const btcStaked = parseAmount(totals.btcStaked);
  const strkPending = parseAmount(totals.strkPending);
  const btcPending = parseAmount(totals.btcPending);
  const strkUsd = prices ? amountToNumber(strkStaked) * prices.strkUsd : null;
  const btcUsd = prices ? amountToNumber(btcStaked) * prices.btcUsd : null;

  return (
    <section aria-label="Network totals">
      <div className="grid grid-cols-2 border-l border-t border-grid lg:grid-cols-4">
        <StatCell
          label="TOTAL STAKED"
          value={formatAmount(strkStaked)}
          unit="STRK"
          detail={strkUsd === null ? undefined : `≈ ${formatUsd(strkUsd)}`}
          emphasis
        />
        <StatCell
          label="BTC STAKED"
          value={formatAmount(btcStaked)}
          unit="BTC"
          detail={btcUsd === null ? undefined : `≈ ${formatUsd(btcUsd)}`}
          emphasis
        />
        <StatCell
          label="PENDING UNSTAKE"
          value={
            <span className="text-amber-300">{formatAmount(strkPending)}</span>
          }
          unit="STRK"
          detail={`+ ${formatAmount(btcPending)} BTC · ${snapshot.unstaking.pendingExits.toLocaleString('en-US')} EXITS`}
          emphasis
        />
        <StatCell
          label="TOTAL VALUE LOCKED"
          value={
            strkUsd === null || btcUsd === null
              ? '—'
              : formatUsd(strkUsd + btcUsd)
          }
          detail={
            prices
              ? `STRK ${formatUsd(prices.strkUsd)} · BTC ${formatUsd(prices.btcUsd)}`
              : 'PRICE ORACLE UNAVAILABLE'
          }
          emphasis
        />
        <StatCell
          label="VALIDATORS"
          value={totals.activeValidators.toLocaleString('en-US')}
          detail={
            totals.exitingValidators > 0
              ? `${totals.exitingValidators} EXITING`
              : 'NONE EXITING'
          }
        />
        <StatCell
          label="DELEGATORS"
          value={
            totals.delegators === null
              ? 'INDEXING'
              : totals.delegators.toLocaleString('en-US')
          }
          detail="UNIQUE ADDRESSES, ACTIVE OR EXITING"
        />
        <StatCell
          label="MAX APR"
          value={formatPercent(apr.maxStrkPercent)}
          unit="STRK"
          detail={
            apr.maxBtcPercent === null
              ? 'AT 0% COMMISSION'
              : `${formatPercent(apr.maxBtcPercent)} BTC · AT 0% COMMISSION`
          }
        />
        <EpochCell snapshot={snapshot} />
      </div>
      <TokenBreakdown snapshot={snapshot} />
    </section>
  );
}

function TokenBreakdown({ snapshot }: { snapshot: StakingSnapshot }) {
  const btcTotal = parseAmount(snapshot.totals.btcStaked);
  const tokens = snapshot.tokens
    .map((token) => ({
      ...token,
      staked: normalizeTokenAmount(parseAmount(token.staked), token.decimals),
      pending: normalizeTokenAmount(parseAmount(token.pending), token.decimals),
    }))
    .sort((left, right) =>
      left.kind !== right.kind
        ? left.kind === 'strk'
          ? -1
          : 1
        : right.staked > left.staked
          ? 1
          : right.staked < left.staked
            ? -1
            : 0
    );

  return (
    <div className="border-b border-l border-r border-grid">
      <div className="px-4 pt-3 text-[9px] tracking-[0.2em] text-neutral-500">
        STAKED BY TOKEN
      </div>
      <ul className="grid gap-x-6 px-4 pb-3 sm:grid-cols-2 lg:grid-cols-3">
        {tokens.map((token) => {
          const share =
            token.kind === 'btc' && btcTotal > 0n
              ? Number((token.staked * 10_000n) / btcTotal) / 100
              : null;
          return (
            <li
              key={token.address}
              className="flex items-center gap-3 border-b border-grid py-2 text-[10px] last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:[&:nth-last-child(-n+3)]:border-b-0"
            >
              <span className="w-16 shrink-0 tracking-[0.14em] text-neutral-300">
                {token.symbol}
              </span>
              <span className="min-w-0 flex-1">
                {share !== null ? (
                  <span aria-hidden="true" className="block h-1 bg-neutral-900">
                    <span
                      className="block h-full bg-neutral-400"
                      style={{ width: `${share}%` }}
                    />
                  </span>
                ) : null}
              </span>
              <span className="text-right tabular-nums text-white">
                {formatAmount(token.staked)}
                {share !== null ? (
                  <span className="ml-2 text-neutral-500">
                    {share.toFixed(1)}%
                  </span>
                ) : null}
                {!token.active ? (
                  <span className="ml-2 border border-neutral-700 px-1 text-[8px] tracking-[0.14em] text-neutral-500">
                    DISABLED
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EpochCell({ snapshot }: { snapshot: StakingSnapshot }) {
  const { epoch } = snapshot;
  const [now, setNow] = useState(() => Date.now() / 1_000);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() / 1_000), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, epoch.estimatedEndAt - now);
  const progress = Math.min(
    100,
    Math.max(
      0,
      ((epoch.durationSeconds - remaining) /
        Math.max(1, epoch.durationSeconds)) *
        100
    )
  );

  return (
    <div className="border-b border-r border-grid px-4 py-4">
      <div className="text-[9px] tracking-[0.2em] text-neutral-500">EPOCH</div>
      <div className="mt-2 text-lg text-neutral-200">
        #{epoch.id.toLocaleString('en-US')}
      </div>
      <div
        className="mt-2 h-1.5 border border-neutral-700"
        role="progressbar"
        aria-label="Epoch progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div className="h-full bg-white" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-1.5 text-[10px] tracking-[0.06em] text-neutral-500">
        {remaining > 0
          ? `NEXT IN ≈${formatDuration(remaining)}`
          : 'NEXT EPOCH STARTING'}
      </div>
    </div>
  );
}
