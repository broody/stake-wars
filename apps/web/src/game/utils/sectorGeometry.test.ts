import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  SECTOR_COUNT,
  adjacentSectorIds,
  createSectorBoundaryGeometry,
  createSectorGeometry,
  createSectorGroupGridGeometries,
  createSectorSetGeometry,
  createExtrudedSectorGeometries,
  createRaisedSectorSetGeometry,
  createSeparatedSectorSetGeometry,
  extractSectorPositions,
  isSectorId,
} from './sectorGeometry';

describe('canonical Sector geometry', () => {
  it('contains exactly one triangle for every on-chain Sector', () => {
    const geometry = createSectorGeometry();

    expect(geometry.index).toBeNull();
    expect(geometry.getAttribute('position').count / 3).toBe(SECTOR_COUNT);
  });

  it('uses a stable, deterministic ordering for Sector IDs', () => {
    const geometry = createSectorGeometry();
    const positions = geometry.getAttribute('position').array as Float32Array;
    const digest = createHash('sha256')
      .update(Buffer.from(positions.buffer))
      .digest('hex');

    expect(digest).toBe(
      '7ff5ef80dbd17349029311018c6fa166d31295a308f079076c3bdb2ca682801d'
    );
  });

  it('extracts the triangle assigned to a Sector ID', () => {
    const geometry = createSectorGeometry();
    const positions = geometry.getAttribute('position').array as Float32Array;
    const sectorId = 1_337;

    expect(Array.from(extractSectorPositions([sectorId]))).toEqual(
      Array.from(positions.slice(sectorId * 9, sectorId * 9 + 9))
    );
  });

  it('combines multiple Sectors into one render layer', () => {
    const geometry = createSectorSetGeometry([3, 21, 987]);

    expect(geometry.getAttribute('position').count / 3).toBe(3);
  });

  it('keeps only the exterior boundary of adjacent Sectors', () => {
    const sectorId = 0;
    const adjacentSectorId = adjacentSectorIds(sectorId)[0];
    const singleBoundary = createSectorBoundaryGeometry([sectorId]);
    const combinedBoundary = createSectorBoundaryGeometry([
      sectorId,
      adjacentSectorId,
    ]);

    expect(singleBoundary.getAttribute('position').count).toBe(6);
    expect(combinedBoundary.getAttribute('position').count).toBe(8);
  });

  it('raises each Sector to its configured absolute height', () => {
    const heights = new Map([
      [3, 0.25],
      [21, 0.75],
    ]);
    const geometry = createRaisedSectorSetGeometry([3, 21], heights);
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

  it('builds one top and three prism walls per extruded sector', () => {
    const { tops, sides, topSectorIds, sideSectorIds } =
      createExtrudedSectorGeometries(
        [3, 21],
        new Map([
          [3, 0.25],
          [21, 0],
        ])
      );

    expect(tops.getAttribute('position').count).toBe(6);
    expect(sides.getAttribute('position').count).toBe(18);
    expect(topSectorIds).toEqual([3, 21]);
    expect(sideSectorIds).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it('can retain collapsed walls for topology-stable relief animation', () => {
    const { sides, sideSectorIds } = createExtrudedSectorGeometries(
      [3, 21],
      new Map([
        [3, 0.25],
        [21, 0],
      ]),
      5,
      undefined,
      true
    );

    expect(sides.getAttribute('position').count).toBe(36);
    expect(sideSectorIds).toEqual([3, 3, 3, 3, 3, 3, 21, 21, 21, 21, 21, 21]);
  });

  it('rejects negative or non-finite extrusion heights', () => {
    expect(() =>
      createExtrudedSectorGeometries([3], new Map([[3, -0.1]]))
    ).toThrow(RangeError);
    expect(() =>
      createExtrudedSectorGeometries([3], new Map([[3, Infinity]]))
    ).toThrow(RangeError);
  });

  it('adds padding only where Sectors have distinct owners', () => {
    const geometry = createSectorGeometry();
    const positions = geometry.getAttribute('position').array as Float32Array;
    const edgeOwners = new Map<string, number[]>();

    for (let sectorId = 0; sectorId < 2_000; sectorId += 1) {
      const triangleOffset = sectorId * 9;
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
        owners.push(sectorId);
        edgeOwners.set(edge, owners);
      }
    }

    const adjacentSectors = [...edgeOwners.values()].find(
      (owners) => owners.length === 2
    );
    expect(adjacentSectors).toBeDefined();

    const originalPositions = extractSectorPositions(adjacentSectors!);
    const sharedOwnerPositions = createSeparatedSectorSetGeometry(
      adjacentSectors!,
      [adjacentSectors!]
    ).getAttribute('position').array;
    const separateOwnerPositions = createSeparatedSectorSetGeometry(
      adjacentSectors!,
      adjacentSectors!.map((id) => [id])
    ).getAttribute('position').array;

    expect(Array.from(sharedOwnerPositions)).toEqual(
      Array.from(originalPositions)
    );
    expect(Array.from(separateOwnerPositions)).not.toEqual(
      Array.from(originalPositions)
    );

    const sharedOwnerGrid = createSectorGroupGridGeometries([adjacentSectors!]);
    const separateOwnerGrid = createSectorGroupGridGeometries(
      adjacentSectors!.map((id) => [id])
    );
    expect(sharedOwnerGrid.boundaries.getAttribute('position').count).toBe(8);
    expect(sharedOwnerGrid.interiors.getAttribute('position').count).toBe(2);
    expect(sharedOwnerGrid.boundarySectorIds).toHaveLength(4);
    expect(sharedOwnerGrid.interiorSectorIds).toHaveLength(1);
    expect(
      new Set([
        ...sharedOwnerGrid.boundarySectorIds,
        ...sharedOwnerGrid.interiorSectorIds,
      ])
    ).toEqual(new Set(adjacentSectors!));
    expect(separateOwnerGrid.boundaries.getAttribute('position').count).toBe(
      12
    );
    expect(separateOwnerGrid.interiors.getAttribute('position').count).toBe(0);
    expect(separateOwnerGrid.boundarySectorIds).toHaveLength(6);
    expect(separateOwnerGrid.interiorSectorIds).toHaveLength(0);

    const heights = new Map(
      adjacentSectors!.map((sectorId) => [sectorId, 0.5])
    );
    const sharedOwnerTops = createExtrudedSectorGeometries(
      adjacentSectors!,
      heights,
      5,
      [adjacentSectors!]
    ).tops.getAttribute('position').array;
    const separateOwnerRelief = createExtrudedSectorGeometries(
      adjacentSectors!,
      heights,
      5,
      adjacentSectors!.map((id) => [id])
    );
    const separateOwnerTops =
      separateOwnerRelief.tops.getAttribute('position').array;

    expect(Array.from(sharedOwnerTops)).not.toEqual(
      Array.from(separateOwnerTops)
    );
    expect(separateOwnerRelief.topSectorIds).toHaveLength(
      separateOwnerRelief.tops.getAttribute('position').count / 3
    );
    expect(new Set(separateOwnerRelief.topSectorIds)).toEqual(
      new Set(adjacentSectors!)
    );
  });

  it('rejects IDs outside the on-chain range', () => {
    expect(isSectorId(0)).toBe(true);
    expect(isSectorId(SECTOR_COUNT - 1)).toBe(true);
    expect(isSectorId(-1)).toBe(false);
    expect(isSectorId(SECTOR_COUNT)).toBe(false);
    expect(() => extractSectorPositions([SECTOR_COUNT])).toThrow(RangeError);
  });
});
