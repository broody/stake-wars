import { describe, expect, it } from 'vitest';
import {
  chunkSectorActions,
  MAX_CONTROL_ACTION_BATCH,
  MAX_SECTOR_SELECTION,
  requiresSectorActionSplit,
} from './sectorLimits';

describe('Sector action limits', () => {
  it('chunks a 1,000-sector selection into five 200-sector transactions', () => {
    const selection = Array.from(
      { length: MAX_SECTOR_SELECTION },
      (_, sectorId) => sectorId
    );

    const chunks = chunkSectorActions(selection);

    expect(chunks).toHaveLength(5);
    expect(
      chunks.every((chunk) => chunk.length === MAX_CONTROL_ACTION_BATCH)
    ).toBe(true);
    expect(chunks.flat()).toEqual(selection);
  });

  it('keeps the final partial chunk', () => {
    expect(
      chunkSectorActions(
        Array.from({ length: MAX_CONTROL_ACTION_BATCH + 1 }, (_, id) => id)
      ).map((chunk) => chunk.length)
    ).toEqual([MAX_CONTROL_ACTION_BATCH, 1]);
  });

  it('requires split progress only above the atomic batch limit', () => {
    expect(requiresSectorActionSplit(MAX_CONTROL_ACTION_BATCH)).toBe(false);
    expect(requiresSectorActionSplit(MAX_CONTROL_ACTION_BATCH + 1)).toBe(true);
    expect(requiresSectorActionSplit(MAX_SECTOR_SELECTION)).toBe(true);
  });

  it('rejects selections above 1,000 sectors', () => {
    expect(() =>
      chunkSectorActions(
        Array.from({ length: MAX_SECTOR_SELECTION + 1 }, (_, id) => id)
      )
    ).toThrow('At most 1000 Sectors can be selected');
  });
});
