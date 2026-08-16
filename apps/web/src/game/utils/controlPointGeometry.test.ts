import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CONTROL_POINT_COUNT,
  adjacentControlPointIds,
  createControlPointBoundaryGeometry,
  createControlPointGeometry,
  createControlPointSetGeometry,
  createExtrudedControlPointGeometries,
  createRaisedControlPointSetGeometry,
  createSeparatedControlPointSetGeometry,
  extractControlPointPositions,
  isControlPointId,
} from './controlPointGeometry';

describe('canonical Control Point geometry', () => {
  it('contains exactly one triangle for every on-chain Control Point', () => {
    const geometry = createControlPointGeometry();

    expect(geometry.index).toBeNull();
    expect(geometry.getAttribute('position').count / 3).toBe(
      CONTROL_POINT_COUNT
    );
  });

  it('uses a stable, deterministic ordering for Control Point IDs', () => {
    const geometry = createControlPointGeometry();
    const positions = geometry.getAttribute('position').array as Float32Array;
    const digest = createHash('sha256')
      .update(Buffer.from(positions.buffer))
      .digest('hex');

    expect(digest).toBe(
      '7ff5ef80dbd17349029311018c6fa166d31295a308f079076c3bdb2ca682801d'
    );
  });

  it('extracts the triangle assigned to a Control Point ID', () => {
    const geometry = createControlPointGeometry();
    const positions = geometry.getAttribute('position').array as Float32Array;
    const controlPointId = 1_337;

    expect(Array.from(extractControlPointPositions([controlPointId]))).toEqual(
      Array.from(positions.slice(controlPointId * 9, controlPointId * 9 + 9))
    );
  });

  it('combines multiple Control Points into one render layer', () => {
    const geometry = createControlPointSetGeometry([3, 21, 987]);

    expect(geometry.getAttribute('position').count / 3).toBe(3);
  });

  it('keeps only the exterior boundary of adjacent Control Points', () => {
    const controlPointId = 0;
    const adjacentControlPointId = adjacentControlPointIds(controlPointId)[0];
    const singleBoundary = createControlPointBoundaryGeometry([controlPointId]);
    const combinedBoundary = createControlPointBoundaryGeometry([
      controlPointId,
      adjacentControlPointId,
    ]);

    expect(singleBoundary.getAttribute('position').count).toBe(6);
    expect(combinedBoundary.getAttribute('position').count).toBe(8);
  });

  it('raises each Control Point to its configured absolute height', () => {
    const heights = new Map([
      [3, 0.25],
      [21, 0.75],
    ]);
    const geometry = createRaisedControlPointSetGeometry([3, 21], heights);
    const positions = geometry.getAttribute('position');

    for (let vertex = 0; vertex < 3; vertex += 1) {
      expect(
        Math.hypot(
          positions.getX(vertex),
          positions.getY(vertex),
          positions.getZ(vertex)
        )
      ).toBeCloseTo(5.25, 5);
    }
    for (let vertex = 3; vertex < 6; vertex += 1) {
      expect(
        Math.hypot(
          positions.getX(vertex),
          positions.getY(vertex),
          positions.getZ(vertex)
        )
      ).toBeCloseTo(5.75, 5);
    }
  });

  it('builds one top and three prism walls per extruded point', () => {
    const { tops, sides, topControlPointIds, sideControlPointIds } =
      createExtrudedControlPointGeometries(
        [3, 21],
        new Map([
          [3, 0.25],
          [21, 0],
        ])
      );

    expect(tops.getAttribute('position').count).toBe(6);
    expect(sides.getAttribute('position').count).toBe(18);
    expect(topControlPointIds).toEqual([3, 21]);
    expect(sideControlPointIds).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it('rejects negative or non-finite extrusion heights', () => {
    expect(() =>
      createExtrudedControlPointGeometries([3], new Map([[3, -0.1]]))
    ).toThrow(RangeError);
    expect(() =>
      createExtrudedControlPointGeometries([3], new Map([[3, Infinity]]))
    ).toThrow(RangeError);
  });

  it('adds padding only where Control Points have distinct owners', () => {
    const geometry = createControlPointGeometry();
    const positions = geometry.getAttribute('position').array as Float32Array;
    const edgeOwners = new Map<string, number[]>();

    for (let controlPointId = 0; controlPointId < 2_000; controlPointId += 1) {
      const triangleOffset = controlPointId * 9;
      const triangle = Array.from(
        positions.slice(triangleOffset, triangleOffset + 9)
      );

      for (let vertex = 0; vertex < 3; vertex += 1) {
        const nextVertex = (vertex + 1) % 3;
        const edge = [
          triangle.slice(vertex * 3, (vertex + 1) * 3),
          triangle.slice(nextVertex * 3, (nextVertex + 1) * 3),
        ]
          .map((coordinates) => coordinates.join(','))
          .sort()
          .join('|');
        const owners = edgeOwners.get(edge) ?? [];
        owners.push(controlPointId);
        edgeOwners.set(edge, owners);
      }
    }

    const adjacentControlPoints = [...edgeOwners.values()].find(
      (owners) => owners.length === 2
    );
    expect(adjacentControlPoints).toBeDefined();

    const originalPositions = extractControlPointPositions(
      adjacentControlPoints!
    );
    const sharedOwnerPositions = createSeparatedControlPointSetGeometry(
      adjacentControlPoints!,
      [adjacentControlPoints!]
    ).getAttribute('position').array;
    const separateOwnerPositions = createSeparatedControlPointSetGeometry(
      adjacentControlPoints!,
      adjacentControlPoints!.map((id) => [id])
    ).getAttribute('position').array;

    expect(Array.from(sharedOwnerPositions)).toEqual(
      Array.from(originalPositions)
    );
    expect(Array.from(separateOwnerPositions)).not.toEqual(
      Array.from(originalPositions)
    );

    const heights = new Map(
      adjacentControlPoints!.map((controlPointId) => [controlPointId, 0.5])
    );
    const sharedOwnerTops = createExtrudedControlPointGeometries(
      adjacentControlPoints!,
      heights,
      5,
      [adjacentControlPoints!]
    ).tops.getAttribute('position').array;
    const separateOwnerRelief = createExtrudedControlPointGeometries(
      adjacentControlPoints!,
      heights,
      5,
      adjacentControlPoints!.map((id) => [id])
    );
    const separateOwnerTops =
      separateOwnerRelief.tops.getAttribute('position').array;

    expect(Array.from(sharedOwnerTops)).not.toEqual(
      Array.from(separateOwnerTops)
    );
    expect(separateOwnerRelief.topControlPointIds).toHaveLength(
      separateOwnerRelief.tops.getAttribute('position').count / 3
    );
    expect(new Set(separateOwnerRelief.topControlPointIds)).toEqual(
      new Set(adjacentControlPoints!)
    );
  });

  it('rejects IDs outside the on-chain range', () => {
    expect(isControlPointId(0)).toBe(true);
    expect(isControlPointId(CONTROL_POINT_COUNT - 1)).toBe(true);
    expect(isControlPointId(-1)).toBe(false);
    expect(isControlPointId(CONTROL_POINT_COUNT)).toBe(false);
    expect(() => extractControlPointPositions([CONTROL_POINT_COUNT])).toThrow(
      RangeError
    );
  });
});
