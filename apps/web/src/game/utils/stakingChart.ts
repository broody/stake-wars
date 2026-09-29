import type { StakingHistoryPoint } from '../types/staking';

export type HistoryRange = '30d' | '90d' | '1y' | 'all';

export const rangeOptions: Array<{ value: HistoryRange; label: string }> = [
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'ALL' },
];

/** Single-series chart colors on the black surface. */
export const chartColors = {
  network: '#e5e5e5',
  featured: '#ff4a04',
  pending: '#fbbf24',
  grid: '#1a1a1a',
  axis: '#737373',
  crosshair: '#525252',
  surface: '#000000',
} as const;

const RANGE_DAYS: Record<HistoryRange, number | null> = {
  '30d': 30,
  '90d': 90,
  '1y': 365,
  all: null,
};

/** Returns the points inside range, measured back from the newest point. */
export function pointsInRange(
  points: StakingHistoryPoint[],
  range: HistoryRange
): StakingHistoryPoint[] {
  const days = RANGE_DAYS[range];
  if (days === null || points.length === 0) return points;
  const since = points[points.length - 1].timestamp - days * 86_400;
  return points.filter((point) => point.timestamp >= since);
}

const MAX_LIVE_GAP_SECONDS = 2 * 86_400;

/**
 * Drops the live observation from a plotted series while daily history is
 * still backfilling, so a straight line never bridges days without samples.
 */
export function plottablePoints(
  points: StakingHistoryPoint[]
): StakingHistoryPoint[] {
  const count = points.length;
  if (count < 2 || !points[count - 1].live) return points;
  const gap = points[count - 1].timestamp - points[count - 2].timestamp;
  return gap > MAX_LIVE_GAP_SECONDS ? points.slice(0, -1) : points;
}

/** Rounds a maximum up to a clean 1/2/2.5/5 step and returns the ticks. */
export function niceTicks(maximum: number, count = 4): number[] {
  if (!(maximum > 0)) return [0, 1];
  const rough = maximum / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const multiple = [1, 2, 2.5, 5, 10].find((step) => step * power >= rough);
  const step = (multiple ?? 10) * power;
  const ticks: number[] = [];
  for (let index = 0; index * step < maximum + step * 0.001; index += 1) {
    ticks.push(index * step);
  }
  if (ticks[ticks.length - 1] < maximum) ticks.push(ticks.length * step);
  return ticks;
}

/** Index of the point whose time is closest to t, for points sorted by t. */
export function nearestIndex(points: Array<{ t: number }>, t: number): number {
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (points[middle].t < t) low = middle + 1;
    else high = middle;
  }
  if (low > 0 && t - points[low - 1].t < points[low].t - t) return low - 1;
  return low;
}
