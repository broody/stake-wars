import { useMemo, useState } from 'react';
import type { StakingHistory, StakingHistoryPoint } from '../../types/staking';
import {
  plottablePoints,
  pointsInRange,
  rangeOptions,
  type HistoryRange,
} from '../../utils/stakingChart';
import { chartColors } from '../../../ui/tokens';
import {
  amountToNumber,
  formatDate,
  formatQuantity,
  parseAmount,
} from '../../utils/stakingFormat';
import { TimeSeriesChart, type SeriesPoint } from '../../../ui/charts/charts';
import {
  Button,
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

export function StakedHistoryPanel({
  history,
  error,
}: {
  history: StakingHistory | null;
  error: string | null;
}) {
  const [range, setRange] = useState<HistoryRange>('1y');
  const [asset, setAsset] = useState<Asset>('strk');
  const [showTable, setShowTable] = useState(false);
  const unit = asset === 'strk' ? 'STRK' : 'BTC';

  const { values, series } = useMemo(() => {
    const inRange = pointsInRange(history?.points ?? [], range);
    const toValue = (point: StakingHistoryPoint): SeriesPoint => ({
      t: point.timestamp,
      v: amountToNumber(
        parseAmount(asset === 'strk' ? point.strkStaked : point.btcStaked)
      ),
    });
    return {
      values: inRange.map(toValue),
      series: plottablePoints(inRange).map(toValue),
    };
  }, [asset, history, range]);
  const first = values[0];
  const latest = values[values.length - 1];
  const change =
    values.length > 1 && first.v > 0
      ? ((latest.v - first.v) / first.v) * 100
      : null;
  const formatValue = (value: number) => `${formatQuantity(value)} ${unit}`;

  return (
    <Panel aria-labelledby="staked-history">
      <PanelSection>
        <SectionHeading
          id="staked-history"
          eyebrow="NETWORK HISTORY · DAILY AT 00:00 UTC"
          title="TOTAL STAKED"
        >
          <div className="flex flex-wrap gap-2">
            <SegmentedControl
              label="Asset"
              value={asset}
              onChange={setAsset}
              options={[
                { value: 'strk', label: 'STRK' },
                { value: 'btc', label: 'BTC' },
              ]}
            />
            <SegmentedControl
              label="Time range"
              value={range}
              onChange={setRange}
              options={rangeOptions}
            />
          </div>
        </SectionHeading>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <div className="text-figure tabular-nums text-fg">
            {latest ? formatQuantity(latest.v) : '—'}
            <span className="ml-2 text-label text-fg-subtle">{unit}</span>
          </div>
          {change !== null ? (
            <div className="text-label text-fg-muted">
              {change >= 0 ? '+' : ''}
              {change.toFixed(1)}% OVER{' '}
              {rangeOptions.find((option) => option.value === range)?.label}
            </div>
          ) : null}
        </div>
      </PanelSection>

      <div className="border-b border-line px-2 pb-3 pt-4 sm:px-4">
        {showTable ? (
          <HistoryTable points={series} formatValue={formatValue} />
        ) : (
          <TimeSeriesChart
            points={series}
            color={chartColors.network}
            seriesLabel={`${unit} STAKED`}
            formatValue={(value) => formatQuantity(value)}
            height={240}
            emptyLabel={
              history && !history.synced
                ? 'BUILDING HISTORY FROM CHAIN…'
                : 'NOT ENOUGH HISTORY YET'
            }
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-label text-fg-subtle">
        <span>
          {error
            ? `HISTORY UNAVAILABLE · ${error}`
            : history && !history.synced
              ? 'BACKFILLING DAILY HISTORY FROM THE STAKING CONTRACT…'
              : 'SOURCE · STARKNET STAKING CONTRACT, READ AT EACH DAY’S LAST BLOCK'}
        </span>
        <Button
          variant="link"
          onClick={() => setShowTable((current) => !current)}
        >
          {showTable ? 'VIEW CHART' : 'VIEW TABLE'}
        </Button>
      </div>
    </Panel>
  );
}

export function HistoryTable({
  points,
  formatValue,
}: {
  points: SeriesPoint[];
  formatValue: (value: number) => string;
}) {
  return (
    <div className="activity-scrollbar max-h-72 overflow-y-auto">
      <Table>
        <TableHead sticky>
          <tr>
            <TableHeaderCell>DATE (UTC)</TableHeaderCell>
            <TableHeaderCell numeric>VALUE</TableHeaderCell>
          </tr>
        </TableHead>
        <tbody>
          {[...points].reverse().map((point) => (
            <TableRow key={point.t}>
              <TableCell className="py-1.5 text-fg-muted">
                {formatDate(point.t)}
              </TableCell>
              <TableCell numeric className="py-1.5">
                {formatValue(point.v)}
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
