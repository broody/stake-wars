import type { StakingHistoryPoint } from '../types/staking';

export type HistoryRange = '30d' | '90d' | '1y' | 'all';

export const rangeOptions: Array<{ value: HistoryRange; label: string }> = [
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'ALL' },
];

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
