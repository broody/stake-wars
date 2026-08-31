import { describe, expect, it } from 'vitest';
import { formatStrkAmount } from './stats';

describe('landing stats formatting', () => {
  it('formats FRI as a compact STRK amount without losing integer precision', () => {
    expect(formatStrkAmount('32000000000000000000')).toBe('32');
    expect(formatStrkAmount('1234567890000000000000')).toBe('1,234.56');
  });
});
