import { describe, expect, it } from 'vitest';
import type { ControlPointStatus } from '../types';
import { groupBatchControlPoints } from './controlPointBatch';

function point(
  id: number,
  controller: string,
  overrides: Partial<ControlPointStatus> = {}
): ControlPointStatus {
  return {
    id,
    controller,
    captureForce: controller === '0x0' ? 0n : 100n,
    ownershipGeneration: 0n,
    controlledSince: null,
    requiredStake: 100n,
    activeChallengeId: 0n,
    challengeLeadChangeCount: 0,
    challengeDeadline: null,
    stale: false,
    needsSync: false,
    ...overrides,
  };
}

describe('batch Control Point grouping', () => {
  it('keeps neutral captures and owned fortifications batchable', () => {
    const groups = groupBatchControlPoints(
      [point(1, '0x0'), point(2, '0xabc'), point(3, '0xdef')],
      '0xabc'
    );

    expect(groups.neutral.map(({ id }) => id)).toEqual([1]);
    expect(groups.owned.map(({ id }) => id)).toEqual([2]);
    expect(groups.individualOnly.map(({ id }) => id)).toEqual([3]);
  });

  it('excludes challenged and stale points from batching', () => {
    const groups = groupBatchControlPoints(
      [
        point(1, '0x0', { activeChallengeId: 4n }),
        point(2, '0xabc', { stale: true }),
        point(3, '0xabc', { needsSync: true }),
      ],
      '0xabc'
    );

    expect(groups.neutral).toEqual([]);
    expect(groups.owned).toEqual([]);
    expect(groups.individualOnly.map(({ id }) => id)).toEqual([1, 2, 3]);
  });
});
