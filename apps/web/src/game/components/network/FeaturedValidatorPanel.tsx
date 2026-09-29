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
import { plottablePoints } from '../../utils/stakingChart';
import { chartColors } from '../../../ui/tokens';
import { Sparkline } from '../../../ui/charts/charts';
import {
  Badge,
  buttonStyles,
  Eyebrow,
  ExternalLink,
  Panel,
  Stat,
  StatGrid,
} from '../../../ui';

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
      <Panel tone="accent" className="p-5 text-label text-fg-muted">
        {snapshot.index.stakingSynced
          ? 'THE STAKE WARS VALIDATOR IS NOT IN THE VALIDATOR SET'
          : 'LOCATING THE STAKE WARS VALIDATOR WHILE THE STAKING INDEX CATCHES UP…'}
      </Panel>
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
    <Panel tone="accent" aria-labelledby="featured-validator">
      <div className="flex flex-col gap-5 border-b border-accent/20 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <Eyebrow
            tone="accent"
            className="flex flex-wrap items-center gap-x-3 gap-y-2"
          >
            <span>OUR VALIDATOR</span>
            {validator.rank !== null ? (
              <span className="text-fg-muted">
                RANK #{validator.rank} OF {snapshot.totals.activeValidators}
              </span>
            ) : null}
            <ValidatorStatus
              validator={validator}
              now={snapshot.block.timestamp}
            />
          </Eyebrow>
          <h2
            id="featured-validator"
            className="mt-2 text-figure font-bold text-fg"
          >
            STAKE<span className="text-fg-disabled">//</span>WARS
          </h2>
          <div className="mt-2 text-label text-fg-subtle">
            <span title={validator.address}>
              {shortAddress(validator.address)}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            to="/staking"
            className={buttonStyles({
              variant: 'solid',
              className: 'font-bold',
            })}
          >
            STAKE WITH STAKE WARS →
          </Link>
          <ExternalLink
            quiet
            href={voyagerValidatorUrl(validator.address)}
            className={buttonStyles({ tone: 'accent' })}
          >
            VOYAGER
          </ExternalLink>
        </div>
      </div>

      <StatGrid
        tone="accent"
        className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
      >
        <Stat
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
        <Stat
          label="BTC DELEGATED"
          value={formatAmount(delegatedBtc)}
          unit="BTC"
        />
        <Stat
          label="STAKING POWER"
          value={formatPercent(validator.stakingPowerPercent, 3)}
        />
        <Stat
          label="DELEGATOR APR"
          value={formatPercent(validator.aprStrkPercent)}
          detail={
            validator.aprBtcPercent !== null
              ? `BTC ${formatPercent(validator.aprBtcPercent)}`
              : undefined
          }
        />
        <Stat
          label="COMMISSION"
          value={formatCommission(validator.commissionBps)}
        />
        <Stat
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
      </StatGrid>

      <div className="flex flex-col gap-3 border-t border-accent/20 p-5 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
        <div className="shrink-0 text-label text-fg-subtle">
          STAKE · LAST {TREND_DAYS}D
          {trendChange !== null ? (
            <div className="mt-1 text-figure-sm text-fg">
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
            <div className="text-label text-fg-subtle">
              TREND APPEARS ONCE DAILY HISTORY REACHES THIS VALIDATOR
            </div>
          )}
        </div>
      </div>
    </Panel>
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
      <Badge tone="warning">
        EXITING
        {validator.unstakeAt
          ? ` · ${formatDuration(validator.unstakeAt - now)}`
          : ''}
      </Badge>
    );
  }
  return (
    <Badge tone="success">
      <span aria-hidden="true">●</span>
      ACTIVE
    </Badge>
  );
}
