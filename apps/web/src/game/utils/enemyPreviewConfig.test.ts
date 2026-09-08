import { describe, expect, it } from 'vitest';
import {
  MAX_ENEMIES_PER_TYPE,
  parseEnemySwarmCounts,
} from './enemyPreviewConfig';

describe('enemy preview URL counts', () => {
  it.each([
    ['', { mites: 0, lancers: 0 }],
    ['mites=200', { mites: 200, lancers: 0 }],
    ['mites=37', { mites: 37, lancers: 0 }],
    ['lancers=50', { mites: 0, lancers: 50 }],
    ['mites=23&lancers=7&projection=1', { mites: 23, lancers: 7 }],
    ['mites=0&lancers=1', { mites: 0, lancers: 1 }],
  ])('reads independent quantities from %s', (query, expected) => {
    expect(parseEnemySwarmCounts(new URLSearchParams(query))).toEqual(expected);
  });

  it.each(['', '-1', '1.5', 'NaN', 'Infinity', '5oops', '2e2'])(
    'ignores an invalid count %s',
    (value) => {
      const params = new URLSearchParams({ mites: value, lancers: '12' });
      expect(parseEnemySwarmCounts(params)).toEqual({ mites: 0, lancers: 12 });
    }
  );

  it('caps excessive counts before allocating the populations', () => {
    expect(
      parseEnemySwarmCounts(
        new URLSearchParams({ mites: '1001', lancers: '9'.repeat(400) })
      )
    ).toEqual({ mites: MAX_ENEMIES_PER_TYPE, lancers: MAX_ENEMIES_PER_TYPE });
  });
});
