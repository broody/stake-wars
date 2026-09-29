import { describe, expect, it } from 'vitest';
import {
  amountToNumber,
  formatAmount,
  formatCommission,
  formatDay,
  formatDuration,
  formatPercent,
  formatQuantity,
  formatUsd,
  normalizeTokenAmount,
  parseAmount,
} from './stakingFormat';

describe('staking formatting', () => {
  it('parses base-unit strings and rejects malformed values', () => {
    expect(parseAmount('1000')).toBe(1000n);
    expect(parseAmount('')).toBe(0n);
    expect(parseAmount('-4')).toBe(0n);
    expect(parseAmount(null)).toBe(0n);
  });

  it('converts 18-decimal amounts beyond the safe integer range', () => {
    const staked = 1_609_031_485_365_011_700_000_000_000n;
    expect(amountToNumber(staked)).toBeCloseTo(1_609_031_485.365, 2);
    expect(formatAmount(staked)).toBe('1.61B');
  });

  it('normalizes 8-decimal BTC wrappers to 18 decimals', () => {
    expect(normalizeTokenAmount(2_891_634n, 8)).toBe(28_916_340_000_000_000n);
    expect(normalizeTokenAmount(5n, 18)).toBe(5n);
  });

  it('keeps small quantities readable', () => {
    expect(formatQuantity(590.666)).toBe('590.67');
    expect(formatQuantity(0.028916)).toBe('0.0289');
    expect(formatQuantity(74_141_386.8)).toBe('74.14M');
    expect(formatQuantity(0)).toBe('0');
    expect(formatQuantity(1e-18)).toBe('<0.0001');
  });

  it('formats prices, rates, and commissions', () => {
    expect(formatUsd(67_670_000)).toBe('$67.67M');
    expect(formatUsd(0.0421)).toBe('$0.04');
    expect(formatPercent(7.4842)).toBe('7.48%');
    expect(formatPercent(null)).toBe('—');
    expect(formatCommission(1000)).toBe('10%');
    expect(formatCommission(750)).toBe('7.50%');
    expect(formatCommission(null)).toBe('—');
  });

  it('formats durations and UTC days', () => {
    expect(formatDuration(3 * 86_400 + 4 * 3_600 + 5)).toBe('3D 4H');
    expect(formatDuration(3_000)).toBe('50M 0S');
    expect(formatDuration(31)).toBe('31S');
    expect(formatDay(1_790_640_000)).toBe('SEP 29');
  });
});
