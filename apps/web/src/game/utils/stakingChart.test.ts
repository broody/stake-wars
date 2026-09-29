import { describe, expect, it } from 'vitest';
import type { StakingHistoryPoint } from '../types/staking';
import { plottablePoints, pointsInRange } from './stakingChart';

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
});
