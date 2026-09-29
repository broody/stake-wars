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
import { Badge, Eyebrow, Panel, Stat, StatGrid } from '../../../ui';

export function NetworkOverview({ snapshot }: { snapshot: StakingSnapshot }) {
  const { totals, prices, apr } = snapshot;
  const strkStaked = parseAmount(totals.strkStaked);
  const btcStaked = parseAmount(totals.btcStaked);
  const strkPending = parseAmount(totals.strkPending);
  const btcPending = parseAmount(totals.btcPending);
  const strkUsd = prices ? amountToNumber(strkStaked) * prices.strkUsd : null;
  const btcUsd = prices ? amountToNumber(btcStaked) * prices.btcUsd : null;

  return (
    <Panel aria-label="Network totals">
      <StatGrid className="grid-cols-2 border-b border-line lg:grid-cols-4">
        <Stat
          label="TOTAL STAKED"
          value={formatAmount(strkStaked)}
          unit="STRK"
          detail={strkUsd === null ? undefined : `≈ ${formatUsd(strkUsd)}`}
          emphasis
        />
        <Stat
          label="BTC STAKED"
          value={formatAmount(btcStaked)}
          unit="BTC"
          detail={btcUsd === null ? undefined : `≈ ${formatUsd(btcUsd)}`}
          emphasis
        />
        <Stat
          label="PENDING UNSTAKE"
          value={
            <span className="text-warning">{formatAmount(strkPending)}</span>
          }
          unit="STRK"
          detail={`+ ${formatAmount(btcPending)} BTC · ${snapshot.unstaking.pendingExits.toLocaleString('en-US')} EXITS`}
          emphasis
        />
        <Stat
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
        <Stat
          label="VALIDATORS"
          value={totals.activeValidators.toLocaleString('en-US')}
          detail={
            totals.exitingValidators > 0
              ? `${totals.exitingValidators} EXITING`
              : 'NONE EXITING'
          }
        />
        <Stat
          label="DELEGATORS"
          value={
            totals.delegators === null
              ? 'INDEXING'
              : totals.delegators.toLocaleString('en-US')
          }
          detail="UNIQUE ADDRESSES, ACTIVE OR EXITING"
        />
        <Stat
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
      </StatGrid>
      <TokenBreakdown snapshot={snapshot} />
    </Panel>
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
    <div>
      <Eyebrow className="px-4 pt-4">STAKED BY TOKEN</Eyebrow>
      <ul className="grid gap-x-8 px-4 pb-3 pt-1 sm:grid-cols-2 lg:grid-cols-3">
        {tokens.map((token) => {
          const share =
            token.kind === 'btc' && btcTotal > 0n
              ? Number((token.staked * 10_000n) / btcTotal) / 100
              : null;
          return (
            <li
              key={token.address}
              className="flex items-center gap-3 border-b border-line py-2 text-caption last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:[&:nth-last-child(-n+3)]:border-b-0"
            >
              <span className="w-16 shrink-0 tracking-caps text-fg-secondary">
                {token.symbol}
              </span>
              <span className="min-w-0 flex-1">
                {share !== null ? (
                  <span
                    aria-hidden="true"
                    className="block h-1 bg-surface-hover"
                  >
                    <span
                      className="block h-full bg-fg-muted"
                      style={{ width: `${share}%` }}
                    />
                  </span>
                ) : null}
              </span>
              <span className="text-right tabular-nums text-fg">
                {formatAmount(token.staked)}
                {share !== null ? (
                  <span className="ml-2 text-fg-subtle">
                    {share.toFixed(1)}%
                  </span>
                ) : null}
                {!token.active ? (
                  <Badge className="ml-2">DISABLED</Badge>
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
    <div className="px-4 py-4">
      <div className="text-label text-fg-subtle">EPOCH</div>
      <div className="mt-2 text-figure-sm tabular-nums text-fg-secondary">
        #{epoch.id.toLocaleString('en-US')}
      </div>
      <div
        className="mt-2 h-1.5 border border-line-strong"
        role="progressbar"
        aria-label="Epoch progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div className="h-full bg-fg" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-1.5 text-caption text-fg-subtle">
        {remaining > 0
          ? `NEXT IN ≈${formatDuration(remaining)}`
          : 'NEXT EPOCH STARTING'}
      </div>
    </div>
  );
}
