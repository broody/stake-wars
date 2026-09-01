import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BEACON_ORBIT_RADIUS,
  BEACON_PROJECTION_CAMERA_PHASE_OFFSET,
  beaconCameraPhaseOffset,
  beaconOrbitAngle,
  createBeaconOrbitLayout,
  positionOnBeaconOrbit,
  sampleBeaconOrbit,
  tangentOnBeaconOrbit,
} from './beaconOrbit';

describe('beacon orbit', () => {
  it('maps per-load randomness to orbital phase and spatial roll', () => {
    const samples = [0.25, 0.75];
    const layout = createBeaconOrbitLayout(() => samples.shift() ?? 0);

    expect(layout.startAngle).toBeCloseTo(Math.PI / 2, 8);
    expect(layout.roll).toBeCloseTo((Math.PI * 3) / 2, 8);
  });

  it('keeps every phase on the same orbital radius', () => {
    const position = new THREE.Vector3();

    for (let step = 0; step < 24; step += 1) {
      positionOnBeaconOrbit((step / 24) * Math.PI * 2, position);
      expect(position.length()).toBeCloseTo(BEACON_ORBIT_RADIUS, 8);
    }
  });

  it('returns a unit tangent aligned to the orbit ring', () => {
    const angle = 1.13;
    const position = positionOnBeaconOrbit(angle, new THREE.Vector3());
    const tangent = tangentOnBeaconOrbit(angle, new THREE.Vector3());

    expect(tangent.length()).toBeCloseTo(1, 8);
    expect(position.dot(tangent)).toBeCloseTo(0, 8);

    const next = positionOnBeaconOrbit(angle + 0.0001, new THREE.Vector3());
    expect(next.sub(position).normalize().dot(tangent)).toBeCloseTo(1, 6);
  });

  it('samples a camera phase on the Beacon path with a stable orbit up', () => {
    const beaconPosition = new THREE.Vector3();
    const cameraPosition = new THREE.Vector3();
    const cameraUp = new THREE.Vector3();
    const elapsedTime = 18;
    const cameraPhase = THREE.MathUtils.degToRad(140);

    sampleBeaconOrbit(
      elapsedTime,
      false,
      0,
      beaconPosition,
      new THREE.Vector3()
    );
    sampleBeaconOrbit(
      elapsedTime,
      false,
      cameraPhase,
      cameraPosition,
      cameraUp
    );

    expect(cameraPosition.length()).toBeCloseTo(BEACON_ORBIT_RADIUS, 8);
    expect(cameraUp.length()).toBeCloseTo(1, 8);
    expect(cameraUp.y).toBeGreaterThanOrEqual(0);
    expect(cameraUp.dot(cameraPosition)).toBeCloseTo(0, 8);
    expect(beaconOrbitAngle(elapsedTime, false)).toBeGreaterThan(0);
  });

  it('places the projection camera on the opposite orbit side', () => {
    const elapsedTime = 0;
    const beaconPosition = new THREE.Vector3();
    const cameraPosition = new THREE.Vector3();
    const tangent = tangentOnBeaconOrbit(
      beaconOrbitAngle(elapsedTime, false),
      new THREE.Vector3()
    );

    sampleBeaconOrbit(
      elapsedTime,
      false,
      0,
      beaconPosition,
      new THREE.Vector3()
    );
    sampleBeaconOrbit(
      elapsedTime,
      false,
      BEACON_PROJECTION_CAMERA_PHASE_OFFSET,
      cameraPosition,
      new THREE.Vector3()
    );

    expect(cameraPosition.sub(beaconPosition).dot(tangent)).toBeLessThan(0);
  });

  it('keeps the normal camera behind the Beacon', () => {
    expect(beaconCameraPhaseOffset(false)).toBe(0);
    expect(beaconCameraPhaseOffset(true)).toBe(
      BEACON_PROJECTION_CAMERA_PHASE_OFFSET
    );
  });
});
