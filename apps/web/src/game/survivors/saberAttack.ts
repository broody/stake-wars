import {
  copy,
  cross,
  dot,
  normalize,
  tangentToward,
  vec3,
  type Vec3,
} from './sphere';
import * as portable from './portableMath';

/** Authored single-saber clips and the shared combat/visual envelope. */
export const SABER = {
  scale: 0.26,
  sole: -1.265625,
  runSpeed: 1.76,
  duration: 0.75,
  impact: 11 / 24,
  /**
   * The middle of the blade's visible cut, in clip seconds: the saber travels
   * fastest from 7/24 to 11/24 in both swing clips (measured from the GLB).
   * Swing sounds are timed to land here.
   */
  sweep: 8 / 24,
  effectLife: 0.24,
  deathDuration: 3,
} as const;

export interface SaberAttack {
  id: number;
  startedAt: number;
  duration: number;
  /** +1 is character-right, -1 is character-left. */
  side: number;
  /** Tangent frame committed at wind-up; transported with the player. */
  forward: Vec3;
}

/** Unmodified values for each earned Arc Blade rank, shared with the slash renderer. */
const BLADE_RANKS = [
  { damage: 16, cooldown: 1, reach: 0.95, degrees: 90 },
  { damage: 18, cooldown: 1, reach: 0.95, degrees: 95 },
  { damage: 19, cooldown: 0.97, reach: 0.99, degrees: 100 },
  { damage: 21, cooldown: 0.94, reach: 1.02, degrees: 105 },
  { damage: 23, cooldown: 0.91, reach: 1.05, degrees: 110 },
] as const;

export function bladeRank(level: number) {
  return BLADE_RANKS[Math.max(0, Math.min(level, BLADE_RANKS.length) - 1)];
}

export function saberArc(level: number) {
  return (bladeRank(level).degrees * Math.PI) / 180;
}

export function saberReach(level: number, area: number) {
  const reach = bladeRank(level).reach * area;
  return { reach, width: reach * 1.6, arc: saberArc(level) };
}

/** Turn the authored side cut toward the target, choosing the smaller torso turn. */
export function saberAim(normal: Vec3, heading: Vec3, target?: Vec3) {
  if (!target) return { side: 1, forward: copy(vec3(), heading) };
  const right = cross(vec3(), heading, normal);
  const aim = tangentToward(vec3(), normal, target, right);
  const side = dot(aim, right) < 0 ? -1 : 1;
  const forward = normalize(cross(vec3(), normal, aim));
  forward.x *= side;
  forward.y *= side;
  forward.z *= side;
  return { side, forward };
}

/** Elliptical sector: matches the displayed crescent's outer boundary. */
export function saberHits(
  x: number,
  y: number,
  reach: number,
  width: number,
  arc: number,
  radius = 0
) {
  const along = Math.max(0, x) / (reach + radius);
  const across = y / (width / 2 + radius);
  return (
    x * portable.sin(arc / 2) - Math.abs(y) * portable.cos(arc / 2) >=
      -radius && along * along + across * across <= 1
  );
}

/**
 * Retiming keeps the strike aligned while standing/running recover at
 * different rates. A clip whose cut lands at `clipImpact` seconds, rather than
 * the saber's, is stretched so its impact still meets the sim's.
 */
export function saberClipTime(
  elapsed: number,
  duration: number,
  clipDuration: number,
  clipImpact: number = SABER.impact
) {
  const t = Math.max(0, Math.min(1, elapsed / duration)) * SABER.duration;
  return t <= SABER.impact
    ? (t / SABER.impact) * clipImpact
    : clipImpact +
        ((t - SABER.impact) / (SABER.duration - SABER.impact)) *
          (clipDuration - clipImpact);
}
