import { describe, expect, it } from 'vitest';
import {
  accruedAtAnnualRate,
  annualRateFractionDigits,
  calculateYieldMetrics,
  calculateYieldPercent,
  rebaseAnimatedAnnualYield,
} from './yield';

const STRK = 10n ** 18n;
const NOW = Date.parse('2026-08-12T00:00:00Z');

describe('calculateYieldMetrics', () => {
  it('calculates effective yield and annualizes the observed reward pace', () => {
    const metrics = calculateYieldMetrics(
      1_000n * STRK,
      10n * STRK,
      10n * STRK,
      '2026-05-12T00:00:00Z',
      NOW
    );

    expect(metrics.effectivePercent).toBe(1);
    expect(metrics.observationDays).toBe(92);
    expect(metrics.projectedAnnualRewards).toBe(39_701_086_956_521_739_130n);
    expect(metrics.projectedAnnualPercent).toBe(3.9701);
  });

  it('keeps effective yield available when the entry date is unavailable', () => {
    expect(calculateYieldMetrics(500n, 25n, 5n, null, NOW)).toEqual({
      effectivePercent: 5,
      projectedAnnualRewards: null,
      projectedAnnualPercent: null,
      observationDays: null,
    });
  });

  it('withholds percentages when there is no active stake', () => {
    expect(
      calculateYieldMetrics(0n, 25n, 5n, '2026-01-01T00:00:00Z', NOW)
    ).toEqual({
      effectivePercent: null,
      projectedAnnualRewards: null,
      projectedAnnualPercent: null,
      observationDays: null,
    });
  });
});

describe('accruedAtAnnualRate', () => {
  it('converts an annual reward projection into elapsed live rewards', () => {
    const annualRewards = 100n * STRK;

    expect(
      accruedAtAnnualRate(annualRewards, 365.25 * 24 * 60 * 60 * 1000)
    ).toBe(annualRewards);
    expect(accruedAtAnnualRate(annualRewards, 1_000)).toBe(3_168_808_781_402n);
  });

  it('does not accrue for invalid or non-positive durations', () => {
    expect(accruedAtAnnualRate(100n, 0)).toBe(0n);
    expect(accruedAtAnnualRate(100n, Number.NaN)).toBe(0n);
  });
});

describe('annualRateFractionDigits', () => {
  it('shows the first fractional place that visibly advances', () => {
    expect(annualRateFractionDigits(100n * STRK)).toBe(7);
    expect(annualRateFractionDigits(1n * STRK)).toBe(9);
  });

  it('keeps the precision within readable bounds', () => {
    expect(annualRateFractionDigits(0n)).toBe(4);
    expect(annualRateFractionDigits(100n * STRK, 4, 6)).toBe(6);
  });
});

describe('rebaseAnimatedAnnualYield', () => {
  it('keeps the live value from moving backward after a refresh', () => {
    expect(rebaseAnimatedAnnualYield(101n, 100n, false)).toBe(101n);
    expect(rebaseAnimatedAnnualYield(100n, 102n, false)).toBe(102n);
  });

  it('accepts a lower value when the reward period resets', () => {
    expect(rebaseAnimatedAnnualYield(101n, 0n, true)).toBe(0n);
    expect(rebaseAnimatedAnnualYield(101n, null, true)).toBeNull();
  });
});

describe('calculateYieldPercent', () => {
  it('keeps a stabilized annual display consistent with current stake', () => {
    expect(calculateYieldPercent(40n * STRK, 1_000n * STRK)).toBe(4);
    expect(calculateYieldPercent(40n * STRK, 0n)).toBeNull();
  });
});
