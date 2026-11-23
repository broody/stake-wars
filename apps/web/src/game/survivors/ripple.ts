import type { Vec3 } from './sphere';
import * as portable from './portableMath';

/**
 * An Orbital Strike pushes a single raised band out through the Sectors around
 * its impact: through the ring touching it, and one ring farther for each step
 * of blast size. The simulation keeps the clock; the renderer shapes the
 * pulse. Distances are ground units, times seconds.
 */
export const RIPPLE = {
  /** How fast the pulse runs out from the impact. */
  speed: 1.8,
  /** Width of the raised band, about one Sector across. */
  width: 0.35,
  /** Reach of the two rings around a level-one impact. */
  reach: 0.9,
  /** Each extra ring of Sectors carries the band about one Sector farther. */
  ringStep: 0.35,
  /** Strength above 1 that adds another ring of raised Sectors. */
  strengthPerRing: 0.4,
  maxRings: 3,
  /** Peak lift of a Sector for a level-one strike. */
  height: 0.065,
  /** The blast radius a strike of `strength` 1 covers. */
  baseRadius: 0.5,
} as const;
export const MAX_RIPPLES = 32;

export interface Ripple {
  n: Vec3;
  /** Blast radius relative to a level-one strike. */
  strength: number;
  age: number;
}

/** Rings of Sectors around the struck one that a strike of `strength` lifts. */
export function rippleRings(strength: number) {
  const extra = Math.floor((strength - 1) / RIPPLE.strengthPerRing + 1e-9);
  return Math.min(RIPPLE.maxRings, 2 + Math.max(0, extra));
}

/** How far from the impact a strike of `strength` lifts Sectors. */
export function rippleReach(strength: number) {
  return RIPPLE.reach + RIPPLE.ringStep * (rippleRings(strength) - 2);
}

/** Long enough for the band to run past the ripple's reach. */
export function rippleLife(strength: number) {
  return (rippleReach(strength) + RIPPLE.width) / RIPPLE.speed;
}

/** Lift of a Sector `distance` from the impact, `age` seconds after it. */
export function rippleHeight(distance: number, age: number, strength: number) {
  const behind = RIPPLE.speed * age - distance;
  if (behind < 0 || behind > RIPPLE.width) return 0;
  const reach = rippleReach(strength);
  if (distance >= reach) return 0;
  const pulse = portable.sin((Math.PI * behind) / RIPPLE.width);
  const falloff = 1 - distance / reach;
  return (
    RIPPLE.height * Math.sqrt(strength) * pulse * pulse * falloff * falloff
  );
}
