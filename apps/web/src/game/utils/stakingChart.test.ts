import { describe, expect, it } from 'vitest';
import type { StakingHistoryPoint } from '../types/staking';
import {
  nearestIndex,
  niceTicks,
  plottablePoints,
  pointsInRange,
} from './stakingChart';

function point(timestamp: number): StakingHistoryPoint {
  return {
    timestamp,
    block: timestamp,
    strkStaked: '0',
    btcStaked: '0',
    strkPending: '0',
    btcPending: '0',
    featuredStrk: null,
    featuredBtc: null,
    live: false,
  };
}

describe('staking chart helpers', () => {
  it('rounds axis maxima to clean steps from zero', () => {
    expect(niceTicks(1_609_000_000)).toEqual([0, 5e8, 1e9, 1.5e9, 2e9]);
    expect(niceTicks(590.66)).toEqual([0, 200, 400, 600]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });

  it('keeps the points within a range of the newest point', () => {
    const day = 86_400;
    const points = [
      point(0),
      point(40 * day),
      point(80 * day),
      point(100 * day),
    ];
    expect(
      pointsInRange(points, '30d').map((entry) => entry.timestamp)
    ).toEqual([80 * day, 100 * day]);
    expect(pointsInRange(points, 'all')).toHaveLength(4);
    expect(pointsInRange([], '30d')).toEqual([]);
  });

  it('plots the live point only when daily history reaches it', () => {
    const day = 86_400;
    const live = { ...point(10 * day), live: true };
    expect(plottablePoints([point(0), point(9 * day), live])).toHaveLength(3);
    expect(plottablePoints([point(0), point(5 * day), live])).toHaveLength(2);
    expect(plottablePoints([live])).toHaveLength(1);
  });

  it('finds the nearest point in time', () => {
    const points = [{ t: 0 }, { t: 10 }, { t: 20 }];
    expect(nearestIndex(points, -5)).toBe(0);
    expect(nearestIndex(points, 4)).toBe(0);
    expect(nearestIndex(points, 6)).toBe(1);
    expect(nearestIndex(points, 99)).toBe(2);
  });
});
