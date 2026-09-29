import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CORE_RADIUS,
  extractSectorPositions,
  SECTOR_COUNT,
} from './sectorGeometry';
import {
  addSectorFlipAttributes,
  addSectorLineFlipAttributes,
  randomOutsideSectorWaveOrigin,
  randomSectorWaveOrigin,
  randomVisibleOutsideSectorWaveOrigin,
  sectorFlipWaveDelayForCount,
  sectorFlipParameters,
  sectorWaveDelay,
  sectorWaveDistanceRange,
  SECTOR_FLIP_MAX_WAVE_DELAY,
} from './sectorFlip';

describe('sector flip parameters', () => {
  it('creates a repeatable unit-length wave origin from an injected source', () => {
    const values = [0.75, 0.25];
    const origin = randomSectorWaveOrigin(() => values.shift() ?? 0);

    expect(origin.length()).toBeCloseTo(1);
    expect(origin.y).toBeCloseTo(0.5);
    expect(origin.x).toBeCloseTo(0);
    expect(origin.z).toBeCloseTo(Math.sqrt(0.75));
  });

  it('delays sectors by their spherical distance from the wave origin', () => {
    const origin = new THREE.Vector3(0, 1, 0);

    expect(sectorWaveDelay(origin, origin)).toBeCloseTo(0);
    expect(sectorWaveDelay(new THREE.Vector3(1, 0, 0), origin)).toBeCloseTo(
      SECTOR_FLIP_MAX_WAVE_DELAY / 2
    );
    expect(sectorWaveDelay(new THREE.Vector3(0, -1, 0), origin)).toBeCloseTo(
      SECTOR_FLIP_MAX_WAVE_DELAY
    );
  });

  it('anchors the wave outside the owned Sectors and spans their distance range', () => {
    const sectorIds = [0, 2, 3];
    const origin = randomOutsideSectorWaveOrigin(
      sectorIds,
      CORE_RADIUS,
      () => 0
    );
    const expectedOrigin = sectorFlipParameters(
      1,
      0,
      CORE_RADIUS
    ).pivot.normalize();
    const range = sectorWaveDistanceRange(sectorIds, origin, CORE_RADIUS);

    expect(origin.distanceTo(expectedOrigin)).toBeCloseTo(0);
    expect(range.x).toBeGreaterThan(0);
    expect(range.y).toBeGreaterThan(range.x);
  });

  it('chooses a visible origin outside occupied Sectors when one is in view', () => {
    const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 100);
    camera.position.set(0, 0, 13);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const visibleSectorIds = Array.from(
      { length: SECTOR_COUNT },
      (_, sectorId) => sectorId
    ).filter((sectorId) => {
      const position = sectorFlipParameters(sectorId, 0, CORE_RADIUS).pivot;
      const projected = position.clone().project(camera);
      return (
        position
          .clone()
          .normalize()
          .dot(camera.position.clone().sub(position).normalize()) > 0 &&
        Math.abs(projected.x) <= 1 &&
        Math.abs(projected.y) <= 1 &&
        projected.z >= -1 &&
        projected.z <= 1
      );
    });
    const expectedSectorId = visibleSectorIds[0];
    if (expectedSectorId === undefined) {
      throw new Error('Expected at least one visible Sector');
    }
    const excludedSectorIds = Array.from(
      { length: SECTOR_COUNT },
      (_, sectorId) => sectorId
    ).filter((sectorId) => sectorId !== expectedSectorId);

    const origin = randomVisibleOutsideSectorWaveOrigin(
      excludedSectorIds,
      camera,
      CORE_RADIUS,
      () => 0
    );
    const expectedOrigin = sectorFlipParameters(
      expectedSectorId,
      0,
      CORE_RADIUS
    ).pivot.normalize();
    const projectedOrigin = origin
      .clone()
      .multiplyScalar(CORE_RADIUS)
      .project(camera);

    expect(origin.distanceTo(expectedOrigin)).toBeCloseTo(0);
    expect(Math.abs(projectedOrigin.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(projectedOrigin.y)).toBeLessThanOrEqual(1);
  });

  it('keeps a seven-Sector wave compact and gives larger sets more travel', () => {
    const sevenSectorDelay = sectorFlipWaveDelayForCount(7);

    expect(sevenSectorDelay).toBeGreaterThan(0.35);
    expect(sevenSectorDelay).toBeLessThan(0.45);
    expect(sectorFlipWaveDelayForCount(64)).toBeGreaterThan(sevenSectorDelay);
    expect(sectorFlipWaveDelayForCount(2_000)).toBe(SECTOR_FLIP_MAX_WAVE_DELAY);
  });

  it('produces finite transforms for every Sector', () => {
    for (let sectorId = 0; sectorId < 2_000; sectorId += 1) {
      const parameters = sectorFlipParameters(sectorId, 0, CORE_RADIUS);
      expect(parameters.axis.toArray().every(Number.isFinite)).toBe(true);
      expect(parameters.normal.toArray().every(Number.isFinite)).toBe(true);
      expect(parameters.pivot.toArray().every(Number.isFinite)).toBe(true);
    }
  });

  it('keeps each flip axis tangent to its Sector with an outward normal', () => {
    for (const sectorId of [0, 1, 47, 511, 1999]) {
      const parameters = sectorFlipParameters(sectorId, 0, CORE_RADIUS);
      const positions = extractSectorPositions([sectorId], CORE_RADIUS);
      const first = new THREE.Vector3().fromArray(positions, 0);
      const second = new THREE.Vector3().fromArray(positions, 3);
      const third = new THREE.Vector3().fromArray(positions, 6);
      const faceNormal = second.sub(first).cross(third.sub(first)).normalize();

      expect(parameters.axis.length()).toBeCloseTo(1);
      expect(Math.abs(parameters.axis.dot(faceNormal))).toBeLessThan(0.000001);
      expect(parameters.normal.length()).toBeCloseTo(1);
      expect(parameters.normal.dot(parameters.pivot)).toBeGreaterThan(0);
    }
  });

  it('uses the same world-oriented hinge direction', () => {
    const first = sectorFlipParameters(23, 0, CORE_RADIUS);
    const repeated = sectorFlipParameters(23, 0, CORE_RADIUS);
    const neighboring = sectorFlipParameters(24, 0, CORE_RADIUS);

    expect(repeated.axis.equals(first.axis)).toBe(true);

    for (const parameters of [first, neighboring]) {
      const worldUp = new THREE.Vector3(0, 1, 0);
      const expectedAxis = worldUp
        .sub(parameters.normal.clone().multiplyScalar(parameters.normal.y))
        .normalize();

      expect(parameters.axis.dot(expectedAxis)).toBeCloseTo(1);
    }
  });

  it('assigns one shared flip transform to every vertex of a face', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
        3
      )
    );

    addSectorFlipAttributes(
      geometry,
      [7, 8],
      new Map<number, number>(),
      CORE_RADIUS
    );

    const axes = geometry.getAttribute('flipAxis');
    const normals = geometry.getAttribute('flipNormal');
    expect(axes.getX(0)).toBe(axes.getX(2));
    expect(axes.getY(0)).toBe(axes.getY(2));
    expect(axes.getZ(0)).toBe(axes.getZ(2));
    expect(normals.getX(0)).toBe(normals.getX(2));
    expect(normals.getY(0)).toBe(normals.getY(2));
    expect(normals.getZ(0)).toBe(normals.getZ(2));

    geometry.dispose();
  });

  it('assigns panel transforms to ownership-grid line segments', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], 3)
    );

    addSectorLineFlipAttributes(
      geometry,
      [7, 8],
      new Map<number, number>(),
      CORE_RADIUS
    );

    const pivots = geometry.getAttribute('flipPivot');
    expect(pivots.count).toBe(4);
    expect(pivots.getX(0)).toBe(pivots.getX(1));
    expect(pivots.getY(0)).toBe(pivots.getY(1));
    expect(pivots.getZ(0)).toBe(pivots.getZ(1));
    expect(
      new THREE.Vector3()
        .fromBufferAttribute(pivots, 0)
        .equals(new THREE.Vector3().fromBufferAttribute(pivots, 2))
    ).toBe(false);

    geometry.dispose();
  });
});
