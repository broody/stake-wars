import { describe, expect, it } from 'vitest';
import { updateSectorSelection } from './sectorSelection';

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
});
