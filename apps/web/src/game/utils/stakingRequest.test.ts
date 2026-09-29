import { describe, expect, it } from 'vitest';
import {
  stakeAmountFromSearch,
  stakeRequestSearch,
  stakeReturnsToCore,
} from './stakingRequest';

describe('staking requests', () => {
  it('creates a staking link for the exact FORCE shortfall', () => {
    expect(stakeRequestSearch(100_250_000_000_000_000_000n)).toBe(
      '?amount=100.25&return=core'
    );
  });

  it('returns to the Core only after a stake requested from it', () => {
    expect(
      stakeReturnsToCore(
        new URLSearchParams(stakeRequestSearch(10_000_000_000_000_000_000n))
      )
    ).toBe(true);
    expect(stakeReturnsToCore(new URLSearchParams('amount=10'))).toBe(false);
    expect(stakeReturnsToCore(new URLSearchParams())).toBe(false);
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
