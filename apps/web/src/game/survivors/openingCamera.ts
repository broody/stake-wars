import { type Camera, MathUtils, Vector3 } from 'three';
import { FOLLOW_CAMERA } from './followCamera';
import type { Vec3 } from './sphere';

export const OPENING_CAMERA = {
  release: 0.28,
  impact: 1.85,
  split: 2.12,
  duration: 3.85,
  elevation: MathUtils.degToRad(40),
  azimuth: MathUtils.degToRad(32),
} as const;

/** Keep the actual orbit, including the player's zoom and roll, for retries. */
export function captureGlobeView(camera: Camera) {
  const eye = camera.position.clone();
  const normal = eye.clone().normalize();
  const look = camera
    .getWorldDirection(new Vector3())
    .multiplyScalar(eye.length())
    .add(eye);
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const right = new Vector3(1, 0, 0)
    .applyQuaternion(camera.quaternion)
    .projectOnPlane(normal)
    .normalize();
  const forward = new Vector3().crossVectors(right, normal).normalize();
  return globeView(eye, look, up, normal, forward);
}

/** Frame the landing chosen by the replay seed at the current globe zoom. */
export function globeViewAtSpawn(
  distance: number,
  player: { n: Vec3; forward: Vec3 }
) {
  const normal = new Vector3().copy(player.n);
  const forward = new Vector3().copy(player.forward);
  return globeView(
    normal.clone().multiplyScalar(distance),
    new Vector3(),
    forward.clone().negate(),
    normal,
    forward
  );
}

function globeView(
  eye: Vector3,
  look: Vector3,
  up: Vector3,
  normal: Vector3,
  forward: Vector3
) {
  // Arrive diagonally from the upper left, with the hero facing the approaching camera.
  const right = new Vector3().crossVectors(normal, forward);
  const trail = normal
    .clone()
    .multiplyScalar(0.5)
    .addScaledVector(forward, -0.78)
    .addScaledVector(right, -0.38)
    .normalize();
  return { eye, look, up, normal, forward, trail };
}

export type GlobeView = ReturnType<typeof captureGlobeView>;

/** Distance from touchdown along the flight path. The last part falls fastest. */
export function dropDistance(age: number, orbit: GlobeView, radius: number) {
  const t = MathUtils.clamp(
    (age - OPENING_CAMERA.release) /
      (OPENING_CAMERA.impact - OPENING_CAMERA.release),
    0,
    1
  );
  return (
    Math.min(6, 0.48 * Math.max(0, orbit.eye.length() - radius)) * (1 - t * t)
  );
}

const side = new Vector3();
const radial = new Vector3();
/** Follow the falling shell, then swing behind the player at gameplay distance. */
export function sampleOpeningCamera(
  age: number,
  orbit: GlobeView,
  radius: number,
  pullback: number,
  eye: Vector3,
  look: Vector3,
  up: Vector3
) {
  const { normal, forward } = orbit;
  const approach = MathUtils.smootherstep(
    age,
    OPENING_CAMERA.release,
    OPENING_CAMERA.impact
  );
  const sweep = MathUtils.smootherstep(
    age,
    OPENING_CAMERA.impact - 0.2,
    OPENING_CAMERA.duration
  );
  const azimuth =
    OPENING_CAMERA.azimuth + (Math.PI - OPENING_CAMERA.azimuth) * sweep;
  side.crossVectors(forward, normal);
  radial
    .copy(forward)
    .multiplyScalar(Math.cos(azimuth))
    .addScaledVector(side, Math.sin(azimuth));

  const torsoRadius = radius + FOLLOW_CAMERA.targetHeight;
  const height = FOLLOW_CAMERA.height - FOLLOW_CAMERA.targetHeight;
  const followDistance = Math.hypot(height, FOLLOW_CAMERA.back) * pullback;
  const distance = MathUtils.lerp(
    orbit.eye.length() - torsoRadius,
    followDistance,
    approach
  );
  const panElevation = MathUtils.lerp(
    OPENING_CAMERA.elevation,
    Math.atan2(height, FOLLOW_CAMERA.back),
    sweep
  );
  const elevation = MathUtils.lerp(Math.PI / 2, panElevation, approach);
  eye
    .copy(normal)
    .multiplyScalar(torsoRadius + distance * Math.sin(elevation))
    .addScaledVector(radial, distance * Math.cos(elevation));

  look
    .copy(normal)
    .multiplyScalar(torsoRadius)
    .addScaledVector(orbit.trail, dropDistance(age, orbit, radius))
    .lerp(orbit.look, 1 - approach);
  const tilt = (sweep * Math.PI) / 2;
  up.copy(normal)
    .multiplyScalar(Math.cos(tilt))
    .addScaledVector(radial, -Math.sin(tilt))
    .lerp(orbit.up, 1 - approach)
    .normalize();
}
