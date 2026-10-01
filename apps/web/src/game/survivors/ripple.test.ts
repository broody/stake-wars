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

  it('lifts only the struck Sector and the ring around it at level one', () => {
    for (let age = 0; age < rippleLife(1); age += 0.02)
      expect(rippleHeight(RIPPLE.reach + 0.01, age, 1)).toBe(0);
    expect(RIPPLE.reach).toBeLessThan(0.6);
  });

  it('adds a ring for level 4 and evolved strikes, but not for chain hits', () => {
    const level4 = 0.32 / RIPPLE.baseRadius,
      evolved = 0.35 / RIPPLE.baseRadius,
      chain = (0.35 * 0.8) / RIPPLE.baseRadius;
    expect(rippleRings(1)).toBe(1);
    expect(rippleRings(chain)).toBe(1);
    expect(rippleRings(level4)).toBe(2);
    expect(rippleRings(evolved)).toBe(2);
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

  it('fades out by its reach and lifetime, and grows with the blast', () => {
    expect(rippleHeight(RIPPLE.reach + 0.01, 1, 1)).toBe(0);
    expect(rippleHeight(0.2, rippleLife(1), 1)).toBe(0);
    // Within one ring count, a bigger blast lifts proportionally higher.
    expect(rippleHeight(0.2, 0.25, 1.2)).toBeCloseTo(
      rippleHeight(0.2, 0.25, 1) * 1.2,
      12
    );
  });

  it('starts a ripple at every strike and clears it after its life', () => {
    const run = createRun(3, 5.006);
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
    for (let t = 0; t <= rippleLife(first.strength) + DT; t += DT)
      tick(run, DT, still);
    expect(run.ripples).not.toContain(first);
  });
});
