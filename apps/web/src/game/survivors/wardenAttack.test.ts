import { describe, expect, it } from 'vitest';
import { createRun, spawnEnemy, tick, type Run } from './sim';
import { chord, copy, pointAt, vec3 } from './sphere';
import { WARDEN_GAIT } from './wardenAttack';
import { WARDEN_DEFEAT, enemyDefeatOpacity } from './enemyDefeat';
const RADIUS = 5.006,
  DT = 1 / 30,
  still = { x: 0, y: 0 };
function encounter(gap = 0.9) {
  const run = createRun(17, RADIUS);
  run.weapons = [];
  run.spawnCredit = -1e6;
  run.eventIndex = 1000;
  const enemy = spawnEnemy(
    run,
    'warden',
    pointAt(vec3(), run.player.n, run.player.forward, gap / RADIUS)
  );
  enemy.cooldown = 0;
  enemy.cooldown2 = enemy.cooldown3 = 1e9;
  tick(run, DT, still);
  return { run, enemy };
}
function advance(run: Run, seconds: number) {
  for (let i = 0; i < Math.round(seconds / DT); i++) tick(run, DT, still);
}
describe('Warden staff slam', () => {
  it('starts within range and damages once at the authored impact, then holds recovery', () => {
    const { run, enemy } = encounter();
    const origin = { ...enemy.n };
    expect(enemy.mode).toBe('slam');
    expect(run.effects.some((e) => e.kind === 'cone')).toBe(true);
    advance(run, 1.0666666667);
    expect(run.player.hp).toBe(100);
    expect(enemy.slam?.impacted).toBe(false);
    tick(run, DT, still);
    expect(run.player.hp).toBe(80);
    expect(enemy.slam?.impacted).toBe(true);
    expect(run.effects.some((e) => e.kind === 'cone')).toBe(false);
    const blast = run.effects.find((e) => e.kind === 'blast');
    expect(blast && 'n' in blast && blast.n).toEqual(enemy.slam?.origin);
    advance(run, 0.8);
    expect(run.player.hp).toBe(80);
    expect(enemy.n).toEqual(origin);
    expect(enemy.mode).toBe('slam');
    advance(run, 0.2);
    expect(enemy.slam).toBeUndefined();
    expect(enemy.mode).toBe('walk');
    expect(encounter(1.61).enemy.slam).toBeUndefined();
  });
  it('locks its facing and warning, allowing a dodge behind it', () => {
    const { run, enemy } = encounter();
    const aim = { ...enemy.heading },
      origin = { ...enemy.slam!.origin };
    copy(
      run.player.n,
      pointAt(vec3(), enemy.n, vec3(-aim.x, -aim.y, -aim.z), 0.9 / RADIUS)
    );
    enemy.knock = 3;
    copy(enemy.knockFrom, run.player.n);
    advance(run, 1.2);
    expect(enemy.heading).toEqual(aim);
    expect(enemy.slam?.origin).toEqual(origin);
    expect(run.player.hp).toBe(100);
  });
  it('continues dealing ordinary contact damage while bracing', () => {
    const { run } = encounter(0.1);
    expect(run.player.hp).toBe(86);
    advance(run, 0.7);
    expect(run.player.hp).toBe(72);
  });
  it('respects invulnerability and freezes attack time while paused for an upgrade', () => {
    const { run, enemy } = encounter();
    run.player.invulnerable = 3;
    advance(run, 1.2);
    expect(run.player.hp).toBe(100);
    const elapsed = enemy.slam!.elapsed;
    run.status = 'choosing';
    tick(run, 1, still);
    expect(enemy.slam!.elapsed).toBe(elapsed);
  });
  it.each([1 / 30, 1 / 60, 0.2])(
    'still triggers exactly one impact with timestep %s',
    (dt) => {
      const { run, enemy } = encounter();
      for (let t = 0; t < 1.8; t += dt) tick(run, dt, still);
      expect(run.player.hp).toBe(80);
      expect(enemy.slam?.impacted).toBe(true);
    }
  );
  it('walks nearby, runs farther away, and preserves ranged attacks and summons', () => {
    const { run, enemy } = encounter(2.2);
    enemy.cooldown = 1e9;
    const before = { ...enemy.n };
    tick(run, DT, still);
    expect((chord(before, enemy.n) * RADIUS) / DT).toBeCloseTo(enemy.speed, 4);
    copy(
      enemy.n,
      pointAt(vec3(), run.player.n, run.player.forward, 1 / RADIUS)
    );
    const near = { ...enemy.n };
    tick(run, DT, still);
    expect((chord(near, enemy.n) * RADIUS) / DT).toBeCloseTo(
      WARDEN_GAIT.walkSpeed * enemy.spec.scale,
      4
    );
    enemy.cooldown2 = enemy.cooldown3 = 0;
    tick(run, DT, still);
    expect(run.projectiles.filter((p) => p.from === 'warden')).toHaveLength(14);
    expect(run.enemies.filter((e) => e.kind === 'mite')).toHaveLength(6);
  });
  it('cancels an interrupted slam, drops rewards once, and keeps a harmless corpse through its longer animation', () => {
    const { run, enemy } = encounter(0.45);
    enemy.hp = 1;
    const fresh = createRun(17, RADIUS);
    run.weapons = fresh.weapons;
    run.weapons[0].cooldown = 0;
    tick(run, DT, still);
    advance(run, 0.5);
    expect(run.enemies).not.toContain(enemy);
    expect(run.bosses).not.toContain(enemy);
    expect(run.defeatedEnemies).toHaveLength(1);
    expect(run.kills).toBe(1);
    expect(enemy.slam).toBeUndefined();
    expect(run.effects.some((e) => e.kind === 'cone')).toBe(false);
    expect(run.items.filter((i) => i.kind === 'drop' && i.big)).toHaveLength(1);
    run.weapons = [];
    run.gems = [];
    run.items = [];
    run.status = 'playing';
    run.player.invulnerable = 0;
    const hp = run.player.hp;
    copy(run.player.n, enemy.n);
    advance(run, 1.85);
    expect(run.player.hp).toBe(hp);
    expect(run.defeatedEnemies).toHaveLength(1);
    expect(run.kills).toBe(1);
    expect(enemyDefeatOpacity(1.8, 'warden')).toBeGreaterThan(0);
    advance(run, 0.8);
    expect(run.defeatedEnemies).toHaveLength(0);
    expect(enemyDefeatOpacity(WARDEN_DEFEAT.lifetime, 'warden')).toBe(0);
  });
});
