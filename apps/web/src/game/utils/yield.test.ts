import { describe, expect, it } from 'vitest';
import { calculateYieldMetrics } from './yield';

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
