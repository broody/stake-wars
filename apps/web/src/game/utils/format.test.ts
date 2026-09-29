import { describe, expect, it } from 'vitest';
import {
  addressesMatch,
  formatCountdown,
  formatStrk,
  formatStrkFixed,
  isZeroAddress,
  parseStrk,
  shortAddress,
} from './format';

describe('Sector formatting', () => {
  it('formats STRK values without floating-point precision loss', () => {
    expect(formatStrk(10_000_000_000_000_000n)).toBe('0.01');
    expect(formatStrk(11_000_000_000_000_000n)).toBe('0.011');
    expect(formatStrk(1_234_567_890_000_000_000_000n)).toBe('1,234.5678');
  });

  it('keeps a fixed fractional width for live STRK values', () => {
    expect(formatStrkFixed(1_230_000_000_000_000_000n, 6)).toBe('1.230000');
    expect(formatStrkFixed(0n, 4)).toBe('0.0000');
  });

  it('recognizes neutral controller addresses', () => {
    expect(isZeroAddress('0x0')).toBe(true);
    expect(isZeroAddress('0x000000')).toBe(true);
    expect(isZeroAddress('0x123')).toBe(false);
  });

  it('shortens long controller addresses', () => {
    expect(shortAddress('0x0123456789abcdef')).toBe('0x012345…abcdef');
    expect(shortAddress('0x123')).toBe('0x123');
  });

  it('compares normalized Starknet addresses', () => {
    expect(addressesMatch('0x01', '0x1')).toBe(true);
    expect(addressesMatch('0x01', '0x2')).toBe(false);
    expect(addressesMatch('invalid', '0x1')).toBe(false);
  });

  it('parses whole and fractional STRK amounts into base units', () => {
    expect(parseStrk('1')).toBe(1_000_000_000_000_000_000n);
    expect(parseStrk('0.011')).toBe(11_000_000_000_000_000n);
    expect(parseStrk(' 0.01 ')).toBe(10_000_000_000_000_000n);
    expect(parseStrk('2,802.216121829412931569')).toBe(
      2_802_216_121_829_412_931_569n
    );
  });

  it('preserves all 18 supported decimals', () => {
    expect(parseStrk('0.000000000000000001')).toBe(1n);
  });

  it('formats countdowns and clamps expired durations to zero', () => {
    expect(formatCountdown(10_800)).toBe('03:00:00');
    expect(formatCountdown(3_661)).toBe('01:01:01');
    expect(formatCountdown(-1)).toBe('00:00:00');
  });

  it('rejects malformed or over-precise values', () => {
    expect(() => parseStrk('')).toThrow('valid STRK amount');
    expect(() => parseStrk('', 'FORCE')).toThrow('valid FORCE amount');
    expect(() => parseStrk('-1')).toThrow('valid STRK amount');
    expect(() => parseStrk('2,80.1')).toThrow('valid STRK amount');
    expect(() => parseStrk('2,,802.1')).toThrow('valid STRK amount');
    expect(() => parseStrk('1.0000000000000000001')).toThrow(
      'valid STRK amount'
    );
  });
});
