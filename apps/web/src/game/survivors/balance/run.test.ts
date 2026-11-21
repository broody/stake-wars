import { describe, expect, it } from 'vitest';
import { ENEMY_GROUND_RADIUS } from '../../utils/enemySwarm';
import { createRun, SIM_HZ, tick } from '../sim';
import { decide, pilot } from './bot';
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

  it('matches actual HP, damage, and progression through the fatal tick', () => {
    const options = {
      seed: 4,
      policy: 'first',
      build: 'natural',
      pace: 3,
      cap: 420,
    } as const;
    const live = createRun(options.seed, ENEMY_GROUND_RADIUS, 'vanguard', {
      pace: options.pace,
    });
    while (live.status !== 'fallen' && live.time < options.cap) {
      if (live.status === 'playing') {
        tick(live, 1 / SIM_HZ, pilot(live, undefined, 'engage'));
      } else {
        decide(live, 'first', () => 0);
      }
    }
    expect(live.status).toBe('fallen');
    const result = runSurvivor(options);
    expect(result.hero).toBe(live.hero);
    expect(result.fellAt).toBeCloseTo(live.time, 6);
    expect(result.minutes.length).toBe(Math.floor(live.time / 60));
    expect(result.killedBy).toBe(live.lastHitBy);
    expect(result.healedBy).toEqual(live.healedBy);
    expect(result.hurtBy).toEqual(live.hurtBy);
    expect(result.damageBy).toEqual(live.damageBy);
    expect(result.kills).toBe(live.kills);
    expect(result.level).toBe(live.player.level);
  });

  it('keeps measuring pressure beyond the first virtual fall', () => {
    const result = runSurvivor({
      seed: 4,
      policy: 'greedy',
      build: 'natural',
      mode: 'pressure',
      // Accelerate the waves so this tests post-defeat recording across balance changes.
      pace: 5,
      cap: 120,
    });
    expect(result.fellAt).not.toBeNull();
    expect(result.fellAt).toBeLessThan(120);
    expect(result.killedBy).not.toBeNull();
    expect(result.minutes).toHaveLength(2);
  });

  it('pursues a focused weapon through actual choices and its evolution partner', () => {
    const run = createRun(2, ENEMY_GROUND_RADIUS, 'vanguard');
    run.status = 'choosing';
    run.offers = [
      { kind: 'weapon', id: 'blade', isNew: false },
      { kind: 'weapon', id: 'bolts', isNew: true },
    ];
    decide(run, 'greedy', () => 0, 0, 'bolts');
    expect(run.weapons.map((w) => w.id)).toEqual(['blade', 'bolts']);
    run.status = 'choosing';
    run.offers = [
      { kind: 'weapon', id: 'blade', isNew: false },
      { kind: 'system', id: 'overclock', isNew: true },
    ];
    decide(run, 'greedy', () => 0, 0, 'bolts');
    expect(run.systems.overclock).toBe(1);
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
