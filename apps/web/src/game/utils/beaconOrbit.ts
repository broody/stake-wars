import * as THREE from 'three';

export const BEACON_ORBIT_RADIUS = 17;
export const BEACON_ORBIT_SPEED = 0.14;
export const BEACON_ORBIT_PRECESSION_SPEED = 0.018;
export const BEACON_PROJECTION_CAMERA_PHASE_OFFSET =
  THREE.MathUtils.degToRad(-18);

export function beaconCameraPhaseOffset(projectionActive: boolean) {
  return projectionActive ? BEACON_PROJECTION_CAMERA_PHASE_OFFSET : 0;
}

const FULL_TURN = Math.PI * 2;

export function createBeaconOrbitLayout(random: () => number = Math.random) {
  return {
    startAngle: random() * FULL_TURN,
    roll: random() * FULL_TURN,
  } as const;
}

const SESSION_ORBIT_LAYOUT = createBeaconOrbitLayout();
export const BEACON_START_ANGLE = SESSION_ORBIT_LAYOUT.startAngle;

const ORBIT_TILT = THREE.MathUtils.degToRad(56);
const ORBIT_ROLL = SESSION_ORBIT_LAYOUT.roll;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const ORBIT_X_AXIS = new THREE.Vector3(
  Math.cos(ORBIT_ROLL),
  Math.sin(ORBIT_ROLL),
  0
);
const ORBIT_Y_AXIS = new THREE.Vector3(
  -Math.cos(ORBIT_TILT) * Math.sin(ORBIT_ROLL),
  Math.cos(ORBIT_TILT) * Math.cos(ORBIT_ROLL),
  Math.sin(ORBIT_TILT)
);
const ORBIT_UP = new THREE.Vector3()
  .crossVectors(ORBIT_X_AXIS, ORBIT_Y_AXIS)
  .normalize();
if (ORBIT_UP.dot(WORLD_UP) < 0) ORBIT_UP.negate();

export function beaconOrbitAngle(
  elapsedTime: number,
  prefersReducedMotion: boolean
) {
  return prefersReducedMotion
    ? BEACON_START_ANGLE
    : BEACON_START_ANGLE + elapsedTime * BEACON_ORBIT_SPEED;
}

export function beaconOrbitPrecession(
  elapsedTime: number,
  prefersReducedMotion: boolean
) {
  return prefersReducedMotion ? 0 : elapsedTime * BEACON_ORBIT_PRECESSION_SPEED;
}

export function positionOnBeaconOrbit(angle: number, target: THREE.Vector3) {
  return target
    .copy(ORBIT_X_AXIS)
    .multiplyScalar(Math.cos(angle) * BEACON_ORBIT_RADIUS)
    .addScaledVector(ORBIT_Y_AXIS, Math.sin(angle) * BEACON_ORBIT_RADIUS);
}

export function tangentOnBeaconOrbit(angle: number, target: THREE.Vector3) {
  return target
    .copy(ORBIT_X_AXIS)
    .multiplyScalar(-Math.sin(angle))
    .addScaledVector(ORBIT_Y_AXIS, Math.cos(angle))
    .normalize();
}

export function upOnBeaconOrbit(target: THREE.Vector3) {
  return target.copy(ORBIT_UP);
}

export function sampleBeaconOrbit(
  elapsedTime: number,
  prefersReducedMotion: boolean,
  phaseOffset: number,
  targetPosition: THREE.Vector3,
  targetUp: THREE.Vector3
) {
  const precession = beaconOrbitPrecession(elapsedTime, prefersReducedMotion);
  positionOnBeaconOrbit(
    beaconOrbitAngle(elapsedTime, prefersReducedMotion) + phaseOffset,
    targetPosition
  ).applyAxisAngle(WORLD_UP, precession);
  upOnBeaconOrbit(targetUp).applyAxisAngle(WORLD_UP, precession);
}
