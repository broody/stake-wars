import { describe, expect, it } from 'vitest';
import { arcCount, arcGlow, DEATH_ARCS, traceArc } from './deathArcs';
import { createRun, spawnEnemy, type DefeatedEnemy } from './sim';
import type { EnemyKind } from './content';
import { copy, vec3 } from './sphere';

const points = () => Array.from({ length: DEATH_ARCS.steps + 1 }, () => vec3());

function defeated(kind: EnemyKind, id = 7): DefeatedEnemy {
  const run = createRun(3, 5.006);
  const enemy = spawnEnemy(run, kind);
  return {
    id,
    kind: enemy.kind,
    spec: enemy.spec,
    n: copy(vec3(), enemy.n),
    heading: copy(vec3(), enemy.heading),
    speed: enemy.speed,
    diedAt: 0,
    age: 0,
    previousAge: 0,
  };
}

describe('death arcs', () => {
  it('replays the same arcs for the same enemy and varies them by slot', () => {
    const body = defeated('mite');
    const a = points();
    const b = points();
    const other = points();
    expect(traceArc(a, body, 1, 0.2)).toBe(traceArc(b, body, 1, 0.2));
    expect(a).toEqual(b);
    traceArc(other, body, 2, 0.2);
    expect(other[0]).not.toEqual(a[0]);
  });

  it('grows each arc step by step, then jumps it elsewhere', () => {
    const body = defeated('lancer');
    const out = points();
    const lit = new Set<number>();
    const starts = new Set<string>();
    for (let age = 0; age < DEATH_ARCS.life; age += 1 / 120) {
      const count = traceArc(out, body, 0, age);
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(DEATH_ARCS.steps + 1);
      lit.add(count);
      starts.add(`${out[0].x},${out[0].y},${out[0].z}`);
    }
    expect(lit.size).toBe(DEATH_ARCS.steps);
    expect(starts.size).toBeGreaterThan(3);
  });

  it('keeps every point on the body, above its soles', () => {
    for (const kind of [
      'mite',
      'lancer',
      'bulwark',
      'seeker',
      'warden',
    ] as const) {
      const body = defeated(kind);
      const out = points();
      for (let slot = 0; slot < arcCount(body); slot++)
        for (let age = 0; age < DEATH_ARCS.life; age += 0.01) {
          const count = traceArc(out, body, slot, age);
          for (let i = 0; i < count; i++) {
            expect(Number.isFinite(out[i].x + out[i].y + out[i].z)).toBe(true);
            expect(out[i].y).toBeGreaterThan(0);
            // The tallest authored model stands 3.6 model units.
            expect(Math.hypot(out[i].x, out[i].z)).toBeLessThan(2.5);
            expect(out[i].y).toBeLessThan(4.4);
          }
        }
    }
  });

  it('crackles at Mite scale on big bodies instead of growing with them', () => {
    // Mean world length of one step across many deaths.
    const meanStep = (kind: EnemyKind) => {
      const out = points();
      let total = 0;
      let steps = 0;
      for (let id = 1; id < 30; id++) {
        const body = defeated(kind, id);
        for (let slot = 0; slot < arcCount(body); slot++)
          for (let age = 0; age < DEATH_ARCS.life; age += 0.02) {
            const count = traceArc(out, body, slot, age);
            for (let i = 1; i < count; i++, steps++)
              total +=
                Math.hypot(
                  out[i].x - out[i - 1].x,
                  out[i].y - out[i - 1].y,
                  out[i].z - out[i - 1].z
                ) * body.spec.scale;
          }
      }
      return total / steps;
    };
    const mite = meanStep('mite');
    for (const kind of ['captain', 'bulwark', 'warden'] as const)
      expect(meanStep(kind)).toBeLessThan(mite * 1.35);
  });

  it('flashes at death, dies out, and crackles more on heavy enemies', () => {
    const mite = defeated('mite');
    expect(arcGlow(mite, 0, 0)).toBeGreaterThan(0.5);
    expect(arcGlow(mite, 0, DEATH_ARCS.life)).toBe(0);
    expect(traceArc(points(), mite, 0, DEATH_ARCS.life)).toBe(0);
    expect(arcCount(mite)).toBe(DEATH_ARCS.arcs);
    expect(arcCount(defeated('bulwark'))).toBe(DEATH_ARCS.heavyArcs);
  });
});
