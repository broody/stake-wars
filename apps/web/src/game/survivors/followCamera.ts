import { MathUtils, type Vector3 } from 'three';
import type { Vec3 } from './sphere';

/** The follow camera's authored framing, in ground units above and behind the trooper. */
export const FOLLOW_CAMERA = {
  height: 3.3,
  back: 0.9,
  targetHeight: 0.22,
  /**
   * Narrow screens pull back until at least this much ground shows either
   * side of the trooper; landscape screens already see more.
   */
  minHalfWidth: 1.8,
  maxPullback: 1.8,
} as const;

/**
 * How much farther the camera sits than its authored framing, for a vertical
 * field of view `fov` (degrees) and a width-to-height `aspect`.
 */
export function followPullback(fov: number, aspect: number) {
  const halfWidth =
    FOLLOW_CAMERA.height * Math.tan((fov * Math.PI) / 360) * aspect;
  if (!(halfWidth > 0)) return 1;
  return Math.min(
    FOLLOW_CAMERA.maxPullback,
    Math.max(1, FOLLOW_CAMERA.minHalfWidth / halfWidth)
  );
}

const vertical = FOLLOW_CAMERA.height - FOLLOW_CAMERA.targetHeight;
const defaultPitch = Math.atan2(vertical, FOLLOW_CAMERA.back);
const orbitRadius = Math.hypot(vertical, FOLLOW_CAMERA.back);

/** Aim at the torso; orbit axes follow the local surface even across a pole. */
export function sampleFollowCamera(
  normal: Vec3,
  forward: Vec3,
  radius: number,
  pullback: number,
  eye: Vector3,
  look: Vector3,
  up: Vector3,
  yaw = 0,
  pitch = defaultPitch
) {
  eye.set(normal.x, normal.y, normal.z);
  look.copy(eye).multiplyScalar(radius + FOLLOW_CAMERA.targetHeight);
  up.set(forward.x, forward.y, forward.z).applyAxisAngle(eye, yaw);
  const distance = orbitRadius * pullback;
  eye
    .multiplyScalar(distance * Math.sin(pitch))
    .add(look)
    .addScaledVector(up, -distance * Math.cos(pitch));
}

export class FollowOrbit {
  distance = 1;
  yaw = 0;
  pitch = defaultPitch;
  private shownDistance = 1;

  zoomTo(distance: number) {
    this.distance = MathUtils.clamp(distance, 0.72, 1.35);
  }

  turnTo(yaw: number, pitch: number) {
    this.yaw = MathUtils.euclideanModulo(yaw + Math.PI, 2 * Math.PI) - Math.PI;
    this.pitch = MathUtils.clamp(
      pitch,
      MathUtils.degToRad(25),
      MathUtils.degToRad(82)
    );
  }

  sampleDistance(dt: number) {
    this.shownDistance = MathUtils.damp(
      this.shownDistance,
      this.distance,
      20,
      dt
    );
    return this.shownDistance;
  }

  reset() {
    this.distance = this.shownDistance = 1;
    this.yaw = 0;
    this.pitch = defaultPitch;
  }
}
