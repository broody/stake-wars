import * as THREE from 'three';

export const CAMERA_ARRIVAL_DURATION_SECONDS = 4.5;
export const CAMERA_ARRIVAL_DISTANCE = 15;

export interface CameraArrivalPath {
  startDirection: THREE.Vector3;
  endDirection: THREE.Vector3;
  orbitUp: THREE.Vector3;
  startDistance: number;
  endDistance: number;
  startRoll: number;
  endRoll: number;
}

export interface CameraArrivalSample {
  position: THREE.Vector3;
  up: THREE.Vector3;
  roll: number;
}

type RandomSource = () => number;

function randomUnitVector(random: RandomSource) {
  const z = random() * 2 - 1;
  const theta = random() * Math.PI * 2;
  const radius = Math.sqrt(1 - z * z);
  return new THREE.Vector3(
    radius * Math.cos(theta),
    radius * Math.sin(theta),
    z
  );
}

export function createCameraArrivalPath(
  random: RandomSource = Math.random
): CameraArrivalPath {
  const endDirection = randomUnitVector(random);
  const tangentReference =
    Math.abs(endDirection.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  const tangentA = new THREE.Vector3()
    .crossVectors(endDirection, tangentReference)
    .normalize();
  const tangentB = new THREE.Vector3().crossVectors(endDirection, tangentA);
  const tangentAngle = random() * Math.PI * 2;
  const tangent = tangentA
    .multiplyScalar(Math.cos(tangentAngle))
    .addScaledVector(tangentB, Math.sin(tangentAngle));

  // Keep the opening viewpoint far enough around the globe for the travel to
  // read as an orbit, without choosing the unstable exact opposite direction.
  const arc = THREE.MathUtils.lerp(
    THREE.MathUtils.degToRad(65),
    THREE.MathUtils.degToRad(115),
    random()
  );
  const startDirection = endDirection
    .clone()
    .multiplyScalar(Math.cos(arc))
    .addScaledVector(tangent, Math.sin(arc))
    .normalize();
  const orbitUp = new THREE.Vector3()
    .crossVectors(startDirection, endDirection)
    .normalize();
  const endRoll = THREE.MathUtils.lerp(-Math.PI, Math.PI, random());
  const rollDirection = random() < 0.5 ? -1 : 1;
  const rollTravel = THREE.MathUtils.lerp(0.65, 1.2, random());

  return {
    startDirection,
    endDirection,
    orbitUp,
    startDistance: THREE.MathUtils.lerp(24, 29, random()),
    endDistance: CAMERA_ARRIVAL_DISTANCE,
    startRoll: endRoll - rollDirection * rollTravel,
    endRoll,
  };
}

// Scratch storage keeps path sampling allocation-light in the render loop.
const arcRotation = new THREE.Quaternion();
const sampledRotation = new THREE.Quaternion();
const identityRotation = new THREE.Quaternion();
const sampledForward = new THREE.Vector3();

function easeInOutCubic(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

export function sampleCameraArrival(
  path: CameraArrivalPath,
  progress: number,
  target: CameraArrivalSample
) {
  const clampedProgress = THREE.MathUtils.clamp(progress, 0, 1);
  const travelProgress = easeInOutCubic(clampedProgress);
  const zoomProgress = easeOutCubic(clampedProgress);

  arcRotation.setFromUnitVectors(path.startDirection, path.endDirection);
  sampledRotation.copy(identityRotation).slerp(arcRotation, travelProgress);

  target.position
    .copy(path.startDirection)
    .applyQuaternion(sampledRotation)
    .multiplyScalar(
      THREE.MathUtils.lerp(path.startDistance, path.endDistance, zoomProgress)
    );
  target.roll = THREE.MathUtils.lerp(
    path.startRoll,
    path.endRoll,
    travelProgress
  );
  sampledForward.copy(target.position).negate().normalize();
  target.up
    .copy(path.orbitUp)
    .applyAxisAngle(sampledForward, target.roll)
    .normalize();
}
