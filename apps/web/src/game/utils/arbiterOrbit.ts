import * as THREE from 'three';

export const ARBITER_ORBIT_RADIUS = 17;
export const ARBITER_ORBIT_SPEED = 0.14;
export const ARBITER_ORBIT_PRECESSION_SPEED = 0.018;
export const ARBITER_START_ANGLE = THREE.MathUtils.degToRad(28);

const ORBIT_TILT = THREE.MathUtils.degToRad(56);
const ORBIT_ROLL = THREE.MathUtils.degToRad(-14);
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
const ORBIT_NORMAL = new THREE.Vector3()
  .crossVectors(ORBIT_X_AXIS, ORBIT_Y_AXIS)
  .normalize();

export function arbiterOrbitAngle(
  elapsedTime: number,
  prefersReducedMotion: boolean
) {
  return prefersReducedMotion
    ? ARBITER_START_ANGLE
    : ARBITER_START_ANGLE + elapsedTime * ARBITER_ORBIT_SPEED;
}

export function arbiterOrbitPrecession(
  elapsedTime: number,
  prefersReducedMotion: boolean
) {
  return prefersReducedMotion
    ? 0
    : elapsedTime * ARBITER_ORBIT_PRECESSION_SPEED;
}

export function positionOnArbiterOrbit(angle: number, target: THREE.Vector3) {
  return target
    .copy(ORBIT_X_AXIS)
    .multiplyScalar(Math.cos(angle) * ARBITER_ORBIT_RADIUS)
    .addScaledVector(ORBIT_Y_AXIS, Math.sin(angle) * ARBITER_ORBIT_RADIUS);
}

export function sampleArbiterOrbit(
  elapsedTime: number,
  prefersReducedMotion: boolean,
  phaseOffset: number,
  targetPosition: THREE.Vector3,
  targetUp: THREE.Vector3
) {
  const precession = arbiterOrbitPrecession(elapsedTime, prefersReducedMotion);
  positionOnArbiterOrbit(
    arbiterOrbitAngle(elapsedTime, prefersReducedMotion) + phaseOffset,
    targetPosition
  ).applyAxisAngle(WORLD_UP, precession);
  targetUp.copy(ORBIT_NORMAL).applyAxisAngle(WORLD_UP, precession);
}
