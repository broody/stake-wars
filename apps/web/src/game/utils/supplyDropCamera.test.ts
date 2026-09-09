import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  SUPPLY_DROP_FOCUS_SECONDS,
  SUPPLY_DROP_HOLD_SECONDS,
  SUPPLY_DROP_CORE_CLEARANCE,
  SUPPLY_DROP_MIN_DISTANCE,
  SUPPLY_DROP_MAX_DISTANCE,
  constrainSupplyDropCamera,
  createCameraPose,
  createSupplyDropCameraPath,
  interpolateCameraPose,
  supplyDropSectorAnchor,
  sampleSupplyDropCamera,
} from './supplyDropCamera';
import { CORE_RADIUS } from './sectorGeometry';

function viewpoint(position = new THREE.Vector3(0, 0, 15)) {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100);
  camera.position.copy(position);
  camera.lookAt(0, 0, 0);
  return camera;
}

describe('supply drop camera', () => {
  it('keeps every drag and zoom position, and its sightline, outside the Core', () => {
    for (const sectorId of [0, 125, 795, 1200, 1999]) {
      const anchor = supplyDropSectorAnchor(sectorId);
      const path = createSupplyDropCameraPath(sectorId, viewpoint());
      for (const requestedDistance of [0, 0.05, 1.3, 4, 16, 100]) {
        for (let polar = 0; polar <= Math.PI; polar += Math.PI / 24) {
          const position = path.tangent
            .clone()
            .multiplyScalar(Math.sin(polar))
            .addScaledVector(anchor.normal, Math.cos(polar))
            .multiplyScalar(requestedDistance)
            .add(anchor.position);
          constrainSupplyDropCamera(position, anchor);
          const distance = position.distanceTo(anchor.position);
          expect(distance).toBeGreaterThanOrEqual(
            SUPPLY_DROP_MIN_DISTANCE - 1e-9
          );
          expect(distance).toBeLessThanOrEqual(SUPPLY_DROP_MAX_DISTANCE + 1e-9);
          expect(position.dot(anchor.normal)).toBeGreaterThanOrEqual(
            CORE_RADIUS + SUPPLY_DROP_CORE_CLEARANCE - 1e-9
          );
          for (let step = 0; step <= 10; step += 1) {
            const sightlinePoint = position
              .clone()
              .lerp(anchor.position, step / 10);
            expect(sightlinePoint.length()).toBeGreaterThanOrEqual(
              CORE_RADIUS + SUPPLY_DROP_CORE_CLEARANCE - 1e-9
            );
          }
        }
      }
    }
  });

  it('preserves a valid user viewpoint and does not drift along the surface boundary', () => {
    const path = createSupplyDropCameraPath(795, viewpoint());
    const sample = createCameraPose();
    sampleSupplyDropCamera(path, SUPPLY_DROP_FOCUS_SECONDS, sample);
    const original = sample.position.clone();
    constrainSupplyDropCamera(sample.position, path.anchor);
    expect(sample.position.distanceTo(original)).toBeCloseTo(0);

    sample.position
      .copy(path.anchor.position)
      .addScaledVector(path.anchor.normal, -4);
    constrainSupplyDropCamera(sample.position, path.anchor);
    const boundary = sample.position.clone();
    for (let frame = 0; frame < 120; frame += 1) {
      constrainSupplyDropCamera(sample.position, path.anchor);
    }
    expect(sample.position.distanceTo(boundary)).toBeLessThan(1e-8);
  });

  it('starts at the current viewpoint and holds the close-up before orbiting', () => {
    const start = viewpoint();
    const path = createSupplyDropCameraPath(795, start);
    const sample = createCameraPose();
    sampleSupplyDropCamera(path, 0, sample);
    expect(sample.position.distanceTo(start.position)).toBeCloseTo(0);
    expect(sample.quaternion.angleTo(start.quaternion)).toBeCloseTo(0);

    sampleSupplyDropCamera(path, SUPPLY_DROP_FOCUS_SECONDS, sample);
    const heldPosition = sample.position.clone();
    const heldRotation = sample.quaternion.clone();
    expect(sample.position.distanceTo(path.anchor.position)).toBeLessThan(5);
    sampleSupplyDropCamera(
      path,
      SUPPLY_DROP_FOCUS_SECONDS + SUPPLY_DROP_HOLD_SECONDS,
      sample
    );
    expect(sample.position.distanceTo(heldPosition)).toBeCloseTo(0);
    expect(sample.quaternion.angleTo(heldRotation)).toBeCloseTo(0);
    sampleSupplyDropCamera(path, 16, sample);
    expect(sample.position.distanceTo(heldPosition)).toBeGreaterThan(1);
  });

  it('keeps the marker centered and stays above its surface throughout the orbit', () => {
    const path = createSupplyDropCameraPath(795, viewpoint());
    const sample = createCameraPose();
    const forward = new THREE.Vector3();
    for (
      let elapsed = SUPPLY_DROP_FOCUS_SECONDS;
      elapsed <= 90;
      elapsed += 0.25
    ) {
      sampleSupplyDropCamera(path, elapsed, sample);
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
      const anchor = supplyDropSectorAnchor(sectorId);
      const start = viewpoint(anchor.normal.clone().multiplyScalar(-15));
      const path = createSupplyDropCameraPath(sectorId, start);
      const sample = createCameraPose();
      for (let step = 0; step <= 100; step += 1) {
        sampleSupplyDropCamera(
          path,
          (step / 100) * SUPPLY_DROP_FOCUS_SECONDS,
          sample
        );
        expect(sample.position.length()).toBeGreaterThan(CORE_RADIUS + 2);
        expect(sample.quaternion.length()).toBeCloseTo(1);
      }
    }
  });

  it('can approach directly overhead without a degenerate orbit tangent', () => {
    const anchor = supplyDropSectorAnchor(0);
    const path = createSupplyDropCameraPath(
      0,
      viewpoint(anchor.normal.clone().multiplyScalar(15))
    );
    expect(path.tangent.length()).toBeCloseTo(1);
    expect(path.tangent.dot(anchor.normal)).toBeCloseTo(0);
  });

  it('eases out of the hold and restores the original view exactly on return', () => {
    const start = viewpoint();
    const path = createSupplyDropCameraPath(795, start);
    const closeup = createCameraPose();
    const sample = createCameraPose();
    const orbitStart = SUPPLY_DROP_FOCUS_SECONDS + SUPPLY_DROP_HOLD_SECONDS;
    sampleSupplyDropCamera(path, orbitStart, closeup);
    sampleSupplyDropCamera(path, orbitStart + 0.01, sample);
    expect(sample.position.distanceTo(closeup.position)).toBeLessThan(0.00001);

    sampleSupplyDropCamera(path, 20, closeup);
    interpolateCameraPose(closeup, start, 0, sample);
    expect(sample.position.distanceTo(closeup.position)).toBeCloseTo(0);
    expect(sample.quaternion.angleTo(closeup.quaternion)).toBeCloseTo(0);
    interpolateCameraPose(closeup, start, 1, sample);
    expect(sample.position.distanceTo(start.position)).toBeCloseTo(0);
    expect(sample.quaternion.angleTo(start.quaternion)).toBeCloseTo(0);
  });
});
