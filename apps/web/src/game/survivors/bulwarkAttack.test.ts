import { describe, expect, it } from 'vitest';
import {
  BULWARK_ATTACK,
  bulwarkWarningBounds,
  sampleBulwarkAttack,
  sweptShieldHit,
} from './bulwarkAttack';
import { createRun, spawnEnemy, tick, runEvent, type Run } from './sim';
import {
  angleBetween,
  chord,
  copy,
  cross,
  dot,
  pointAt,
  stepAlong,
  vec3,
} from './sphere';
const RADIUS = 5.006,
  DT = 1 / 30,
  still = { x: 0, y: 0 };
function encounter(distance = 0.55) {
  const run = createRun(17, RADIUS);
  run.weapons = [];
  run.spawnCredit = -1e6;
  const enemy = spawnEnemy(
    run,
    'bulwark',
    pointAt(vec3(), run.player.n, run.player.forward, distance / RADIUS)
  );
  enemy.cooldown = 0;
  tick(run, DT, still);
  return { run, enemy };
}
function advance(run: Run, seconds: number) {
  for (let i = 0; i < Math.round(seconds / DT); i++) tick(run, DT, still);
}

describe('Bulwark shield thrust', () => {
  it('starts winding up within the doubled trigger range', () => {
    expect(encounter(1.29).enemy.mode).toBe('thrust');
    expect(encounter(1.31).enemy.thrust).toBeUndefined();
  });

  it('locks its aim, holds through windup, hits once, and retains landing through recovery', () => {
    const { run, enemy } = encounter();
    expect(enemy.mode).toBe('thrust');
    const origin = { ...enemy.n },
      aim = { ...enemy.thrust!.direction };
    advance(run, 0.5);
    expect(run.player.hp).toBe(100);
    expect(chord(enemy.n, origin)).toBeLessThan(1e-12);
    expect(enemy.thrust!.direction).toEqual(aim);
    advance(run, 0.5);
    expect(run.player.hp).toBe(90);
    expect(enemy.thrust!.hit).toBe(true);
    expect(angleBetween(origin, enemy.n) * RADIUS).toBeCloseTo(0.6, 6);
    const landed = { ...enemy.n };
    advance(run, 0.7);
    expect(enemy.n).toEqual(landed);
    // The longer lunge lands in contact range, causing the normal repeat touch hit.
    expect(run.player.hp).toBe(80);
    advance(run, 0.1);
    expect(enemy.mode).toBe('walk');
    expect(enemy.cooldown).toBeGreaterThan(2.9);
    expect(enemy.thrust).toBeUndefined();
    expect(
      Math.hypot(run.player.n.x, run.player.n.y, run.player.n.z)
    ).toBeCloseTo(1, 8);
    expect(dot(run.player.n, run.player.forward)).toBeCloseTo(0, 8);
  });

  it('lets the player sidestep the locked warning but still hurts on contact during recovery', () => {
    const { run, enemy } = encounter();
    const direction = { ...enemy.thrust!.direction };
    for (let i = 0; i < 12; i++) tick(run, DT, { x: 1, y: 0 });
    expect(enemy.thrust!.direction).toEqual(direction);
    advance(run, 0.7);
    expect(run.player.hp).toBe(100);
    copy(run.player.n, enemy.n);
    advance(run, 0.5);
    expect(run.player.hp).toBe(90);
  });

  it('deals repeated contact damage during windup and cooldown with normal invulnerability', () => {
    const { run, enemy } = encounter(0.1);
    expect(run.player.hp).toBe(90);
    advance(run, 0.3);
    expect(run.player.hp).toBe(90);
    enemy.thrust = undefined;
    enemy.mode = 'walk';
    enemy.cooldown = 2;
    copy(run.player.n, enemy.n);
    advance(run, 0.4);
    expect(run.player.hp).toBe(80);
    advance(run, 0.7);
    expect(run.player.hp).toBe(70);
    copy(run.player.n, pointAt(vec3(), enemy.n, enemy.heading, 1 / RADIUS));
    advance(run, 0.7);
    expect(run.player.hp).toBe(70);
  });

  it('keeps approaching during cooldown until contact hurts the player', () => {
    const { run, enemy } = encounter();
    enemy.thrust = undefined;
    enemy.mode = 'walk';
    enemy.cooldown = 10;
    const initialGap = angleBetween(enemy.n, run.player.n) * RADIUS;
    advance(run, 1);
    expect(angleBetween(enemy.n, run.player.n) * RADIUS).toBeLessThan(
      initialGap
    );
    expect(enemy.mode).toBe('walk');
    advance(run, 2);
    expect(run.player.hp).toBeLessThan(100);
    expect(enemy.thrust).toBeUndefined();
  });

  it('cancels a dead attacker and its warning before damage', () => {
    const { run, enemy } = encounter();
    enemy.dead = true;
    advance(run, 1);
    expect(run.enemies).not.toContain(enemy);
    expect(run.player.hp).toBe(100);
  });

  it('does not charge through an invulnerable player or knock them back', () => {
    const { run } = encounter();
    run.player.invulnerable = 5;
    const start = { ...run.player.n };
    advance(run, 1);
    expect(run.player.hp).toBe(100);
    expect(run.player.n).toEqual(start);
  });

  it('resists separation and hit knockback while its warning is committed', () => {
    const { run, enemy } = encounter();
    enemy.knock = 4;
    copy(enemy.knockFrom, run.player.n);
    spawnEnemy(run, 'mite', enemy.n);
    const origin = { ...enemy.n };
    advance(run, 0.4);
    expect(chord(enemy.n, origin)).toBeLessThan(1e-12);
  });

  it('shoves units sideways only during the lunge, without damaging them', () => {
    for (const dt of [1 / 60, 1 / 30, 0.2]) {
      const { run, enemy } = encounter(1.2);
      run.player.invulnerable = 10;
      const attack = enemy.thrust!;
      const right = cross(vec3(), attack.origin, attack.direction);
      const n = pointAt(vec3(), attack.origin, attack.direction, 0.65 / RADIUS);
      const victim = spawnEnemy(run, 'mite', n);
      victim.speed = 0;
      const hp = victim.hp;
      const outside = pointAt(
        vec3(),
        attack.origin,
        attack.direction,
        0.65 / RADIUS
      );
      stepAlong(outside, { ...right }, 0.9 / RADIUS);
      const bystander = spawnEnemy(run, 'mite', outside);
      bystander.speed = 0;
      advance(run, 0.5);
      expect(chord(victim.n, n)).toBeLessThan(1e-10);
      while (enemy.thrust!.elapsed < 1.05) tick(run, dt, still);
      expect(
        Math.abs(
          Math.atan2(dot(victim.n, right), dot(victim.n, attack.origin))
        ) * RADIUS
      ).toBeGreaterThan(0.2);
      expect(victim.hp).toBe(hp);
      expect(chord(bystander.n, outside)).toBeLessThan(1e-10);
      expect(Math.hypot(victim.n.x, victim.n.y, victim.n.z)).toBeCloseTo(1, 8);
      expect(dot(victim.n, victim.heading)).toBeCloseTo(0, 8);
      expect(angleBetween(attack.origin, enemy.n) * RADIUS).toBeCloseTo(0.6, 6);
    }
  });

  it('does not displace a Warden in the charge path', () => {
    const { run, enemy } = encounter(1.2);
    run.player.invulnerable = 10;
    const attack = enemy.thrust!;
    const n = pointAt(vec3(), attack.origin, attack.direction, 0.65 / RADIUS);
    const boss = spawnEnemy(run, 'warden', n);
    boss.speed = 0;
    boss.cooldown = boss.cooldown2 = boss.cooldown3 = 100;
    advance(run, 1.1);
    expect(chord(boss.n, n)).toBeLessThan(1e-10);
  });

  it('keeps line formations marching and dealing contact damage', () => {
    const run = createRun(23, RADIUS);
    run.weapons = [];
    run.spawnCredit = -1e6;
    runEvent(run, 'line');
    const enemy = run.enemies[0];
    enemy.cooldown = 0;
    copy(run.player.n, enemy.n);
    tick(run, DT, still);
    expect(enemy.thrust).toBeUndefined();
    expect(enemy.straight).toBe(true);
    expect(enemy.travel).toBeGreaterThan(0);
    expect(run.player.hp).toBe(90);
  });

  it('preserves the exact curve distance at different simulation step sizes', () => {
    for (const dt of [1 / 60, 1 / 30, 1 / 15, 0.2]) {
      const { run, enemy } = encounter();
      run.player.invulnerable = 5;
      const start = { ...enemy.n };
      while (enemy.thrust && enemy.thrust.elapsed < 1.1) tick(run, dt, still);
      expect(angleBetween(start, enemy.n) * RADIUS).toBeCloseTo(0.6, 6);
    }
  });

  it('sweeps a thin moving shield rather than checking only its final position', () => {
    expect(
      sweptShieldHit(
        [0, -0.1, 0.1, 0, 0.05],
        [0, -0.1, 0.1, 1, 1.05],
        [0, 0.5],
        [0, 0.5],
        1,
        0.01
      )
    ).toBe(true);
    expect(
      sweptShieldHit(
        [0, -0.1, 0.1, 0, 0.05],
        [0, -0.1, 0.1, 1, 1.05],
        [0.3, 0.5],
        [0.3, 0.5],
        1,
        0.01
      )
    ).toBe(false);
    // Player crosses the lane entirely within a tick.
    expect(
      sweptShieldHit(
        [0, -0.1, 0.1, 0.4, 0.6],
        [0, -0.1, 0.1, 0.4, 0.6],
        [-0.4, 0.5],
        [0.4, 0.5],
        1,
        0.01
      )
    ).toBe(true);
  });

  it('covers every active shield sample with the warning footprint', () => {
    const bounds = bulwarkWarningBounds(0.25);
    for (
      let t = BULWARK_ATTACK.activeStart;
      t <= BULWARK_ATTACK.activeEnd;
      t += 0.001
    ) {
      const s = sampleBulwarkAttack(t);
      expect(s[1] * 0.25).toBeGreaterThanOrEqual(bounds.left - 1e-7);
      expect(s[2] * 0.25).toBeLessThanOrEqual(bounds.right + 1e-7);
      expect(s[3] * 0.25).toBeGreaterThanOrEqual(bounds.near - 1e-7);
      expect(s[4] * 0.25).toBeLessThanOrEqual(bounds.far + 1e-7);
    }
    expect(sampleBulwarkAttack(99)[0] * 0.25).toBeCloseTo(0.6, 6);
  });
});
