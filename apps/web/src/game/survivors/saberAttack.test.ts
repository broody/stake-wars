import { describe, expect, it } from 'vitest';
import { applyOffer, createRun, tick, spawnEnemy, SIM_HZ } from './sim';
import { pointAt, vec3, chord, dot, cross, copy, normalize } from './sphere';
import { SABER, saberHits, saberReach } from './saberAttack';
const dt = 1 / SIM_HZ;
function drill() {
  const r = createRun(42, 5);
  r.spawnCredit = -1e6;
  r.eventIndex = 1000;
  r.player.invulnerable = 1e6;
  r.weapons[0].cooldown = 0;
  const e = spawnEnemy(
    r,
    'bulwark',
    pointAt(vec3(), r.player.n, r.right, 0.6 / 5)
  );
  e.speed = 0;
  e.cooldown = 1e6;
  e.hp = e.maxHp = 1000;
  return { r, e };
}
describe('single-saber combat', () => {
  it('winds up before damage and uses the same direction and footprint for the effect', () => {
    const { r, e } = drill();
    tick(r, dt, { x: 0, y: 0 });
    const attack = r.player.saberAttack!;
    expect(attack.side).toBe(1);
    expect(e.hp).toBe(1000);
    while (
      r.time + dt <
      attack.startedAt + attack.duration * (SABER.impact / SABER.duration)
    )
      tick(r, dt, { x: 0, y: 0 });
    expect(e.hp).toBe(1000);
    tick(r, dt, { x: 0, y: 0 });
    expect(e.hp).toBeLessThan(1000);
    const contact = r.texts.find((hit) => hit.bladeFrom);
    expect(contact?.bladeFrom).toEqual(r.player.n);
    expect(contact?.bladeFrom).not.toBe(r.player.n);
    const effect = r.effects.find((e) => e.kind === 'sweep');
    expect(effect).toMatchObject({
      kind: 'sweep',
      side: 1,
      ...saberReach(1, 1),
      n: r.player.n,
      dir: attack.forward,
    });
  });
  it('hits a pursuer behind while the player keeps retreating', () => {
    const { r, e } = drill();
    const behind = vec3(
      -r.player.heading.x,
      -r.player.heading.y,
      -r.player.heading.z
    );
    pointAt(e.n, r.player.n, behind, 0.2 / 5);
    copy(e.prev, e.n);
    tick(r, dt, { x: 0, y: 1 });
    const attack = r.player.saberAttack!;
    const origin = { ...r.player.n };
    while (
      r.time <
      attack.startedAt + attack.duration * (SABER.impact / SABER.duration)
    )
      tick(r, dt, { x: 0, y: 1 });
    expect(chord(origin, r.player.n)).toBeGreaterThan(0.05);
    expect(e.hp).toBeLessThan(1000);
    expect(dot(attack.forward, r.player.n)).toBeCloseTo(0, 10);
    const direction = cross(vec3(), attack.forward, r.player.n);
    expect(dot(direction, r.player.heading) * attack.side).toBeLessThan(-0.99);
  });
  it('commits at wind-up instead of tracking a target that moves across the player', () => {
    const { r, e } = drill();
    tick(r, dt, { x: 0, y: 0 });
    const attack = r.player.saberAttack!;
    const committed = { ...attack.forward };
    const opposite = vec3(-r.right.x, -r.right.y, -r.right.z);
    pointAt(e.n, r.player.n, opposite, 0.65 / 5);
    copy(e.prev, e.n);
    while (
      r.time <
      attack.startedAt + attack.duration * (SABER.impact / SABER.duration)
    )
      tick(r, dt, { x: 0, y: 0 });
    expect(attack.forward).toEqual(committed);
    expect(e.hp).toBe(1000);
  });
  it('catches enemies spread across the broader crescent', () => {
    const { r, e } = drill();
    const diagonal = vec3(
      r.right.x + r.player.heading.x,
      r.right.y + r.player.heading.y,
      r.right.z + r.player.heading.z
    );
    normalize(diagonal);
    const other = spawnEnemy(
      r,
      'bulwark',
      pointAt(vec3(), r.player.n, diagonal, 0.7 / 5)
    );
    other.hp = other.maxHp = 1000;
    other.speed = 0;
    other.cooldown = 1e6;
    tick(r, dt, { x: 0, y: 0 });
    const attack = r.player.saberAttack!;
    while (
      r.time <
      attack.startedAt + attack.duration * (SABER.impact / SABER.duration)
    )
      tick(r, dt, { x: 0, y: 0 });
    expect(e.hp).toBeLessThan(1000);
    expect(other.hp).toBeLessThan(1000);
  });
  it('freezes the windup on level-up and keeps moving when attacking', () => {
    const { r, e } = drill();
    tick(r, dt, { x: 0, y: 1 });
    const start = { ...r.player.n },
      time = r.time;
    r.status = 'choosing';
    for (let i = 0; i < 60; i++) tick(r, dt, { x: 0, y: 1 });
    expect(r.time).toBe(time);
    expect(e.hp).toBe(1000);
    r.status = 'playing';
    for (let i = 0; i < 9; i++) tick(r, dt, { x: 0, y: 1 });
    expect(chord(start, r.player.n) * 5).toBeCloseTo(0.3, 2);
    expect(r.player.saberAttack).toBeDefined();
  });
  it('earns small increases in damage and sweep with each blade upgrade', () => {
    for (const [level, damage, cooldown, reach] of [
      [1, 16, 1, 0.95],
      [2, 18, 1, 0.95],
      [3, 19, 0.97, 0.99],
      [4, 21, 0.94, 1.02],
      [5, 23, 0.91, 1.05],
    ]) {
      const { r, e } = drill();
      for (let rank = 1; rank < level; rank++)
        applyOffer(r, { kind: 'weapon', id: 'blade', isNew: false });
      tick(r, dt, { x: 0, y: 0 });
      expect(r.weapons[0].cooldown).toBeCloseTo(cooldown);
      const first = r.player.saberAttack!;
      expect(first.duration).toBeCloseTo(Math.min(SABER.duration, cooldown));
      // No follow-up cut: the next swing waits for the whole cooldown.
      while (r.time < first.startedAt + cooldown - dt)
        tick(r, dt, { x: 0, y: 0 });
      const hit = r.texts.find((entry) => entry.bladeFrom);
      expect(hit).toBeDefined();
      expect(e.maxHp - e.hp).toBe(damage * (hit!.crit ? 2 : 1));
      expect(saberReach(level, 1).reach).toBeCloseTo(reach);
      const current = r.player.saberAttack;
      expect(current === undefined || current.id === first.id).toBe(true);
    }
  });
  it('extends damage and the displayed envelope together with reach and area upgrades', () => {
    const base = saberReach(1, 1),
      large = saberReach(4, 1.5);
    expect(saberHits(1.4, 0, base.reach, base.width, base.arc)).toBe(false);
    expect(saberHits(1.4, 0, large.reach, large.width, large.arc)).toBe(true);
    expect(
      saberHits(base.reach + 0.01, 0, base.reach, base.width, base.arc)
    ).toBe(false);
    expect(saberHits(0.4, base.width, base.reach, base.width, base.arc)).toBe(
      false
    );
    expect(saberHits(-0.1, 0, large.reach, large.width, large.arc)).toBe(false);
  });
  it('widens by five degrees with every rank and keeps area bonuses independent of angle', () => {
    for (const [level, degrees] of [
      [1, 90],
      [2, 95],
      [3, 100],
      [4, 105],
      [5, 110],
    ]) {
      const shape = saberReach(level, 1);
      expect((shape.arc * 180) / Math.PI).toBeCloseTo(degrees);
      expect(saberReach(level, 1.5).arc).toBe(shape.arc);
      for (const side of [-1, 1]) {
        const inside = shape.arc / 2 - 0.01,
          outside = shape.arc / 2 + 0.01;
        expect(
          saberHits(
            0.4 * Math.cos(inside),
            side * 0.4 * Math.sin(inside),
            shape.reach,
            shape.width,
            shape.arc
          )
        ).toBe(true);
        expect(
          saberHits(
            0.4 * Math.cos(outside),
            side * 0.4 * Math.sin(outside),
            shape.reach,
            shape.width,
            shape.arc
          )
        ).toBe(false);
        expect(
          saberHits(
            0.4 * Math.cos(outside),
            side * 0.4 * Math.sin(outside),
            shape.reach,
            shape.width,
            shape.arc,
            0.02
          )
        ).toBe(true);
      }
    }
  });
  it('anchors the effect at impact while the player keeps moving', () => {
    const { r } = drill();
    tick(r, dt, { x: 0, y: 0 });
    while (!r.effects.some((e) => e.kind === 'sweep'))
      tick(r, dt, { x: 0, y: 0 });
    const effect = r.effects.find((e) => e.kind === 'sweep')!;
    if (effect.kind !== 'sweep') throw new Error('missing sweep');
    const origin = { ...effect.n };
    tick(r, dt, { x: 0, y: 1 });
    expect(effect.n).toEqual(origin);
    expect(effect.n).not.toEqual(r.player.n);
  });
});
