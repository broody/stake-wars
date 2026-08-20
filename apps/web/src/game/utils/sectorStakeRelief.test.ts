import { describe, expect, it } from 'vitest';
import {
  MAX_STAKE_RELIEF_HEIGHT,
  STAKE_RELIEF_CAP_STRK,
  sectorStakeHeights,
  stakeReliefHeightFromBaseUnits,
} from './sectorStakeRelief';

const STRK = 10n ** 18n;

describe('Sector stake relief', () => {
  it('maps base-unit FORCE to the same capped logarithmic relief scale', () => {
    expect(stakeReliefHeightFromBaseUnits(100n * STRK)).toBeLessThan(
      stakeReliefHeightFromBaseUnits(1_000n * STRK)
    );
    expect(
      stakeReliefHeightFromBaseUnits(BigInt(STAKE_RELIEF_CAP_STRK) * STRK)
    ).toBeCloseTo(MAX_STAKE_RELIEF_HEIGHT);
    expect(
      stakeReliefHeightFromBaseUnits(BigInt(STAKE_RELIEF_CAP_STRK * 10) * STRK)
    ).toBeCloseTo(MAX_STAKE_RELIEF_HEIGHT);
  });

  it('supports an absolute linear scale', () => {
    expect(
      stakeReliefHeightFromBaseUnits(
        BigInt(STAKE_RELIEF_CAP_STRK / 2) * STRK,
        false
      )
    ).toBeCloseTo(MAX_STAKE_RELIEF_HEIGHT / 2);
  });

  it('builds heights from each Sector capture force only when enabled', () => {
    const forces = new Map([
      [4, 1_000n * STRK],
      [9, 50_000n * STRK],
    ]);

    const staked = sectorStakeHeights(true, [4, 9], forces, false);
    expect(staked.get(4)).toBeGreaterThan(0);
    expect(staked.get(9)).toBeGreaterThan(staked.get(4) ?? 0);
    expect(sectorStakeHeights(false, [4, 9], forces)).toEqual(
      new Map([
        [4, 0],
        [9, 0],
      ])
    );
  });
});
