import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../survivors/content';
import { createRun, type Run } from '../survivors/sim';
import { CATEGORIES, ENTRIES, type Layer } from './entries';

/** What each layer draws from, so an entry can't list a layer it never feeds. */
const FEEDS: Record<Layer, (run: Run) => boolean> = {
  trooper: () => true,
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

  it('previews the Seeker at game scale through idle, windup, charge and recovery', () => {
    const entry = ENTRIES.find((e) => e.id === 'seeker')!;
    const run = createRun(7, 5.006);
    entry.setup(run);
    const unit = run.enemies[0];
    expect(unit.spec.scale).toBe(ENEMIES.seeker.scale);
    for (const [time, mode] of [
      [1, 'walk'],
      [2.4, 'aim'],
      [3.2, 'charge'],
      [4, 'recover'],
      [4.5, 'walk'],
    ] as const) {
      run.time = time;
      entry.animate!(run, 1 / 60);
      expect(unit.mode).toBe(mode);
      expect(unit.aim).toEqual(unit.heading);
    }
  });

  it('shows every kind of enemy in the game', () => {
    const shown = new Set(ENTRIES.map((e) => e.id));
    for (const kind of Object.keys(ENEMIES)) expect(shown).toContain(kind);
  });
});
