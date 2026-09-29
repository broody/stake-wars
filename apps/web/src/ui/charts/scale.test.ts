import { describe, expect, it } from 'vitest';
import { nearestIndex, niceTicks } from './scale';

describe('chart scale', () => {
  it('rounds axis maxima to clean steps from zero', () => {
    expect(niceTicks(1_609_000_000)).toEqual([0, 5e8, 1e9, 1.5e9, 2e9]);
    expect(niceTicks(590.66)).toEqual([0, 200, 400, 600]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });

  it('finds the nearest point in time', () => {
    const points = [{ t: 0 }, { t: 10 }, { t: 20 }];
    expect(nearestIndex(points, -5)).toBe(0);
    expect(nearestIndex(points, 4)).toBe(0);
    expect(nearestIndex(points, 6)).toBe(1);
    expect(nearestIndex(points, 99)).toBe(2);
  });
});
