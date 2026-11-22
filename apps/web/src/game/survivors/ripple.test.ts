import { describe, expect, it } from 'vitest';
import {
  RIPPLE,
  rippleHeight,
  rippleLife,
  rippleReach,
  rippleRings,
} from './ripple';
import { applyOffer, createRun, SIM_HZ, spawnEnemy, tick } from './sim';
import { pointAt, vec3 } from './sphere';

const DT = 1 / SIM_HZ;
const still = { x: 0, y: 0 };

describe('Orbital Strike ripples', () => {
  it.each([
    [1, false, 0.5],
    [2, false, 0.6],
    [3, false, 0.72],
    [4, false, 0.85],
    [5, false, 0.9],
    [5, true, 1.1],
  ] as const)(
    'uses the enlarged splash radius for rank %i, evolved %s',
    (level, evolved, radius) => {
      const run = createRun(4, 5);
      run.weapons = [];
      applyOffer(run, { kind: 'weapon', id: 'strike', isNew: true });
      Object.assign(run.weapons[0], { level, evolved, cooldown: 0 });
      run.random = () => 0.1;
      run.spawnCredit = -1e6;
      const targets = [0, radius + 0.09, radius + 0.17].map((d) => {
        const enemy = spawnEnemy(
          run,
          'mite',
          pointAt(vec3(), run.player.n, run.player.forward, (0.85 + d) / 5)
        );
        enemy.hp = enemy.maxHp = 1000;
        return enemy;
      });
      if (evolved) {
        const neighbor = spawnEnemy(
          run,
          'mite',
          pointAt(vec3(), targets[0].n, run.right, 0.4 / 5)
        );
        neighbor.hp = neighbor.maxHp = 1000;
      }
      tick(run, DT, still);
      const strikes = run.effects.filter((e) => e.kind === 'strike');
      expect(strikes.length).toBeGreaterThan(0);
      expect(
        strikes.every((e) => e.kind === 'strike' && e.radius === radius)
      ).toBe(true);
      if (!evolved) {
        expect(targets[1].hp).toBeLessThan(1000);
        expect(targets[2].hp).toBe(1000);
      } else {
        for (let i = 0; i < 4; i++) tick(run, DT, still);
        expect(
          run.effects.some(
            (e) => e.kind === 'strike' && e.linked && e.radius === radius * 0.8
          )
        ).toBe(true);
      }
    }
  );

  it('halves repeat splash hits per orbital, including when two chains overlap', () => {
    const run = createRun(7, 5);
    run.weapons = [];
    run.spawnCredit = -1e6;
    applyOffer(run, { kind: 'weapon', id: 'strike', isNew: true });
    applyOffer(run, { kind: 'system', id: 'amplifier', isNew: true });
    for (let i = 0; i < 5; i++)
      applyOffer(run, { kind: 'system', id: 'overclock', isNew: i === 0 });
    Object.assign(run.weapons[0], { level: 5, evolved: true, cooldown: DT });
    const targets = [0.9, 1.55, 2.35, 3.1, 3.85, 4.28].map((distance) => {
      const n = pointAt(
        vec3(),
        run.player.n,
        run.player.forward,
        distance / run.groundRadius
      );
      const enemy = spawnEnemy(run, 'mite', n);
      enemy.speed = 0;
      enemy.hp = enemy.maxHp = 1000;
      return enemy;
    });
    // Aim the first orbital at the near end of the line, then the next at the farthest visible Mite.
    run.random = () => 0.1;
    const hits = [];
    for (let step = 0; step < 13; step++) {
      const hp = targets.map((enemy) => enemy.hp);
      run.cues.length = 0;
      tick(run, DT, still);
      const impact = run.cues.find(
        (cue) => cue.id === 'strike' || cue.id === 'chain'
      );
      if (impact)
        hits.push([impact.id, targets.map((enemy, i) => hp[i] - enemy.hp)]);
      run.random = () => 0.99;
    }
    expect(hits).toEqual([
      ['strike', [15, 15, 0, 0, 0, 0]],
      ['chain', [4, 4, 8, 0, 0, 0]],
      ['chain', [0, 4, 4, 8, 0, 0]],
      ['chain', [0, 0, 4, 4, 8, 0]],
      ['strike', [0, 0, 15, 15, 15, 15]],
      // The far Mite took the new primary. Its first splash from the older chain still hits in full.
      ['chain', [0, 0, 0, 4, 4, 8]],
    ]);
  });

  it('fires single strikes on tempo through a crowd with Overclock', () => {
    const run = createRun(7, 5);
    run.weapons = [];
    applyOffer(run, { kind: 'weapon', id: 'strike', isNew: true });
    applyOffer(run, { kind: 'system', id: 'overclock', isNew: true });
    Object.assign(run.weapons[0], { level: 5, cooldown: DT });
    run.spawnCredit = -1e6;
    for (const distance of [0.8, 1.3, 1.8]) {
      const target = spawnEnemy(
        run,
        'mite',
        pointAt(vec3(), run.player.n, run.player.forward, distance / 5)
      );
      target.hp = target.maxHp = 1e6;
      target.speed = 0;
    }
    const times: number[] = [];
    for (let i = 0; i < SIM_HZ * 7; i++) {
      run.cues.length = 0;
      tick(run, DT, still);
      const shots = run.cues.filter((cue) => cue.id === 'strike');
      expect(shots.length).toBeLessThanOrEqual(1);
      if (shots.length) times.push(run.time);
    }
    expect(times).toHaveLength(9);
    times.forEach((time, i) => {
      expect(Math.abs(time - times[0] - i * 0.88 * 0.92)).toBeLessThan(DT);
    });
  });

  it('raises a single band no wider than one Sector', () => {
    expect(rippleHeight(0.5, 0.1, 1)).toBe(0);
    for (let age = 0; age < rippleLife(1); age += 0.02) {
      let first = Infinity,
        last = -Infinity;
      for (let d = 0; d <= RIPPLE.reach; d += 0.005) {
        const lift = rippleHeight(d, age, 1);
        expect(lift).toBeGreaterThanOrEqual(0);
        expect(lift).toBeLessThanOrEqual(RIPPLE.height);
        if (lift > 0) {
          first = Math.min(first, d);
          last = Math.max(last, d);
        }
      }
      if (last >= first)
        expect(last - first).toBeLessThanOrEqual(RIPPLE.width + 0.01);
    }
  });

  it('lifts the struck Sector and two surrounding rings at level one', () => {
    for (let age = 0; age < rippleLife(1); age += 0.02)
      expect(rippleHeight(RIPPLE.reach + 0.01, age, 1)).toBe(0);
    expect(rippleRings(1)).toBe(2);
  });

  it('raises an extra ring of Sectors at level three and caps the terrain ripple', () => {
    const evolved = 1.1 / RIPPLE.baseRadius;
    expect(rippleRings(0.6 / RIPPLE.baseRadius)).toBe(2);
    expect(rippleRings(0.72 / RIPPLE.baseRadius)).toBe(3);
    expect(rippleRings(evolved)).toBe(3);
    expect(rippleRings(10)).toBe(RIPPLE.maxRings);
    expect(rippleReach(evolved)).toBeCloseTo(RIPPLE.reach + RIPPLE.ringStep, 9);
    // The band reaches the extra ring and lifts it before the ripple ends.
    const outer = RIPPLE.reach + RIPPLE.ringStep * 0.8;
    let lifted = 0;
    for (let age = 0; age < rippleLife(evolved); age += 0.01)
      lifted = Math.max(lifted, rippleHeight(outer, age, evolved));
    expect(lifted).toBeGreaterThan(0);
    expect(rippleHeight(outer, 0.4, 1)).toBe(0);
  });

  it.each([1, 2, 3.3])(
    'peaks first at the impact and decays to rest at the edge for strength %s',
    (strength) => {
      const reach = rippleReach(strength);
      const peak = (distance: number) =>
        rippleHeight(
          distance,
          (distance + RIPPLE.width / 2) / RIPPLE.speed,
          strength
        );
      const center = peak(0);
      expect(center).toBeCloseTo(RIPPLE.height * Math.sqrt(strength));
      expect(peak(reach * 0.5)).toBeCloseTo(center / 4);
      expect(peak(reach * 0.75)).toBeCloseTo(center / 16);
      expect(peak(reach)).toBe(0);
      expect(
        rippleHeight(reach / 2, RIPPLE.width / (2 * RIPPLE.speed), strength)
      ).toBe(0);
      expect(rippleHeight(0, rippleLife(strength), strength)).toBe(0);
    }
  );

  it('clears the impact once the tiles settle and deals damage only once', () => {
    const run = createRun(3, 5.006);
    run.weapons = [];
    applyOffer(run, { kind: 'weapon', id: 'strike', isNew: true });
    const target = spawnEnemy(
      run,
      'mite',
      pointAt(vec3(), run.player.n, run.player.forward, 1.2 / run.groundRadius)
    );
    target.hp = target.maxHp = 1e6;
    for (let i = 0; i < SIM_HZ * 2 && !run.ripples.length; i++)
      tick(run, DT, still);
    expect(run.ripples.length).toBeGreaterThan(0);
    const first = run.ripples[0];
    expect(first.strength).toBeCloseTo(1, 6);
    run.weapons[0].cooldown = 10;
    const damage = run.damageBy.strike;
    for (let t = 0; t <= rippleLife(first.strength) + DT; t += DT)
      tick(run, DT, still);
    expect(run.effects.some((effect) => effect.kind === 'strike')).toBe(false);
    expect(run.ripples).not.toContain(first);
    expect(run.damageBy.strike).toBe(damage);
  });
});
