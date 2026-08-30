import { describe, expect, it } from 'vitest';
import { stakeAmountFromSearch, stakeRequestSearch } from './stakingRequest';

describe('staking requests', () => {
  it('creates a staking link for the exact FORCE shortfall', () => {
    expect(stakeRequestSearch(100_250_000_000_000_000_000n)).toBe(
      '?amount=100.25'
    );
  });

  it('normalizes a requested staking amount for the form', () => {
    expect(stakeAmountFromSearch(new URLSearchParams('amount=100.2500'))).toBe(
      '100.25'
    );
  });

  it('ignores invalid staking amounts', () => {
    expect(
      stakeAmountFromSearch(new URLSearchParams('amount=not-a-number'))
    ).toBe('');
  });
});
