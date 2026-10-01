import {
  copy,
  cross,
  dot,
  normalize,
  tangentToward,
  vec3,
  type Vec3,
} from './sphere';

/** Authored single-saber clips and the shared combat/visual envelope. */
export const SABER = {
  scale: 0.26,
  sole: -1.265625,
  runSpeed: 1.76,
  duration: 0.75,
  impact: 11 / 24,
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

export function saberArc(level: number) {
  return ((level >= 4 ? 150 : level >= 3 ? 120 : 90) * Math.PI) / 180;
}

export function saberReach(level: number, area: number) {
  const reach = 0.77 * (level >= 4 ? 1.25 : 1) * area;
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
  return (
    x * Math.sin(arc / 2) - Math.abs(y) * Math.cos(arc / 2) >= -radius &&
    (Math.max(0, x) / (reach + radius)) ** 2 +
      (y / (width / 2 + radius)) ** 2 <=
      1
  );
}

/** Retiming keeps the strike aligned while standing/running recover at different rates. */
export function saberClipTime(
  elapsed: number,
  duration: number,
  clipDuration: number
) {
  const t = Math.max(0, Math.min(1, elapsed / duration)) * SABER.duration;
  return t <= SABER.impact
    ? t
    : SABER.impact +
        ((t - SABER.impact) / (SABER.duration - SABER.impact)) *
          (clipDuration - SABER.impact);
}
