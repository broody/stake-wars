import { describe, expect, it } from 'vitest';
import { voltWarningCount, VOLT_LEAP } from '../survivors/voltAttack';
import { SEEKER_GAIT } from '../survivors/seekerAttack';
import { ENEMIES } from '../survivors/content';
import { createRun, type Run } from '../survivors/sim';
import { CATEGORIES, ENTRIES, type Layer } from './entries';

/** What each layer draws from, so an entry can't list a layer it never feeds. */
const FEEDS: Record<Layer, (run: Run) => boolean> = {
  vanguard: () => true,
  mite: (run) => run.enemies.some((e) => e.spec.model === 'mite'),
  lancer: (run) => run.enemies.some((e) => e.spec.model === 'lancer'),
  bulwark: (run) => run.enemies.some((e) => e.spec.model === 'bulwark'),
  seeker: (run) => run.enemies.some((e) => e.spec.model === 'seeker'),
  warden: (run) => run.enemies.some((e) => e.spec.model === 'warden'),
  pickups: (run) => run.gems.length + run.items.length > 0,
  bolts: (run) => run.projectiles.length > 0,
  shards: (run) => run.weapons.some((w) => w.id === 'shards' && w.count > 0),
};

describe('object catalog', () => {
  it('gives every entry a unique id and every tab some entries', () => {
    expect(new Set(ENTRIES.map((e) => e.id)).size).toBe(ENTRIES.length);
    for (const { id } of CATEGORIES)
      expect(ENTRIES.some((e) => e.category === id)).toBe(true);
  });

  it.each(ENTRIES.map((e) => [e.id, e] as const))(
    '%s sets up what its layers draw, and keeps animating',
    (_, entry) => {
      const run = createRun(7, 5.006);
      entry.setup(run);
      for (const layer of entry.layers) expect(FEEDS[layer](run)).toBe(true);
      expect(() => entry.animate?.(run, 1 / 60)).not.toThrow();
    }
  );

  it('previews the grounded walk, chase, windup, charge and recovery at game scale', () => {
    const entry = ENTRIES.find((e) => e.id === 'seeker')!;
    const run = createRun(7, 5.006);
    entry.setup(run);
    const unit = run.enemies[0];
    expect(unit.spec.scale).toBe(ENEMIES.seeker.scale);
    for (const [time, mode, pace] of [
      [0.3, 'walk', 0],
      [1, 'walk', SEEKER_GAIT.walkSpeed * unit.spec.scale],
      [4.5, 'walk', unit.speed],
      [5.8, 'aim', 0],
      [6.6, 'charge', 0],
      [7.4, 'recover', 0],
      [8, 'walk', 0],
    ] as const) {
      run.time = time;
      entry.animate!(run, 1 / 60);
      expect(unit.mode).toBe(mode);
      expect(unit.seekerPace).toBeCloseTo(pace);
      expect(unit.aim).toEqual(unit.heading);
    }
  });

  it('previews the Volt Mite coil and jump using the game warning clock', () => {
    const entry = ENTRIES.find((e) => e.id === 'volt')!;
    const run = createRun(7, 5.006);
    entry.setup(run);
    run.time = 2.3;
    entry.animate!(run, 1 / 60);
    expect(voltWarningCount(run.enemies[0].leap!.elapsed)).toBe(3);
    expect(run.enemies[0].leap!.distance).toBe(VOLT_LEAP.maxDistance);
    run.time = 2 + VOLT_LEAP.windup + 0.1;
    entry.animate!(run, 1 / 60);
    expect(voltWarningCount(run.enemies[0].leap!.elapsed)).toBe(0);
  });

  it('shows every kind of enemy in the game', () => {
    const shown = new Set(ENTRIES.map((e) => e.id));
    for (const kind of Object.keys(ENEMIES)) expect(shown).toContain(kind);
  });
});
