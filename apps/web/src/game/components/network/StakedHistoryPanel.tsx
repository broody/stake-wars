import { useMemo, useState } from 'react';
import type { StakingHistory, StakingHistoryPoint } from '../../types/staking';
import {
  chartColors,
  plottablePoints,
  pointsInRange,
  rangeOptions,
  type HistoryRange,
} from '../../utils/stakingChart';
import {
  amountToNumber,
  formatDate,
  formatQuantity,
  parseAmount,
} from '../../utils/stakingFormat';
import { TimeSeriesChart, type SeriesPoint } from './charts';
import { SectionHeading, SegmentedControl } from './primitives';

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
    <section aria-labelledby="staked-history" className="border border-grid">
      <div className="border-b border-grid p-5 sm:p-6">
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
          <div className="text-3xl text-white">
            {latest ? formatQuantity(latest.v) : '—'}
            <span className="ml-2 text-[10px] tracking-[0.16em] text-neutral-500">
              {unit}
            </span>
          </div>
          {change !== null ? (
            <div className="text-[10px] tracking-[0.12em] text-neutral-400">
              {change >= 0 ? '+' : ''}
              {change.toFixed(1)}% OVER{' '}
              {rangeOptions.find((option) => option.value === range)?.label}
            </div>
          ) : null}
        </div>
      </div>

      <div className="px-2 pb-3 pt-4 sm:px-4">
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-grid px-5 py-3 text-[9px] tracking-[0.16em] text-neutral-600">
        <span>
          {error
            ? `HISTORY UNAVAILABLE · ${error}`
            : history && !history.synced
              ? 'BACKFILLING DAILY HISTORY FROM THE STAKING CONTRACT…'
              : 'SOURCE · STARKNET STAKING CONTRACT, READ AT EACH DAY’S LAST BLOCK'}
        </span>
        <button
          type="button"
          onClick={() => setShowTable((current) => !current)}
          className="text-neutral-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-white"
        >
          {showTable ? 'VIEW CHART' : 'VIEW TABLE'}
        </button>
      </div>
    </section>
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
      <table className="w-full text-left text-[10px] tracking-[0.08em]">
        <thead className="sticky top-0 bg-black text-[9px] tracking-[0.18em] text-neutral-500">
          <tr>
            <th scope="col" className="px-3 py-2 font-normal">
              DATE (UTC)
            </th>
            <th scope="col" className="px-3 py-2 text-right font-normal">
              VALUE
            </th>
          </tr>
        </thead>
        <tbody>
          {[...points].reverse().map((point) => (
            <tr key={point.t} className="border-t border-grid">
              <td className="px-3 py-1.5 text-neutral-400">
                {formatDate(point.t)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-neutral-200">
                {formatValue(point.v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
