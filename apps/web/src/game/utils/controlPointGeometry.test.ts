import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CONTROL_POINT_COUNT,
  createControlPointGeometry,
  createControlPointSetGeometry,
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
