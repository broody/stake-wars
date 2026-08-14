import { describe, expect, it } from 'vitest';
import {
  chunkControlPointActions,
  MAX_CONTROL_ACTION_BATCH,
  MAX_CONTROL_POINT_SELECTION,
  requiresControlPointActionSplit,
} from './controlPointLimits';

describe('Control Point action limits', () => {
  it('chunks a 1,000-point selection into five 200-point transactions', () => {
    const selection = Array.from(
      { length: MAX_CONTROL_POINT_SELECTION },
      (_, controlPointId) => controlPointId
    );

    const chunks = chunkControlPointActions(selection);

    expect(chunks).toHaveLength(5);
    expect(
      chunks.every((chunk) => chunk.length === MAX_CONTROL_ACTION_BATCH)
    ).toBe(true);
    expect(chunks.flat()).toEqual(selection);
  });

  it('keeps the final partial chunk', () => {
    expect(
      chunkControlPointActions(
        Array.from({ length: MAX_CONTROL_ACTION_BATCH + 1 }, (_, id) => id)
      ).map((chunk) => chunk.length)
    ).toEqual([MAX_CONTROL_ACTION_BATCH, 1]);
  });

  it('requires split progress only above the atomic batch limit', () => {
    expect(requiresControlPointActionSplit(MAX_CONTROL_ACTION_BATCH)).toBe(
      false
    );
    expect(requiresControlPointActionSplit(MAX_CONTROL_ACTION_BATCH + 1)).toBe(
      true
    );
    expect(requiresControlPointActionSplit(MAX_CONTROL_POINT_SELECTION)).toBe(
      true
    );
  });

  it('rejects selections above 1,000 points', () => {
    expect(() =>
      chunkControlPointActions(
        Array.from({ length: MAX_CONTROL_POINT_SELECTION + 1 }, (_, id) => id)
      )
    ).toThrow('At most 1000 Control Points can be selected');
  });
});
