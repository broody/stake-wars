import { describe, expect, it } from 'vitest';
import { ENEMIES } from './content';
import { decodeState, encodeState } from './snapshot';

const roundTrip = (value: unknown) =>
  decodeState(JSON.parse(JSON.stringify(encodeState(value))));

describe('run snapshots', () => {
  it('keeps shared objects shared, including through Sets, Maps and cycles', () => {
    const enemy: Record<string, unknown> = { id: 1, n: { x: 1, y: 2, z: 3 } };
    enemy.self = enemy;
    const state = {
      enemies: [enemy],
      bosses: [enemy],
      link: { b: enemy.n },
      chain: { targets: new Set([enemy]) },
      cells: new Map([[7, [enemy]]]),
    };
    const copy = roundTrip(state) as typeof state;
    const [restored] = copy.enemies;
    expect(copy.bosses[0]).toBe(restored);
    expect(restored.self).toBe(restored);
    expect(copy.link.b).toBe(restored.n);
    expect([...copy.chain.targets][0]).toBe(restored);
    expect(copy.cells.get(7)![0]).toBe(restored);
  });

  it('keeps every number exact, including the ones JSON loses', () => {
    const numbers = [0.1 + 0.2, -0, Infinity, -Infinity, NaN, 2 ** -1074];
    const copy = roundTrip({ numbers, missing: undefined }) as {
      numbers: number[];
      missing?: unknown;
    };
    copy.numbers.forEach((value, i) =>
      expect(Object.is(value, numbers[i])).toBe(true)
    );
    expect('missing' in copy).toBe(true);
  });

  it('points at the game’s constant tables instead of copying them', () => {
    const copy = roundTrip({ spec: ENEMIES.mite }) as { spec: unknown };
    expect(copy.spec).toBe(ENEMIES.mite);
  });

  it('refuses state it cannot restore', () => {
    expect(() => encodeState({ timers: [{ run: () => {} }] })).toThrow(
      /timers\[0\]\.run/
    );
    expect(() => encodeState({ at: new Date() })).toThrow(/state\.at/);
  });
});
