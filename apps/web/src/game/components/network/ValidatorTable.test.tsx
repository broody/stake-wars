import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { StakingSnapshot, StakingValidator } from '../../types/staking';
import { ValidatorTable } from './ValidatorTable';

function validator(
  address: string,
  overrides: Partial<StakingValidator> = {}
): StakingValidator {
  return {
    address,
    rewardAddress: '0x1',
    operationalAddress: '0x2',
    rank: null,
    featured: false,
    status: 'active',
    unstakeAt: null,
    selfStake: '0',
    delegatedStrk: '0',
    totalStrk: '0',
    delegatedBtc: '0',
    pools: [],
    commissionBps: 1000,
    stakingPowerPercent: 0,
    aprStrkPercent: 6.75,
    aprBtcPercent: null,
    delegators: 3,
    pendingStrk: '0',
    pendingBtc: '0',
    unclaimedRewards: '0',
    ...overrides,
  };
}

function snapshot(validators: StakingValidator[]): StakingSnapshot {
  return {
    block: { number: 100, timestamp: 1_000 },
    totals: { activeValidators: 2, exitingValidators: 1 },
    featured: validators.find((entry) => entry.featured) ?? null,
    validators,
  } as unknown as StakingSnapshot;
}

describe('ValidatorTable', () => {
  it('pins the Stake Wars validator and keeps exiting validators last', () => {
    const markup = renderToStaticMarkup(
      <ValidatorTable
        snapshot={snapshot([
          validator('0xaaa1', { rank: 1, stakingPowerPercent: 60 }),
          validator('0xexit', { status: 'exiting', unstakeAt: 5_000 }),
          validator('0xbbb2', {
            rank: 2,
            stakingPowerPercent: 40,
            featured: true,
            totalStrk: '935000000000000000000000',
          }),
        ])}
      />
    );

    const featured = markup.indexOf('WARS');
    expect(featured).toBeGreaterThan(-1);
    expect(featured).toBeLessThan(markup.indexOf('0xaaa1'));
    expect(markup.indexOf('0xaaa1')).toBeLessThan(markup.indexOf('0xexit'));
    // The pinned validator is not repeated in the ranked rows.
    expect(markup.split('>0xbbb2<').length - 1).toBe(1);
    expect(markup).toContain('935K');
    expect(markup).toContain('EXITING 1H 6M');
    expect(markup).toContain('1 / 1');
  });
});
