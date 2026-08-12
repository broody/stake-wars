import { describe, expect, it } from 'vitest';
import { updateControlPointSelection } from './controlPointSelection';

describe('Control Point selection', () => {
  it('uses a normal click for exclusive selection', () => {
    expect(updateControlPointSelection([10, 11], 12, false)).toEqual([12]);
  });

  it('toggles off the only selected point on a normal click', () => {
    expect(updateControlPointSelection([12], 12, false)).toEqual([]);
  });

  it('adds a point with Shift-click', () => {
    expect(updateControlPointSelection([10], 12, true)).toEqual([10, 12]);
  });

  it('removes an existing point with Shift-click', () => {
    expect(updateControlPointSelection([10, 11, 12], 11, true)).toEqual([
      10, 12,
    ]);
  });
});
