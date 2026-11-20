import { describe, expect, it } from 'vitest';
import {
  createRun,
  playerRight,
  runEvent,
  SIM_HZ,
  spawnEnemy,
  tick,
  type Enemy,
  type Run,
} from './sim';
import {
  SEEKER_ATTACK,
  SEEKER_LANES,
  SEEKER_PACK,
  seekerLanes,
  seekerPacksFor,
} from './seekerAttack';
import { telegraphed } from './renderFrame';
import {
  chord,
  copy,
  cross,
  dot,
  normalize,
  pointAt,
  vec3,
  type Vec3,
} from './sphere';

const RADIUS = 5.006;
const dt = 1 / SIM_HZ;
/** Seeker and player radius together: how close a pack Seeker lets you get. */
const REACH = 0.15 + 0.1;

describe('Seeker pack waves', () => {
  it('adds a lane each wave, up to the cap', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9].map(seekerPacksFor)).toEqual([
      3, 4, 5, 6, 7, 8, 8, 8,
    ]);
  });

  it('runs four lanes side by side and crosses the rest at right angles', () => {
    for (let packs = 1; packs <= SEEKER_LANES.max; packs++) {
      const lanes = seekerLanes(packs);
      expect(lanes).toHaveLength(packs);
      for (const axis of [0, 1] as const) {
        const group = lanes.filter((lane) => lane.axis === axis);
        expect(group).toHaveLength(
          axis === 0
            ? Math.min(packs, SEEKER_LANES.perAxis)
            : Math.max(0, packs - SEEKER_LANES.perAxis)
        );
        // Neighbours sit one spacing apart, centred on the axis, and
        // alternate the way they charge.
        if (group.length > 1)
          group.forEach((lane, i) => {
            expect(lane.across).toBeCloseTo(
              (i - (group.length - 1) / 2) * SEEKER_LANES.spacing
            );
            expect(lane.reverse).toBe(i % 2 === 1);
          });
      }
    }
    expect(seekerLanes(1)[0].across).toBeNull();
  });

  it('spawns a pack and an aim line per lane, growing with each wave', () => {
    const run = createRun(31, RADIUS);
    for (const lanes of [3, 4, 5, 6, 7, 8, 8]) {
      run.enemies = [];
      run.effects = [];
      runEvent(run, 'seekerPacks');
      const lines = run.effects.filter(
        (e) => e.kind === 'aim' && e.from === 'seeker'
      );
      expect(lines).toHaveLength(lanes);
      expect(run.enemies.filter((e) => e.kind === 'seeker')).toHaveLength(
        lanes * SEEKER_PACK.size
      );
    }
  });

  it('keeps the opening single pack at one lane and out of the count', () => {
    const run = createRun(31, RADIUS);
    runEvent(run, 'seekers');
    runEvent(run, 'seekers');
    expect(run.enemies.filter((e) => e.kind === 'seeker')).toHaveLength(
      2 * SEEKER_PACK.size
    );
    expect(run.seekerWaves).toBe(0);
  });

  it('records where each Seeker sits beside its lane, for body-blocking', () => {
    const run = createRun(31, RADIUS);
    runEvent(run, 'seekers');
    const pack = run.enemies.filter((e) => e.kind === 'seeker');
    expect(new Set(pack.map((e) => e.stagger)).size).toBe(2);
    // Each one sits to the side of the one ahead that their staggers say.
    for (let i = 1; i < pack.length; i++) {
      const ahead = pack[i - 1];
      const right = cross(vec3(), ahead.aim, ahead.n);
      const offset = dot(pack[i].n, right) * RADIUS;
      expect(Math.sign(offset)).toBe(
        Math.sign(pack[i].stagger - ahead.stagger)
      );
      expect(Math.abs(offset)).toBeGreaterThan(0.05);
    }
  });

  it('shows Seeker aim lines even with the other ground warnings off', () => {
    expect(telegraphed('seeker')).toBe(true);
  });
});

/** A quiet run with no weapons, so nothing kills the Seekers or the player. */
function quiet() {
  const run = createRun(7, RADIUS);
  run.spawnCredit = -1e6;
  run.eventIndex = 1000;
  run.weapons = [];
  run.player.invulnerable = 1e6;
  return run;
}

/**
 * A pack column, as `seekerPack` lays one out, `back` world units behind
 * `origin` along the lane `dir`.
 */
function column(run: Run, origin: Vec3, dir: Vec3, back: number) {
  const across = normalize(cross(vec3(), dir, origin));
  return Array.from({ length: SEEKER_PACK.size }, (_, i) => {
    const behind = pointAt(
      vec3(),
      origin,
      dir,
      -(back + i * SEEKER_PACK.spacing) / RADIUS
    );
    const side = i % 2 ? SEEKER_PACK.stagger : -SEEKER_PACK.stagger;
    const enemy = spawnEnemy(
      run,
      'seeker',
      pointAt(vec3(), behind, across, side / RADIUS)
    );
    enemy.hp = enemy.maxHp = 1e6;
    copy(enemy.aim, dir);
    enemy.straight = true;
    enemy.maxTravel = 11;
    enemy.stagger = side;
    return enemy;
  });
}

const closest = (run: Run, seekers: Enemy[]) =>
  Math.min(...seekers.map((e) => chord(e.n, run.player.n) * RADIUS));

describe('Seeker packs body-block', () => {
  it('holds the player outside a waiting column', () => {
    const run = quiet();
    const start = copy(vec3(), run.player.n);
    const forward = copy(vec3(), run.player.forward);
    // A column lying across the player's path, 0.6 ahead.
    const across = playerRight(vec3(), run.player);
    const ahead = pointAt(vec3(), start, forward, 0.6 / RADIUS);
    const seekers = column(run, ahead, across, -1.1);
    for (const enemy of seekers) {
      enemy.mode = 'aim';
      enemy.modeTime = 1e6;
    }
    let nearest = Infinity;
    for (let i = 0; i < 2 * SIM_HZ; i++) {
      tick(run, dt, { x: 0, y: 1 });
      nearest = Math.min(nearest, closest(run, seekers));
    }
    expect(nearest).toBeGreaterThan(REACH - 1e-3);
    // It walked up to the column and stopped there.
    const travelled = dot(run.player.n, forward) * RADIUS;
    expect(travelled).toBeGreaterThan(0.2);
    expect(travelled).toBeLessThan(0.6);
  });

  it('shoulders a player in the lane aside instead of passing through or carrying them', () => {
    const run = quiet();
    const start = copy(vec3(), run.player.n);
    const lane = playerRight(vec3(), run.player);
    const seekers = column(run, start, lane, 1.5);
    for (const enemy of seekers) {
      enemy.mode = 'charge';
      enemy.modeTime = SEEKER_ATTACK.packDrive;
    }
    let nearest = Infinity;
    for (let i = 0; i < 2 * SIM_HZ; i++) {
      tick(run, dt, { x: 0, y: 0 });
      nearest = Math.min(nearest, closest(run, seekers));
    }
    // The whole column has gone by.
    for (const enemy of seekers)
      expect(dot(enemy.n, lane) * RADIUS).toBeGreaterThan(0.5);
    expect(nearest).toBeGreaterThan(REACH - 1e-3);
    const along = dot(run.player.n, lane) * RADIUS;
    const aside = chord(run.player.n, start) * RADIUS;
    expect(Math.abs(along)).toBeLessThan(0.05);
    expect(aside).toBeGreaterThan(REACH - SEEKER_PACK.stagger);
  });
});
