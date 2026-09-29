import { useMemo, useState } from 'react';
import type { StakingHistory, StakingSnapshot } from '../../types/staking';
import { shortAddress } from '../../utils/format';
import {
  amountToNumber,
  formatAmount,
  formatDay,
  formatDuration,
  formatQuantity,
  normalizeTokenAmount,
  parseAmount,
} from '../../utils/stakingFormat';
import { voyagerContractUrl, voyagerValidatorUrl } from '../../utils/voyager';
import { ColumnChart, TimeSeriesChart, type ColumnDatum } from './charts';
import { ExternalLink, SectionHeading, SegmentedControl } from './primitives';
import {
  chartColors,
  plottablePoints,
  pointsInRange,
  rangeOptions,
  type HistoryRange,
} from '../../utils/stakingChart';

type Asset = 'strk' | 'btc';

export function UnstakingPanel({
  snapshot,
  history,
  featuredAddress,
}: {
  snapshot: StakingSnapshot;
  history: StakingHistory | null;
  featuredAddress: string | null;
}) {
  const [asset, setAsset] = useState<Asset>('strk');
  const [range, setRange] = useState<HistoryRange>('90d');
  const { unstaking, totals, parameters } = snapshot;
  const unit = asset === 'strk' ? 'STRK' : 'BTC';
  const now = snapshot.block.timestamp;

  const schedule: ColumnDatum[] = useMemo(
    () =>
      unstaking.schedule.map((day, index) => ({
        key: String(day.day),
        label: index === 0 ? 'TODAY' : formatDay(day.day),
        shortLabel:
          index === 0 ? 'NOW' : String(new Date(day.day * 1_000).getUTCDate()),
        value: amountToNumber(
          parseAmount(asset === 'strk' ? day.strk : day.btc)
        ),
        detail: `${day.count.toLocaleString('en-US')} EXITS UNLOCK`,
      })),
    [asset, unstaking.schedule]
  );
  const upcoming = schedule.reduce((sum, day) => sum + day.value, 0);
  const pendingSeries = useMemo(
    () =>
      plottablePoints(pointsInRange(history?.points ?? [], range)).map(
        (point) => ({
          t: point.timestamp,
          v: amountToNumber(
            parseAmount(asset === 'strk' ? point.strkPending : point.btcPending)
          ),
        })
      ),
    [asset, history, range]
  );

  return (
    <section aria-labelledby="pending-unstake" className="border border-grid">
      <div className="border-b border-grid p-5 sm:p-6">
        <SectionHeading
          id="pending-unstake"
          eyebrow={`EXIT QUEUE · ${formatDuration(parameters.exitWaitWindowSeconds)} WAIT WINDOW`}
          title="PENDING UNSTAKE"
        >
          <SegmentedControl
            label="Asset"
            value={asset}
            onChange={setAsset}
            options={[
              { value: 'strk', label: 'STRK' },
              { value: 'btc', label: 'BTC' },
            ]}
          />
        </SectionHeading>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <dl className="border-b border-grid lg:border-b-0 lg:border-r">
          <Row
            label="DELEGATOR EXITS"
            value={
              asset === 'strk'
                ? `${formatAmount(parseAmount(totals.strkPendingDelegators))} STRK`
                : `${formatAmount(parseAmount(totals.btcPending))} BTC`
            }
          />
          {asset === 'strk' ? (
            <Row
              label="VALIDATOR SELF-STAKE EXITS"
              value={`${formatAmount(parseAmount(totals.strkPendingValidators))} STRK`}
            />
          ) : null}
          <Row
            label="UNLOCKING NEXT 7 DAYS"
            value={`${formatQuantity(upcoming)} ${unit}`}
          />
          <Row
            label="WITHDRAWABLE NOW"
            hint="Exit window finished, not yet withdrawn"
            value={`${formatAmount(
              parseAmount(
                asset === 'strk'
                  ? unstaking.withdrawableStrk
                  : unstaking.withdrawableBtc
              )
            )} ${unit}`}
            accent
          />
          <Row
            label="OPEN EXIT REQUESTS"
            value={unstaking.pendingExits.toLocaleString('en-US')}
          />
        </dl>
        <div className="min-w-0 p-4 sm:p-5">
          <div className="mb-3 text-[9px] tracking-[0.2em] text-neutral-500">
            UNLOCK SCHEDULE · {unit} · UTC DAYS
          </div>
          <ColumnChart
            data={schedule}
            color={chartColors.pending}
            formatValue={(value) => `${formatQuantity(value)} ${unit}`}
          />
          <table className="sr-only">
            <caption>Pending {unit} unlocking by day</caption>
            <tbody>
              {schedule.map((day) => (
                <tr key={day.key}>
                  <th scope="row">{day.label}</th>
                  <td>
                    {formatQuantity(day.value)} {unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-grid p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[9px] tracking-[0.2em] text-neutral-500">
            DELEGATOR EXITS PENDING OVER TIME · {unit}
          </div>
          <SegmentedControl
            label="Pending history range"
            value={range}
            onChange={setRange}
            options={rangeOptions}
          />
        </div>
        <TimeSeriesChart
          points={pendingSeries}
          color={chartColors.pending}
          seriesLabel={`${unit} PENDING`}
          formatValue={(value) => formatQuantity(value)}
          height={160}
          emptyLabel={
            history && !history.synced
              ? 'BUILDING HISTORY FROM CHAIN…'
              : 'NOT ENOUGH HISTORY YET'
          }
        />
      </div>

      <div className="grid border-t border-grid lg:grid-cols-2 [&>*]:min-w-0">
        <div className="border-b border-grid lg:border-b-0 lg:border-r">
          <div className="px-5 pt-4 text-[9px] tracking-[0.2em] text-neutral-500">
            LARGEST PENDING EXITS
          </div>
          <div className="activity-scrollbar overflow-x-auto">
            <table className="mt-2 w-full min-w-[440px] text-left text-[10px] tracking-[0.06em]">
              <thead className="text-[9px] tracking-[0.16em] text-neutral-600">
                <tr>
                  <th scope="col" className="px-5 py-2 font-normal">
                    DELEGATOR
                  </th>
                  <th scope="col" className="px-2 py-2 font-normal">
                    VALIDATOR
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-normal">
                    AMOUNT
                  </th>
                  <th scope="col" className="px-5 py-2 text-right font-normal">
                    UNLOCKS
                  </th>
                </tr>
              </thead>
              <tbody>
                {unstaking.largest.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-4 text-neutral-600">
                      NO PENDING EXITS
                    </td>
                  </tr>
                ) : (
                  unstaking.largest.map((exit) => (
                    <tr
                      key={`${exit.validator}-${exit.member}-${exit.token}`}
                      className="border-t border-grid"
                    >
                      <td className="px-5 py-2 text-neutral-300">
                        <ExternalLink href={voyagerContractUrl(exit.member)}>
                          {shortAddress(exit.member)}
                        </ExternalLink>
                      </td>
                      <td
                        className={
                          exit.validator === featuredAddress
                            ? 'px-2 py-2 text-[#ff6a2f]'
                            : 'px-2 py-2 text-neutral-400'
                        }
                      >
                        {exit.validator === featuredAddress
                          ? 'STAKE WARS'
                          : shortAddress(exit.validator)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-white">
                        {formatAmount(
                          normalizeTokenAmount(
                            parseAmount(exit.amount),
                            exit.decimals
                          )
                        )}{' '}
                        <span className="text-neutral-500">{exit.symbol}</span>
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums text-neutral-400">
                        {exit.unlockAt <= now
                          ? 'READY'
                          : `${exit.estimated ? '≈' : ''}${formatDuration(exit.unlockAt - now)}`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="px-5 pt-4 text-[9px] tracking-[0.2em] text-neutral-500">
            VALIDATORS EXITING
          </div>
          {unstaking.exitingValidators.length === 0 ? (
            <div className="px-5 py-4 text-[10px] tracking-[0.1em] text-neutral-600">
              NO VALIDATORS ARE EXITING
            </div>
          ) : (
            <ul className="mt-2">
              {unstaking.exitingValidators.map((validator) => (
                <li
                  key={validator.address}
                  className="flex items-center justify-between gap-4 border-t border-grid px-5 py-2 text-[10px]"
                >
                  <ExternalLink
                    href={voyagerValidatorUrl(validator.address)}
                    className="text-neutral-300"
                  >
                    {shortAddress(validator.address)}
                  </ExternalLink>
                  <span className="text-right tabular-nums text-neutral-400">
                    <span className="text-white">
                      {formatAmount(parseAmount(validator.selfStake))}
                    </span>{' '}
                    SELF · {formatAmount(parseAmount(validator.delegatedStrk))}{' '}
                    DELEGATED ·{' '}
                    {validator.unlockAt <= now
                      ? 'READY'
                      : formatDuration(validator.unlockAt - now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-grid px-5 py-3 last:border-b-0">
      <dt
        className="text-[9px] tracking-[0.18em] text-neutral-500"
        title={hint}
      >
        {label}
      </dt>
      <dd
        className={`whitespace-nowrap text-right text-sm ${accent ? 'text-amber-300' : 'text-white'}`}
      >
        {value}
      </dd>
    </div>
  );
}
