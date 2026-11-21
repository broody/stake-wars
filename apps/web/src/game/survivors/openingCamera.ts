import { type Camera, MathUtils, Vector3 } from 'three';
import { FOLLOW_CAMERA } from './followCamera';
import type { Vec3 } from './sphere';

export const OPENING_CAMERA = {
  release: 0.28,
  impact: 1.85,
  split: 2.12,
  portrait: 3.5,
  hold: 4.03,
  duration: 6.35,
  // Aim halfway up a ~0.49-unit hero. Start just above eye level on the sword side.
  targetHeight: 0.25,
  distance: 0.56,
  elevation: MathUtils.degToRad(14),
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
const sightline = new Vector3();

/** Orbit in the player's tangent frame, ending on the live follow camera's sightline. */
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
  side.crossVectors(forward, normal);
  const sweep = MathUtils.smootherstep(
    age,
    OPENING_CAMERA.hold,
    OPENING_CAMERA.duration
  );
  const azimuth = MathUtils.lerp(OPENING_CAMERA.azimuth, Math.PI, sweep);
  radial
    .copy(forward)
    .multiplyScalar(Math.cos(azimuth))
    .addScaledVector(side, Math.sin(azimuth));

  const height = (FOLLOW_CAMERA.height - FOLLOW_CAMERA.targetHeight) * pullback;
  const back = FOLLOW_CAMERA.back * pullback;
  const elevation = MathUtils.lerp(
    OPENING_CAMERA.elevation,
    Math.atan2(height, back),
    sweep
  );
  // A geometric pullback keeps the face readable through the first part of the arc.
  const near = OPENING_CAMERA.distance * pullback;
  const distance = near * (Math.hypot(height, back) / near) ** sweep;
  look
    .copy(normal)
    .multiplyScalar(
      radius +
        MathUtils.lerp(
          OPENING_CAMERA.targetHeight,
          FOLLOW_CAMERA.targetHeight,
          sweep
        )
    );
  eye
    .copy(look)
    .addScaledVector(radial, distance * Math.cos(elevation))
    .addScaledVector(normal, distance * Math.sin(elevation));
  if (age < OPENING_CAMERA.portrait) {
    // Ease off the dolly through the fracture so both halves stay in view as they open.
    const fractureBeat = 0.55;
    const delay =
      fractureBeat *
      MathUtils.smootherstep(
        age,
        OPENING_CAMERA.impact - 0.18,
        OPENING_CAMERA.impact + 1.1
      );
    const approach = MathUtils.smootherstep(
      age - delay,
      OPENING_CAMERA.release,
      OPENING_CAMERA.portrait - fractureBeat
    );
    const aim = MathUtils.smootherstep(
      age,
      OPENING_CAMERA.release,
      OPENING_CAMERA.impact
    );
    const wideHeight = orbit.eye.length() - radius;
    const nearHeight = eye.dot(normal) - radius;
    // Pull in along the surface normal while swinging out over the sword shoulder.
    // Interpolating altitude geometrically brakes the dive without crossing the ground.
    const altitude = wideHeight * (nearHeight / wideHeight) ** approach;
    const reach =
      distance * Math.cos(elevation) + 2.2 * pullback * (1 - approach);
    eye
      .copy(normal)
      .multiplyScalar(radius + altitude)
      .addScaledVector(radial, reach * approach);
    look.lerp(orbit.look, 1 - aim);
    // Lead the falling actor while the camera closes in on the landing site.
    look.addScaledVector(
      orbit.trail,
      dropDistance(age, orbit, radius) *
        aim *
        (1 -
          MathUtils.smoothstep(
            age,
            OPENING_CAMERA.impact - 0.6,
            OPENING_CAMERA.impact
          ))
    );
    // Give the opening shell room on both sides, then close in on the exposed hero.
    const revealDistance =
      1.8 *
      pullback *
      aim *
      (1 -
        MathUtils.smootherstep(
          age,
          OPENING_CAMERA.split + 0.63,
          OPENING_CAMERA.portrait
        ));
    sightline.subVectors(eye, look);
    eye
      .copy(look)
      .addScaledVector(
        sightline,
        Math.hypot(1, revealDistance / sightline.length())
      );
    up.lerpVectors(orbit.up, normal, approach).normalize();
    return;
  }
  // Keep the horizon level while climbing, ending with screen-up along forward.
  const tilt = (sweep * Math.PI) / 2;
  up.copy(normal)
    .multiplyScalar(Math.cos(tilt))
    .addScaledVector(radial, -Math.sin(tilt));
}
