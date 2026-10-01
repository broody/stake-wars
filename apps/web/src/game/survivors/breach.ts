import { sectorCenter, sectorCorner } from './sectors';
import { dot, normalize, set, vec3, type Vec3 } from './sphere';

/**
 * A spawn breaches the Core: its Sector flips over, the enemy rises onto the
 * flipped face, and the Sector later flips back. The enemy is inert until it
 * has risen. Times are seconds; the simulation and renderer share them.
 */
export const BREACH = {
  flip: 0.35,
  rise: 0.35,
  hold: 0.9,
  close: 0.4,
  /** How far the panel lifts while edge-on, so it never sinks into the Core. */
  lift: 0.22,
} as const;
/** Sectors that can be open at once; beyond it, enemies still rise unseen. */
export const MAX_BREACHES = 192;
export const BREACH_EMERGE = BREACH.flip + BREACH.rise;
export const BREACH_LIFE =
  BREACH.flip + BREACH.rise + BREACH.hold + BREACH.close;

export interface Breach {
  sector: number;
  age: number;
}

const corner = vec3();

const smooth = (t: number) => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/** Panel rotation in radians: 0 is the Core face, π the flipped face. */
export function breachAngle(age: number) {
  if (age < BREACH.flip) return Math.PI * smooth(age / BREACH.flip);
  const closing = BREACH_LIFE - BREACH.close;
  if (age < closing) return Math.PI;
  return Math.PI * (1 - smooth((age - closing) / BREACH.close));
}

/** 0 while the Sector is still flipping, rising to 1 once the enemy is out. */
export function riseProgress(emerge: number) {
  return smooth(1 - emerge / BREACH.rise);
}

/**
 * The panel's hinge runs from the center through corner 0, a near-symmetry
 * axis of the Core's near-equilateral Sectors, so a half turn lands the
 * flipped face back on the Sector's own outline.
 */
export function breachHinge(out: Vec3, sector: number): Vec3 {
  sectorCenter(out, sector);
  sectorCorner(corner, sector, 0);
  const d = dot(corner, out);
  return normalize(
    set(out, corner.x - out.x * d, corner.y - out.y * d, corner.z - out.z * d)
  );
}

/** Rising depth per unit of model scale; deep enough to hide any Hollow Legion model. */
const RISE_DEPTH = 3;

/**
 * Render lift for an enemy rising out of its breach, interpolated between
 * ticks of length `step`; null while it is still hidden under its Sector.
 */
export function emergeLift(
  emerge: number,
  alpha: number,
  step: number,
  scale: number
): number | null {
  if (emerge <= 0) return 0;
  const remaining = emerge + (1 - alpha) * step;
  if (remaining >= BREACH.rise) return null;
  return -(1 - riseProgress(remaining)) * RISE_DEPTH * scale;
}
