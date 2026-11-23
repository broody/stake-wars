import { cross, dot, normalize, pointAt, vec3, type Vec3 } from './sphere';
import * as portable from './portableMath';

/** StaffSlam's authored timing (24 fps); the simulation and renderer share it. */
export const WARDEN_SLAM = {
  duration: 2,
  impact: 26 / 24,
  triggerRange: 1.6,
  radius: 1.2,
  halfAngle: Math.PI / 3,
  cooldown: 4.5,
  damage: 20,
  // Staff shaft base at the impact key, in the exported model's X/Z plane.
  tipX: -0.763,
  tipZ: 0.716,
};
export const WARDEN_GAIT = {
  walkSpeed: 0.6,
  runSpeed: 2.15,
  walkDistance: 1.4,
  runDistance: 2.2,
};

/** Both the warning and collision measure distance along the Core from the staff. */
export function insideWardenSlam(
  origin: Vec3,
  direction: Vec3,
  feet: Vec3,
  groundRadius: number
) {
  const alignment = Math.max(-1, Math.min(1, dot(origin, feet)));
  if (alignment < portable.cos(WARDEN_SLAM.radius / groundRadius)) return false;
  if (alignment >= 1 - 1e-12) return true;
  return (
    dot(feet, direction) >=
    Math.sqrt(1 - alignment * alignment) * portable.cos(WARDEN_SLAM.halfAngle)
  );
}

export function wardenApproachSpeed(gap: number, walk: number, run: number) {
  const t = Math.max(
    0,
    Math.min(
      1,
      (gap - WARDEN_GAIT.walkDistance) /
        (WARDEN_GAIT.runDistance - WARDEN_GAIT.walkDistance)
    )
  );
  const nearSpeed = Math.min(walk, run);
  return nearSpeed + (run - nearSpeed) * t * t * (3 - 2 * t);
}

/** Place the warning/damage origin under the staff, on the Core's surface. */
export function wardenSlamOrigin(
  out: Vec3,
  normal: Vec3,
  heading: Vec3,
  scale: number,
  radius: number
) {
  const right = cross(vec3(), normal, heading);
  const direction = vec3(
    right.x * WARDEN_SLAM.tipX + heading.x * WARDEN_SLAM.tipZ,
    right.y * WARDEN_SLAM.tipX + heading.y * WARDEN_SLAM.tipZ,
    right.z * WARDEN_SLAM.tipX + heading.z * WARDEN_SLAM.tipZ
  );
  return pointAt(
    out,
    normal,
    normalize(direction),
    (portable.hypot(WARDEN_SLAM.tipX, WARDEN_SLAM.tipZ) * scale) / radius
  );
}
