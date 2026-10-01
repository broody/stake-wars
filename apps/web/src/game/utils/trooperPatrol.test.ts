import { describe, expect, it } from 'vitest';
import { TROOPER_PATROL_COUNT, TrooperPatrol } from './trooperPatrol';

describe('autonomous trooper patrols', () => {
  it('spawns 100 separated actors with varied initial behavior and animation phases', () => {
    const actors = Array.from(
      { length: TROOPER_PATROL_COUNT },
      (_, i) => new TrooperPatrol(i)
    );
    expect(actors).toHaveLength(100);
    expect(new Set(actors.map((a) => a.behavior.name)).size).toBe(10);
    expect(new Set(actors.map((a) => a.controller.cycles)).size).toBe(100);
    expect(actors.filter((a) => a.controller.normal.z > 0)).toHaveLength(50);
    for (let i = 0; i < actors.length; i++)
      for (let j = i + 1; j < actors.length; j++) {
        expect(
          actors[i].controller.normal.angleTo(actors[j].controller.normal)
        ).toBeGreaterThan(0.2);
      }
  });

  it('cycles through running, firing and every movement direction while staying tangent to the Core', () => {
    const actors = Array.from(
      { length: TROOPER_PATROL_COUNT },
      (_, i) => new TrooperPatrol(i)
    );
    const modes = new Set<string>();
    for (let frame = 0; frame < 7200; frame++)
      for (const actor of actors) {
        actor.update(1 / 60, 5.006);
        modes.add(actor.behavior.name);
        if (frame % 120 === 0) {
          expect(actor.controller.normal.length()).toBeCloseTo(1, 9);
          expect(
            actor.controller.forward.dot(actor.controller.normal)
          ).toBeCloseTo(0, 9);
          expect(
            Object.values(actor.controller.weights).reduce((a, b) => a + b, 0)
          ).toBeCloseTo(1, 9);
        }
      }
    expect(modes.size).toBe(10);
  });

  it('keeps actors independent and caps large frame gaps', () => {
    const first = new TrooperPatrol(0),
      untouched = new TrooperPatrol(1);
    const before = untouched.controller.normal.clone();
    first.update(1 / 60, 5.006);
    expect(untouched.controller.normal.equals(before)).toBe(true);
    const a = new TrooperPatrol(2),
      b = new TrooperPatrol(2);
    a.update(100, 5.006);
    b.update(0.05, 5.006);
    expect(a.controller.normal.distanceTo(b.controller.normal)).toBeLessThan(
      1e-10
    );
    expect(a.controller.cycles).toBe(b.controller.cycles);
  });
});
