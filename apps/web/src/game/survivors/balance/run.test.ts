import { describe, expect, it } from 'vitest';
import { runSurvivor } from './run';

describe('balance runs', () => {
  it('replays a seed exactly and records every minute', () => {
    const options = {
      seed: 4,
      policy: 'greedy',
      build: 'natural',
      cap: 120,
    } as const;
    const a = runSurvivor(options);
    const b = runSurvivor(options);
    expect(a.minutes).toHaveLength(2);
    expect({ ...a, ms: 0 }).toEqual({ ...b, ms: 0 });
    expect(a.kills).toBeGreaterThan(0);
  });

  it('keeps playing past a virtual fall and names what caused it', () => {
    const run = runSurvivor({
      seed: 1,
      policy: 'greedy',
      build: 'natural',
      cap: 420,
    });
    expect(run.minutes).toHaveLength(7);
    if (run.fellAt !== null) {
      expect(run.fellAt).toBeLessThanOrEqual(420);
      expect(run.killedBy).not.toBeNull();
    }
  });

  it('hands a maxed build every weapon evolved', () => {
    const run = runSurvivor({
      seed: 2,
      policy: 'first',
      build: 'max',
      cap: 30,
    });
    expect(run.weapons).toHaveLength(6);
    expect(run.weapons.every((w) => w.level === 5 && w.evolved)).toBe(true);
    expect(run.firstEvolution).toBe(0);
  });
});
