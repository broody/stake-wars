import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  JACKPOT_FOCUS_SECONDS,
  JACKPOT_HOLD_SECONDS,
  JACKPOT_CORE_CLEARANCE,
  JACKPOT_MIN_DISTANCE,
  JACKPOT_MAX_DISTANCE,
  constrainJackpotCamera,
  createCameraPose,
  createJackpotCameraPath,
  interpolateCameraPose,
  jackpotSectorAnchor,
  sampleJackpotCamera,
} from './jackpotCamera';
import { CORE_RADIUS } from './sectorGeometry';

function viewpoint(position = new THREE.Vector3(0, 0, 15)) {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100);
  camera.position.copy(position);
  camera.lookAt(0, 0, 0);
  return camera;
}

describe('jackpot camera', () => {
  it('keeps every drag and zoom position, and its sightline, outside the Core', () => {
    for (const sectorId of [0, 125, 795, 1200, 1999]) {
      const anchor = jackpotSectorAnchor(sectorId);
      const path = createJackpotCameraPath(sectorId, viewpoint());
      for (const requestedDistance of [0, 0.05, 1.3, 4, 16, 100]) {
        for (let polar = 0; polar <= Math.PI; polar += Math.PI / 24) {
          const position = path.tangent
            .clone()
            .multiplyScalar(Math.sin(polar))
            .addScaledVector(anchor.normal, Math.cos(polar))
            .multiplyScalar(requestedDistance)
            .add(anchor.position);
          constrainJackpotCamera(position, anchor);
          const distance = position.distanceTo(anchor.position);
          expect(distance).toBeGreaterThanOrEqual(JACKPOT_MIN_DISTANCE - 1e-9);
          expect(distance).toBeLessThanOrEqual(JACKPOT_MAX_DISTANCE + 1e-9);
          expect(position.dot(anchor.normal)).toBeGreaterThanOrEqual(
            CORE_RADIUS + JACKPOT_CORE_CLEARANCE - 1e-9
          );
          for (let step = 0; step <= 10; step += 1) {
            const sightlinePoint = position
              .clone()
              .lerp(anchor.position, step / 10);
            expect(sightlinePoint.length()).toBeGreaterThanOrEqual(
              CORE_RADIUS + JACKPOT_CORE_CLEARANCE - 1e-9
            );
          }
        }
      }
    }
  });

  it('preserves a valid user viewpoint and does not drift along the surface boundary', () => {
    const path = createJackpotCameraPath(795, viewpoint());
    const sample = createCameraPose();
    sampleJackpotCamera(path, JACKPOT_FOCUS_SECONDS, sample);
    const original = sample.position.clone();
    constrainJackpotCamera(sample.position, path.anchor);
    expect(sample.position.distanceTo(original)).toBeCloseTo(0);

    sample.position
      .copy(path.anchor.position)
      .addScaledVector(path.anchor.normal, -4);
    constrainJackpotCamera(sample.position, path.anchor);
    const boundary = sample.position.clone();
    for (let frame = 0; frame < 120; frame += 1) {
      constrainJackpotCamera(sample.position, path.anchor);
    }
    expect(sample.position.distanceTo(boundary)).toBeLessThan(1e-8);
  });

  it('starts at the current viewpoint and holds the close-up before orbiting', () => {
    const start = viewpoint();
    const path = createJackpotCameraPath(795, start);
    const sample = createCameraPose();
    sampleJackpotCamera(path, 0, sample);
    expect(sample.position.distanceTo(start.position)).toBeCloseTo(0);
    expect(sample.quaternion.angleTo(start.quaternion)).toBeCloseTo(0);

    sampleJackpotCamera(path, JACKPOT_FOCUS_SECONDS, sample);
    const heldPosition = sample.position.clone();
    const heldRotation = sample.quaternion.clone();
    expect(sample.position.distanceTo(path.anchor.position)).toBeLessThan(5);
    sampleJackpotCamera(
      path,
      JACKPOT_FOCUS_SECONDS + JACKPOT_HOLD_SECONDS,
      sample
    );
    expect(sample.position.distanceTo(heldPosition)).toBeCloseTo(0);
    expect(sample.quaternion.angleTo(heldRotation)).toBeCloseTo(0);
    sampleJackpotCamera(path, 16, sample);
    expect(sample.position.distanceTo(heldPosition)).toBeGreaterThan(1);
  });

  it('keeps the marker centered and stays above its surface throughout the orbit', () => {
    const path = createJackpotCameraPath(795, viewpoint());
    const sample = createCameraPose();
    const forward = new THREE.Vector3();
    for (let elapsed = JACKPOT_FOCUS_SECONDS; elapsed <= 90; elapsed += 0.25) {
      sampleJackpotCamera(path, elapsed, sample);
      forward.set(0, 0, -1).applyQuaternion(sample.quaternion);
      const toMarker = path.anchor.position.clone().sub(sample.position);
      expect(forward.angleTo(toMarker)).toBeLessThan(0.000001);
      expect(toMarker.length()).toBeCloseTo(4);
      expect(sample.position.dot(path.anchor.normal)).toBeGreaterThan(
        CORE_RADIUS + 1
      );
    }
  });

  it('approaches sectors on the far side without passing through the Core', () => {
    for (const sectorId of [0, 125, 795, 1200, 1999]) {
      const anchor = jackpotSectorAnchor(sectorId);
      const start = viewpoint(anchor.normal.clone().multiplyScalar(-15));
      const path = createJackpotCameraPath(sectorId, start);
      const sample = createCameraPose();
      for (let step = 0; step <= 100; step += 1) {
        sampleJackpotCamera(path, (step / 100) * JACKPOT_FOCUS_SECONDS, sample);
        expect(sample.position.length()).toBeGreaterThan(CORE_RADIUS + 2);
        expect(sample.quaternion.length()).toBeCloseTo(1);
      }
    }
  });

  it('can approach directly overhead without a degenerate orbit tangent', () => {
    const anchor = jackpotSectorAnchor(0);
    const path = createJackpotCameraPath(
      0,
      viewpoint(anchor.normal.clone().multiplyScalar(15))
    );
    expect(path.tangent.length()).toBeCloseTo(1);
    expect(path.tangent.dot(anchor.normal)).toBeCloseTo(0);
  });

  it('eases out of the hold and restores the original view exactly on return', () => {
    const start = viewpoint();
    const path = createJackpotCameraPath(795, start);
    const closeup = createCameraPose();
    const sample = createCameraPose();
    const orbitStart = JACKPOT_FOCUS_SECONDS + JACKPOT_HOLD_SECONDS;
    sampleJackpotCamera(path, orbitStart, closeup);
    sampleJackpotCamera(path, orbitStart + 0.01, sample);
    expect(sample.position.distanceTo(closeup.position)).toBeLessThan(0.00001);

    sampleJackpotCamera(path, 20, closeup);
    interpolateCameraPose(closeup, start, 0, sample);
    expect(sample.position.distanceTo(closeup.position)).toBeCloseTo(0);
    expect(sample.quaternion.angleTo(closeup.quaternion)).toBeCloseTo(0);
    interpolateCameraPose(closeup, start, 1, sample);
    expect(sample.position.distanceTo(start.position)).toBeCloseTo(0);
    expect(sample.quaternion.angleTo(start.quaternion)).toBeCloseTo(0);
  });
});
