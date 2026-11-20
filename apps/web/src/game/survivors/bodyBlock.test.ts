import { describe, expect, it } from 'vitest';
import {
  createRun,
  playerRight,
  SIM_HZ,
  spawnEnemy,
  tick,
  type Enemy,
  type Run,
} from './sim';
import { VOLT_IMPACT_TIME } from './voltAttack';
import { chord, copy, dot, pointAt, vec3 } from './sphere';

const RADIUS = 5.006;
const dt = 1 / SIM_HZ;
const still = { x: 0, y: 0 };
const PLAYER_RADIUS = 0.1;

/** A run with no weapons, spawns or events, so only the enemies placed here act. */
function quiet() {
  const run = createRun(19, RADIUS);
  run.spawnCredit = -1e6;
  run.eventIndex = 1000;
  run.weapons = [];
  return run;
}

/** Space between the two bodies; negative while they overlap. */
const gap = (run: Run, enemy: Enemy) =>
  chord(enemy.n, run.player.n) * RADIUS - enemy.spec.radius - PLAYER_RADIUS;

/** Mites standing shoulder to shoulder across the path, `ahead` world units on. */
function wall(run: Run, ahead: number) {
  const across = playerRight(vec3(), run.player);
  const middle = pointAt(
    vec3(),
    run.player.n,
    run.player.forward,
    ahead / RADIUS
  );
  return Array.from({ length: 9 }, (_, i) => {
    const enemy = spawnEnemy(
      run,
      'mite',
      pointAt(vec3(), middle, across, ((i - 4) * 0.26) / RADIUS)
    );
    enemy.hp = enemy.maxHp = 1e6;
    enemy.speed = 0;
    return enemy;
  });
}

describe('living enemies body-block', () => {
  it('stops the player at a wall of Mites, and touching it still hurts', () => {
    const run = quiet();
    const forward = copy(vec3(), run.player.forward);
    const mites = wall(run, 0.6);
    let nearest = Infinity;
    for (let i = 0; i < 2 * SIM_HZ; i++) {
      tick(run, dt, { x: 0, y: 1 });
      for (const mite of mites) nearest = Math.min(nearest, gap(run, mite));
    }
    expect(nearest).toBeGreaterThan(-1e-3);
    // It walked up to the wall and stopped there, not through it.
    const travelled = dot(run.player.n, forward) * RADIUS;
    expect(travelled).toBeGreaterThan(0.3);
    expect(travelled).toBeLessThan(0.45);
    expect(run.player.hp).toBeLessThan(100);
  });

  it('is pushed back by a Mite walking into them, not walked through', () => {
    const run = quiet();
    run.player.invulnerable = 1e6;
    const start = copy(vec3(), run.player.n);
    const forward = copy(vec3(), run.player.forward);
    const mite = spawnEnemy(
      run,
      'mite',
      pointAt(vec3(), start, forward, 0.5 / RADIUS)
    );
    let nearest = Infinity;
    for (let i = 0; i < 3 * SIM_HZ; i++) {
      tick(run, dt, still);
      nearest = Math.min(nearest, gap(run, mite));
    }
    expect(nearest).toBeGreaterThan(-1e-6);
    // Still in front, and the player has given ground away from it.
    expect(dot(mite.n, forward)).toBeGreaterThan(dot(run.player.n, forward));
    expect(dot(run.player.n, forward) * RADIUS).toBeLessThan(-0.3);
  });

  it('lets the player walk through an enemy still breaching', () => {
    const run = quiet();
    const control = quiet();
    const mite = spawnEnemy(
      run,
      'mite',
      pointAt(vec3(), run.player.n, run.player.forward, 0.3 / RADIUS)
    );
    mite.emerge = 10;
    for (let i = 0; i < SIM_HZ; i++) {
      tick(run, dt, { x: 0, y: 1 });
      tick(control, dt, { x: 0, y: 1 });
    }
    expect(run.player.n).toEqual(control.player.n);
  });

  it('lets the player stand under a Volt Mite in the air', () => {
    const run = quiet();
    const volt = spawnEnemy(
      run,
      'volt',
      pointAt(vec3(), run.player.n, run.right, 0.8 / RADIUS)
    );
    tick(run, dt, still);
    expect(volt.leap).toBeDefined();
    while (volt.leap!.elapsed + dt < VOLT_IMPACT_TIME) {
      const placed = { ...volt.n };
      run.player.n = { ...placed };
      tick(run, dt, still);
      expect(run.player.n).toEqual(placed);
    }
  });
});
