import * as THREE from 'three';

export const ARBITER_ORBIT_RADIUS = 17;
export const ARBITER_ORBIT_SPEED = 0.14;
export const ARBITER_ORBIT_PRECESSION_SPEED = 0.018;

const FULL_TURN = Math.PI * 2;

export function createArbiterOrbitLayout(random: () => number = Math.random) {
  return {
    startAngle: random() * FULL_TURN,
    roll: random() * FULL_TURN,
  } as const;
}

const SESSION_ORBIT_LAYOUT = createArbiterOrbitLayout();
export const ARBITER_START_ANGLE = SESSION_ORBIT_LAYOUT.startAngle;

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

export function tangentOnArbiterOrbit(angle: number, target: THREE.Vector3) {
  return target
    .copy(ORBIT_X_AXIS)
    .multiplyScalar(-Math.sin(angle))
    .addScaledVector(ORBIT_Y_AXIS, Math.cos(angle))
    .normalize();
}

export function upOnArbiterOrbit(target: THREE.Vector3) {
  return target.copy(ORBIT_UP);
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
  upOnArbiterOrbit(targetUp).applyAxisAngle(WORLD_UP, precession);
}
