const dayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});

/** Axis date for a daily point, such as "SEP 29" (UTC). */
export function formatDay(timestampSeconds: number): string {
  return dayFormatter.format(timestampSeconds * 1_000).toUpperCase();
}

/** Axis date for a long range, such as "SEP 26" (UTC). */
export function formatMonth(timestampSeconds: number): string {
  return monthFormatter.format(timestampSeconds * 1_000).toUpperCase();
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
