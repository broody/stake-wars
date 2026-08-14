import { adjacentControlPointIds } from './controlPointGeometry';

export const MAX_TENURE_DAYS = 365;
export const MAX_TENURE_EXTRUSION = 0.75;
export const DEFAULT_TENURE_EXTRUSION_ENABLED = false;

const SECONDS_PER_HOUR = 60 * 60;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

export function controlPointTenureSeconds(
  controlledSince: number | null,
  nowSeconds = Date.now() / 1_000
): number | null {
  if (
    controlledSince === null ||
    !Number.isFinite(controlledSince) ||
    controlledSince <= 0 ||
    !Number.isFinite(nowSeconds)
  ) {
    return null;
  }
  return Math.max(0, nowSeconds - controlledSince);
}

export function tenureExtrusionHeight(
  controlledSince: number | null,
  nowSeconds = Date.now() / 1_000
): number {
  const ageSeconds = controlPointTenureSeconds(controlledSince, nowSeconds);
  if (ageSeconds === null) return 0;

  const ageDays = Math.min(ageSeconds / SECONDS_PER_DAY, MAX_TENURE_DAYS);
  return (
    (MAX_TENURE_EXTRUSION * Math.log1p(ageDays)) / Math.log1p(MAX_TENURE_DAYS)
  );
}

export function uniformAdjacentControlPointHeights(
  controlPointGroups: readonly (readonly number[])[],
  heights: ReadonlyMap<number, number>
): Map<number, number> {
  const uniformHeights = new Map(heights);

  controlPointGroups.forEach((controlPointIds) => {
    const group = new Set(controlPointIds);
    const unvisited = new Set(controlPointIds);

    while (unvisited.size > 0) {
      const first = unvisited.values().next().value;
      if (first === undefined) break;

      const component: number[] = [];
      const pending = [first];
      unvisited.delete(first);

      while (pending.length > 0) {
        const controlPointId = pending.pop();
        if (controlPointId === undefined) continue;
        component.push(controlPointId);

        adjacentControlPointIds(controlPointId).forEach((neighborId) => {
          if (group.has(neighborId) && unvisited.delete(neighborId)) {
            pending.push(neighborId);
          }
        });
      }

      const componentHeight = component.reduce(
        (highest, controlPointId) =>
          Math.max(highest, heights.get(controlPointId) ?? 0),
        0
      );
      component.forEach((controlPointId) => {
        uniformHeights.set(controlPointId, componentHeight);
      });
    }
  });

  return uniformHeights;
}

export function controlPointTenureHeights(
  enabled: boolean,
  controlPointIds: readonly number[],
  controlPointGroups: readonly (readonly number[])[],
  controlledSince: ReadonlyMap<number, number>,
  nowSeconds = Date.now() / 1_000
): Map<number, number> {
  const heights = new Map<number, number>();
  controlPointIds.forEach((controlPointId) => {
    heights.set(
      controlPointId,
      enabled
        ? tenureExtrusionHeight(
            controlledSince.get(controlPointId) ?? null,
            nowSeconds
          )
        : 0
    );
  });

  return enabled
    ? uniformAdjacentControlPointHeights(controlPointGroups, heights)
    : heights;
}

export function formatControlPointTenure(
  controlledSince: number | null,
  nowSeconds = Date.now() / 1_000
): string {
  const ageSeconds = controlPointTenureSeconds(controlledSince, nowSeconds);
  if (ageSeconds === null) return '---';
  if (ageSeconds < SECONDS_PER_HOUR) return '<1h';

  const hours = Math.floor(ageSeconds / SECONDS_PER_HOUR);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(ageSeconds / SECONDS_PER_DAY);
  if (days < DAYS_PER_MONTH) return `${days}d`;
  if (days < DAYS_PER_YEAR) return `${Math.floor(days / DAYS_PER_MONTH)}mo`;

  const years = Math.floor(days / DAYS_PER_YEAR);
  const remainingMonths = Math.floor(
    (days - years * DAYS_PER_YEAR) / DAYS_PER_MONTH
  );
  return remainingMonths > 0 ? `${years}y ${remainingMonths}mo` : `${years}y`;
}
