/** The Core's Sectors as the simulation sees them: unit corners and centers. */
import { extractSectorPositions, SECTOR_COUNT } from '../utils/sectorGeometry';
import { set, type Vec3 } from './sphere';

let table: { corners: Float32Array; centers: Float64Array } | null = null;

/** Unit-sphere corners (9 values per Sector) and normalized centers (3 per). */
function sectors() {
  if (table) return table;
  const corners = extractSectorPositions(
    Array.from({ length: SECTOR_COUNT }, (_, id) => id),
    1
  );
  const centers = new Float64Array(SECTOR_COUNT * 3);
  for (let id = 0; id < SECTOR_COUNT; id++) {
    const o = id * 9;
    const x = corners[o] + corners[o + 3] + corners[o + 6];
    const y = corners[o + 1] + corners[o + 4] + corners[o + 7];
    const z = corners[o + 2] + corners[o + 5] + corners[o + 8];
    const length = Math.hypot(x, y, z);
    centers[id * 3] = x / length;
    centers[id * 3 + 1] = y / length;
    centers[id * 3 + 2] = z / length;
  }
  return (table = { corners, centers });
}

/** The Sector under a surface normal. */
export function sectorAt(n: Vec3): number {
  const { centers } = sectors();
  let best = 0;
  let bestDot = -Infinity;
  for (let id = 0; id < SECTOR_COUNT; id++) {
    const d =
      centers[id * 3] * n.x +
      centers[id * 3 + 1] * n.y +
      centers[id * 3 + 2] * n.z;
    if (d > bestDot) {
      bestDot = d;
      best = id;
    }
  }
  return best;
}

export function sectorCenter(out: Vec3, sector: number): Vec3 {
  const { centers } = sectors();
  return set(
    out,
    centers[sector * 3],
    centers[sector * 3 + 1],
    centers[sector * 3 + 2]
  );
}

/** Corner `index` (0–2) of a Sector on the unit sphere. */
export function sectorCorner(out: Vec3, sector: number, index: number): Vec3 {
  const { corners } = sectors();
  const o = sector * 9 + index * 3;
  return set(out, corners[o], corners[o + 1], corners[o + 2]);
}

/** Sectors whose centers lie within `arc` radians of `n`, with that angle. */
export function sectorsWithin(
  n: Vec3,
  arc: number
): { sector: number; angle: number }[] {
  const { centers } = sectors();
  const min = Math.cos(arc);
  const found: { sector: number; angle: number }[] = [];
  for (let id = 0; id < SECTOR_COUNT; id++) {
    const d =
      centers[id * 3] * n.x +
      centers[id * 3 + 1] * n.y +
      centers[id * 3 + 2] * n.z;
    if (d >= min) found.push({ sector: id, angle: Math.acos(Math.min(1, d)) });
  }
  return found;
}
