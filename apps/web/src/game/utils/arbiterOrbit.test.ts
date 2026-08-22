import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ARBITER_ORBIT_RADIUS,
  arbiterOrbitAngle,
  positionOnArbiterOrbit,
  sampleArbiterOrbit,
} from './arbiterOrbit';

describe('arbiter orbit', () => {
  it('keeps every phase on the same orbital radius', () => {
    const position = new THREE.Vector3();

    for (let step = 0; step < 24; step += 1) {
      positionOnArbiterOrbit((step / 24) * Math.PI * 2, position);
      expect(position.length()).toBeCloseTo(ARBITER_ORBIT_RADIUS, 8);
    }
  });

  it('samples a camera phase on the Arbiter path with a stable orbit up', () => {
    const arbiterPosition = new THREE.Vector3();
    const cameraPosition = new THREE.Vector3();
    const cameraUp = new THREE.Vector3();
    const elapsedTime = 18;
    const cameraPhase = THREE.MathUtils.degToRad(140);

    sampleArbiterOrbit(
      elapsedTime,
      false,
      0,
      arbiterPosition,
      new THREE.Vector3()
    );
    sampleArbiterOrbit(
      elapsedTime,
      false,
      cameraPhase,
      cameraPosition,
      cameraUp
    );

    expect(cameraPosition.length()).toBeCloseTo(ARBITER_ORBIT_RADIUS, 8);
    expect(cameraUp.length()).toBeCloseTo(1, 8);
    expect(cameraUp.dot(cameraPosition)).toBeCloseTo(0, 8);
    expect(arbiterOrbitAngle(elapsedTime, false)).toBeGreaterThan(0);
  });
});
