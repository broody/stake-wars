import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ARBITER_ORBIT_RADIUS,
  arbiterOrbitAngle,
  createArbiterOrbitLayout,
  positionOnArbiterOrbit,
  sampleArbiterOrbit,
  tangentOnArbiterOrbit,
} from './arbiterOrbit';

describe('arbiter orbit', () => {
  it('maps per-load randomness to orbital phase and spatial roll', () => {
    const samples = [0.25, 0.75];
    const layout = createArbiterOrbitLayout(() => samples.shift() ?? 0);

    expect(layout.startAngle).toBeCloseTo(Math.PI / 2, 8);
    expect(layout.roll).toBeCloseTo((Math.PI * 3) / 2, 8);
  });

  it('keeps every phase on the same orbital radius', () => {
    const position = new THREE.Vector3();

    for (let step = 0; step < 24; step += 1) {
      positionOnArbiterOrbit((step / 24) * Math.PI * 2, position);
      expect(position.length()).toBeCloseTo(ARBITER_ORBIT_RADIUS, 8);
    }
  });

  it('returns a unit tangent aligned to the orbit ring', () => {
    const angle = 1.13;
    const position = positionOnArbiterOrbit(angle, new THREE.Vector3());
    const tangent = tangentOnArbiterOrbit(angle, new THREE.Vector3());

    expect(tangent.length()).toBeCloseTo(1, 8);
    expect(position.dot(tangent)).toBeCloseTo(0, 8);

    const next = positionOnArbiterOrbit(angle + 0.0001, new THREE.Vector3());
    expect(next.sub(position).normalize().dot(tangent)).toBeCloseTo(1, 6);
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
    expect(cameraUp.y).toBeGreaterThanOrEqual(0);
    expect(cameraUp.dot(cameraPosition)).toBeCloseTo(0, 8);
    expect(arbiterOrbitAngle(elapsedTime, false)).toBeGreaterThan(0);
  });
});
