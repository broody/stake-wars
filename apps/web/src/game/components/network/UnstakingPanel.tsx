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
import {
  ColumnChart,
  TimeSeriesChart,
  type ColumnDatum,
} from '../../../ui/charts/charts';
import {
  plottablePoints,
  pointsInRange,
  rangeOptions,
  type HistoryRange,
} from '../../utils/stakingChart';
import {
  chartColors,
  cn,
  Eyebrow,
  ExternalLink,
  Panel,
  PanelSection,
  SectionHeading,
  SegmentedControl,
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../../ui';

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
    <Panel aria-labelledby="pending-unstake">
      <PanelSection>
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
      </PanelSection>

      <div className="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <dl className="border-b border-line lg:border-b-0 lg:border-r">
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
          <Eyebrow className="mb-3">
            UNLOCK SCHEDULE · {unit} · UTC DAYS
          </Eyebrow>
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

      <div className="border-t border-line p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Eyebrow>DELEGATOR EXITS PENDING OVER TIME · {unit}</Eyebrow>
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

      <div className="grid border-t border-line lg:grid-cols-2 [&>*]:min-w-0">
        <div className="border-b border-line lg:border-b-0 lg:border-r">
          <Eyebrow className="px-5 pt-4">LARGEST PENDING EXITS</Eyebrow>
          <div className="activity-scrollbar overflow-x-auto">
            <Table className="mt-2 min-w-[440px]">
              <TableHead>
                <tr>
                  <TableHeaderCell className="pl-5">DELEGATOR</TableHeaderCell>
                  <TableHeaderCell>VALIDATOR</TableHeaderCell>
                  <TableHeaderCell numeric>AMOUNT</TableHeaderCell>
                  <TableHeaderCell numeric className="pr-5">
                    UNLOCKS
                  </TableHeaderCell>
                </tr>
              </TableHead>
              <tbody>
                {unstaking.largest.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="px-5 text-fg-subtle">
                      NO PENDING EXITS
                    </TableCell>
                  </TableRow>
                ) : (
                  unstaking.largest.map((exit) => (
                    <TableRow
                      key={`${exit.validator}-${exit.member}-${exit.token}`}
                    >
                      <TableCell className="pl-5">
                        <ExternalLink href={voyagerContractUrl(exit.member)}>
                          {shortAddress(exit.member)}
                        </ExternalLink>
                      </TableCell>
                      <TableCell
                        className={
                          exit.validator === featuredAddress
                            ? 'text-accent'
                            : 'text-fg-muted'
                        }
                      >
                        {exit.validator === featuredAddress
                          ? 'STAKE WARS'
                          : shortAddress(exit.validator)}
                      </TableCell>
                      <TableCell numeric className="text-fg">
                        {formatAmount(
                          normalizeTokenAmount(
                            parseAmount(exit.amount),
                            exit.decimals
                          )
                        )}{' '}
                        <span className="text-fg-subtle">{exit.symbol}</span>
                      </TableCell>
                      <TableCell numeric className="pr-5 text-fg-muted">
                        {exit.unlockAt <= now
                          ? 'READY'
                          : `${exit.estimated ? '≈' : ''}${formatDuration(exit.unlockAt - now)}`}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </tbody>
            </Table>
          </div>
        </div>
        <div>
          <Eyebrow className="px-5 pt-4">VALIDATORS EXITING</Eyebrow>
          {unstaking.exitingValidators.length === 0 ? (
            <div className="px-5 py-4 text-caption text-fg-subtle">
              NO VALIDATORS ARE EXITING
            </div>
          ) : (
            <ul className="mt-2">
              {unstaking.exitingValidators.map((validator) => (
                <li
                  key={validator.address}
                  className="flex items-center justify-between gap-4 border-t border-line px-5 py-2 text-caption"
                >
                  <ExternalLink
                    href={voyagerValidatorUrl(validator.address)}
                    className="text-fg-secondary"
                  >
                    {shortAddress(validator.address)}
                  </ExternalLink>
                  <span className="text-right tabular-nums text-fg-muted">
                    <span className="text-fg">
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
    </Panel>
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
    <div className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-3 last:border-b-0">
      <dt className="text-label text-fg-subtle" title={hint}>
        {label}
      </dt>
      <dd
        className={cn(
          'whitespace-nowrap text-right text-body tabular-nums',
          accent ? 'text-warning' : 'text-fg'
        )}
      >
        {value}
      </dd>
    </div>
  );
}
