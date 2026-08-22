import { describe, expect, it } from 'vitest';
import { adjacentSectorIds } from './sectorGeometry';
import {
  combineSectorSelections,
  contiguousSectorIds,
  updateSectorSelection,
} from './sectorSelection';

describe('Sector selection', () => {
  it('uses a normal click for exclusive selection', () => {
    expect(updateSectorSelection([10, 11], 12, false)).toEqual([12]);
  });

  it('toggles off the only selected sector on a normal click', () => {
    expect(updateSectorSelection([12], 12, false)).toEqual([]);
  });

  it('adds a sector with Shift-click', () => {
    expect(updateSectorSelection([10], 12, true)).toEqual([10, 12]);
  });

  it('removes an existing sector with Shift-click', () => {
    expect(updateSectorSelection([10, 11, 12], 11, true)).toEqual([10, 12]);
  });

  it('adds a contiguous selection when Shift is held', () => {
    expect(combineSectorSelections([10, 11], [11, 12, 13], true)).toEqual([
      10, 11, 12, 13,
    ]);
  });

  it('replaces the current selection without Shift', () => {
    expect(combineSectorSelections([10, 11], [12, 13], false)).toEqual([
      12, 13,
    ]);
  });

  it('finds only the connected component containing the starting sector', () => {
    const start = 10;
    const neighbor = adjacentSectorIds(start)[0];
    const disconnected = Array.from({ length: 2_000 }, (_, id) => id).find(
      (sectorId) =>
        sectorId !== start &&
        sectorId !== neighbor &&
        !adjacentSectorIds(start).includes(sectorId) &&
        !adjacentSectorIds(neighbor).includes(sectorId)
    );

    expect(disconnected).toBeDefined();
    expect(
      contiguousSectorIds(start, [start, neighbor, disconnected!])
    ).toEqual([start, neighbor].sort((left, right) => left - right));
  });

  it('returns no sectors when the starting sector is not a candidate', () => {
    expect(contiguousSectorIds(10, adjacentSectorIds(10))).toEqual([]);
  });
});
