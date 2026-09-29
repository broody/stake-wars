import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type {
  StakingHistoryPoint,
  StakingSnapshot,
  StakingValidator,
} from '../../types/staking';
import { shortAddress } from '../../utils/format';
import {
  amountToNumber,
  formatAmount,
  formatCommission,
  formatDuration,
  formatPercent,
  formatUsd,
  parseAmount,
} from '../../utils/stakingFormat';
import { voyagerValidatorUrl } from '../../utils/voyager';
import { chartColors, plottablePoints } from '../../utils/stakingChart';
import { Sparkline } from './charts';
import { ExternalLink, StatCell } from './primitives';

const TREND_DAYS = 90;

export function FeaturedValidatorPanel({
  snapshot,
  history,
}: {
  snapshot: StakingSnapshot;
  history: StakingHistoryPoint[];
}) {
  const validator = snapshot.featured;
  const trend = useMemo(() => {
    const since = snapshot.block.timestamp - TREND_DAYS * 86_400;
    return plottablePoints(history)
      .filter(
        (point) => point.timestamp >= since && point.featuredStrk !== null
      )
      .map((point) => ({
        t: point.timestamp,
        v: amountToNumber(parseAmount(point.featuredStrk)),
      }));
  }, [history, snapshot.block.timestamp]);

  if (!validator) {
    return (
      <section className="border border-[#ff4a04]/60 bg-[#ff4a04]/[0.05] p-5 text-[10px] tracking-[0.16em] text-neutral-400">
        {snapshot.index.stakingSynced
          ? 'THE STAKE WARS VALIDATOR IS NOT IN THE VALIDATOR SET'
          : 'LOCATING THE STAKE WARS VALIDATOR WHILE THE STAKING INDEX CATCHES UP…'}
      </section>
    );
  }

  const totalStrk = parseAmount(validator.totalStrk);
  const delegatedBtc = parseAmount(validator.delegatedBtc);
  const pendingStrk = parseAmount(validator.pendingStrk);
  const trendChange =
    trend.length > 1 && trend[0].v > 0
      ? ((trend[trend.length - 1].v - trend[0].v) / trend[0].v) * 100
      : null;
  const usd = snapshot.prices
    ? amountToNumber(totalStrk) * snapshot.prices.strkUsd +
      amountToNumber(delegatedBtc) * snapshot.prices.btcUsd
    : null;

  return (
    <section
      aria-labelledby="featured-validator"
      className="border border-[#ff4a04]/60 bg-[#ff4a04]/[0.04]"
    >
      <div className="flex flex-col gap-5 border-b border-[#ff4a04]/20 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] tracking-[0.22em] text-[#ff6a2f]">
            <span>OUR VALIDATOR</span>
            {validator.rank !== null ? (
              <span className="text-neutral-400">
                RANK #{validator.rank} OF {snapshot.totals.activeValidators}
              </span>
            ) : null}
            <ValidatorStatus
              validator={validator}
              now={snapshot.block.timestamp}
            />
          </div>
          <h2
            id="featured-validator"
            className="mt-2 text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl"
          >
            STAKE<span className="text-dim">//</span>WARS
          </h2>
          <div className="mt-2 text-[10px] tracking-[0.1em] text-neutral-500">
            <span title={validator.address}>
              {shortAddress(validator.address)}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            to="/staking"
            className="border border-white bg-white px-5 py-3 text-center text-[10px] font-semibold tracking-[0.2em] text-black transition-colors hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            STAKE WITH STAKE WARS →
          </Link>
          <ExternalLink
            href={voyagerValidatorUrl(validator.address)}
            className="border border-[#ff4a04]/60 px-5 py-3 text-center text-[10px] tracking-[0.2em] text-[#ff6a2f] hover:border-[#ff4a04]"
          >
            VOYAGER
          </ExternalLink>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-[#ff4a04]/20 sm:grid-cols-3 xl:grid-cols-6 [&>*]:border-0 [&>*]:bg-[#0a0300]">
        <StatCell
          label="TOTAL STAKE"
          value={formatAmount(totalStrk)}
          unit="STRK"
          detail={
            usd === null
              ? undefined
              : `≈ ${formatUsd(usd)}${delegatedBtc > 0n ? ' INCL. BTC' : ''}`
          }
          emphasis
        />
        <StatCell
          label="BTC DELEGATED"
          value={formatAmount(delegatedBtc)}
          unit="BTC"
        />
        <StatCell
          label="STAKING POWER"
          value={formatPercent(validator.stakingPowerPercent, 3)}
        />
        <StatCell
          label="DELEGATOR APR"
          value={formatPercent(validator.aprStrkPercent)}
          detail={
            validator.aprBtcPercent !== null
              ? `BTC ${formatPercent(validator.aprBtcPercent)}`
              : undefined
          }
        />
        <StatCell
          label="COMMISSION"
          value={formatCommission(validator.commissionBps)}
        />
        <StatCell
          label="DELEGATORS"
          value={
            validator.delegators === null
              ? 'INDEXING'
              : validator.delegators.toLocaleString('en-US')
          }
          detail={
            pendingStrk > 0n
              ? `${formatAmount(pendingStrk)} STRK EXITING`
              : undefined
          }
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-[#ff4a04]/20 p-5 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
        <div className="shrink-0 text-[9px] tracking-[0.2em] text-neutral-500">
          STAKE · LAST {TREND_DAYS}D
          {trendChange !== null ? (
            <div className="mt-1 text-sm tracking-normal text-white">
              {trendChange >= 0 ? '+' : ''}
              {trendChange.toFixed(1)}%
            </div>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          {trend.length > 1 ? (
            <Sparkline
              points={trend}
              color={chartColors.featured}
              label={`Stake Wars validator stake over the last ${TREND_DAYS} days`}
            />
          ) : (
            <div className="text-[9px] tracking-[0.18em] text-neutral-600">
              TREND APPEARS ONCE DAILY HISTORY REACHES THIS VALIDATOR
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ValidatorStatus({
  validator,
  now,
}: {
  validator: StakingValidator;
  now: number;
}) {
  if (validator.status === 'exiting') {
    return (
      <span className="flex items-center gap-1.5 text-amber-400">
        <span aria-hidden="true">■</span>
        EXITING
        {validator.unstakeAt
          ? ` · ${formatDuration(validator.unstakeAt - now)}`
          : ''}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-neutral-300">
      <span aria-hidden="true" className="text-emerald-400">
        ●
      </span>
      ACTIVE
    </span>
  );
}
