import { adjacentSectorIds } from './sectorGeometry';

export const MAX_TENURE_DAYS = 365;
export const MAX_TENURE_EXTRUSION = 0.75;
export const DEFAULT_TENURE_EXTRUSION_ENABLED = false;

const SECONDS_PER_HOUR = 60 * 60;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

export function sectorTenureSeconds(
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
  const ageSeconds = sectorTenureSeconds(controlledSince, nowSeconds);
  if (ageSeconds === null) return 0;

  const ageDays = Math.min(ageSeconds / SECONDS_PER_DAY, MAX_TENURE_DAYS);
  return (
    (MAX_TENURE_EXTRUSION * Math.log1p(ageDays)) / Math.log1p(MAX_TENURE_DAYS)
  );
}

export function uniformAdjacentSectorHeights(
  sectorGroups: readonly (readonly number[])[],
  heights: ReadonlyMap<number, number>
): Map<number, number> {
  const uniformHeights = new Map(heights);

  sectorGroups.forEach((sectorIds) => {
    const group = new Set(sectorIds);
    const unvisited = new Set(sectorIds);

    while (unvisited.size > 0) {
      const first = unvisited.values().next().value;
      if (first === undefined) break;

      const component: number[] = [];
      const pending = [first];
      unvisited.delete(first);

      while (pending.length > 0) {
        const sectorId = pending.pop();
        if (sectorId === undefined) continue;
        component.push(sectorId);

        adjacentSectorIds(sectorId).forEach((neighborId) => {
          if (group.has(neighborId) && unvisited.delete(neighborId)) {
            pending.push(neighborId);
          }
        });
      }

      const componentHeight = component.reduce(
        (highest, sectorId) => Math.max(highest, heights.get(sectorId) ?? 0),
        0
      );
      component.forEach((sectorId) => {
        uniformHeights.set(sectorId, componentHeight);
      });
    }
  });

  return uniformHeights;
}

export function sectorTenureHeights(
  enabled: boolean,
  sectorIds: readonly number[],
  sectorGroups: readonly (readonly number[])[],
  controlledSince: ReadonlyMap<number, number>,
  nowSeconds = Date.now() / 1_000
): Map<number, number> {
  const heights = new Map<number, number>();
  sectorIds.forEach((sectorId) => {
    heights.set(
      sectorId,
      enabled
        ? tenureExtrusionHeight(
            controlledSince.get(sectorId) ?? null,
            nowSeconds
          )
        : 0
    );
  });

  return enabled
    ? uniformAdjacentSectorHeights(sectorGroups, heights)
    : heights;
}

export function formatSectorTenure(
  controlledSince: number | null,
  nowSeconds = Date.now() / 1_000
): string {
  const ageSeconds = sectorTenureSeconds(controlledSince, nowSeconds);
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
