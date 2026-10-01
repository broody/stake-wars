import { describe, expect, it } from 'vitest';
import {
  applyOffer,
  chooseOffer,
  closeSupply,
  createRun,
  makeOffers,
  playerRight,
  runEvent,
  SIM_HZ,
  spawnEnemy,
  tick,
  type MoveInput,
  type Run,
} from './sim';
import { chord, dot, pointAt, vec3 } from './sphere';

const DT = 1 / SIM_HZ;
const RADIUS = 5.006;
const still: MoveInput = { x: 0, y: 0 };

/** Kite: drift, pick up nearby gems, and push away from anything close. */
function kite(run: Run): MoveInput {
  const player = run.player;
  const right = playerRight(vec3(), player);
  const toLocal = (n: { x: number; y: number; z: number }) => {
    const d = vec3(n.x - player.n.x, n.y - player.n.y, n.z - player.n.z);
    return [dot(d, right) * RADIUS, dot(d, player.forward) * RADIUS];
  };
  let x = Math.cos(run.time * 0.35) * 0.35;
  let y = Math.sin(run.time * 0.5) * 0.35;
  let best: number[] | null = null;
  let bestDistance = 2.4;
  for (const gem of run.gems) {
    const [gx, gy] = toLocal(gem.n);
    const distance = Math.hypot(gx, gy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = [gx, gy];
    }
  }
  if (best) {
    x += (best[0] / bestDistance) * 0.9;
    y += (best[1] / bestDistance) * 0.9;
  }
  for (const enemy of run.enemies) {
    const [ex, ey] = toLocal(enemy.n);
    const distance = Math.hypot(ex, ey);
    const reach = 0.55 + enemy.spec.radius;
    if (distance < reach && distance > 0.001) {
      const weight = ((reach - distance) / reach) * 3;
      x -= (ex / distance) * weight;
      y -= (ey / distance) * weight;
    }
  }
  return { x, y };
}

/** Play, taking the first offer at every level-up and closing Supply Drops. */
function play(run: Run, seconds: number, pilot: (run: Run) => MoveInput) {
  const end = run.time + seconds;
  let guard = 0;
  while (
    run.time < end &&
    run.status !== 'fallen' &&
    guard++ < seconds * SIM_HZ * 4
  ) {
    if (run.status === 'choosing') chooseOffer(run, 0);
    else if (run.status === 'supply') closeSupply(run);
    else tick(run, DT, pilot(run));
  }
  return run;
}

describe('Core Survivors simulation', () => {
  it('replays identically from a seed and inputs', () => {
    const a = play(createRun(42, RADIUS), 90, kite);
    const b = play(createRun(42, RADIUS), 90, kite);
    expect(a.kills).toBe(b.kills);
    expect(a.player.hp).toBe(b.player.hp);
    expect(a.player.n).toEqual(b.player.n);
    expect(a.enemies.map((e) => e.n)).toEqual(b.enemies.map((e) => e.n));
  });

  it('keeps the player on the surface with a tangent screen frame', () => {
    const run = createRun(7, RADIUS);
    for (let i = 0; i < 40 * SIM_HZ; i++) {
      run.status = 'playing';
      run.player.invulnerable = 1;
      tick(run, DT, { x: Math.sin(i / 50), y: 1 });
    }
    const { n, forward } = run.player;
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 9);
    expect(Math.hypot(forward.x, forward.y, forward.z)).toBeCloseTo(1, 9);
    expect(dot(n, forward)).toBeCloseTo(0, 9);
  });

  it('walks at its speed and carries screen-up along a great circle', () => {
    const run = createRun(3, RADIUS);
    const start = { ...run.player.n };
    const startForward = { ...run.player.forward };
    // A quarter of the way around, straight up the screen.
    const seconds = (Math.PI / 2) * RADIUS;
    for (let i = 0; i < Math.round(seconds * SIM_HZ); i++) {
      run.enemies.length = 0;
      run.status = 'playing';
      tick(run, DT, { x: 0, y: 1 });
    }
    expect(dot(run.player.n, start)).toBeCloseTo(0, 2);
    expect(dot(run.player.n, startForward)).toBeCloseTo(1, 2);
  });

  it('cuts down Mites with the Arc Blade and levels up from their gems', () => {
    const run = createRun(11, RADIUS);
    const right = playerRight(vec3(), run.player);
    for (let i = 0; i < 8; i++)
      spawnEnemy(
        run,
        'mite',
        pointAt(vec3(), run.player.n, right, (0.45 + i * 0.02) / RADIUS)
      );
    play(run, 6, () => still);
    expect(run.kills).toBeGreaterThanOrEqual(6);
    expect(run.damageBy.blade).toBeGreaterThan(0);
    // Knockback leaves some gems outside pickup range; go and collect them.
    play(run, 6, kite);
    expect(run.player.level).toBeGreaterThan(1);
  });

  it('pauses for a level-up and applies the chosen offer', () => {
    const run = createRun(13, RADIUS);
    run.player.xp = run.player.xpNext;
    tick(run, DT, still);
    expect(run.status).toBe('choosing');
    expect(run.offers).toHaveLength(3);
    const offer = run.offers[0];
    chooseOffer(run, 0);
    expect(run.status).toBe('playing');
    if (offer.kind === 'weapon')
      expect(run.weapons.find((w) => w.id === offer.id)).toBeDefined();
    if (offer.kind === 'system') expect(run.systems[offer.id]).toBe(1);
  });

  it('offers an evolution for a maxed weapon with its paired system, and Supply Drops grant it', () => {
    const run = createRun(17, RADIUS);
    run.weapons[0].level = 5;
    applyOffer(run, { kind: 'system', id: 'force', isNew: true });
    expect(makeOffers(run, 3).some((o) => o.kind === 'evolution')).toBe(true);
    run.pendingDrops.push(1);
    tick(run, DT, still);
    expect(run.status).toBe('supply');
    expect(run.supply[0]).toEqual({ kind: 'evolution', id: 'blade' });
    expect(run.weapons[0].evolved).toBe(true);
    closeSupply(run);
    expect(run.status).toBe('playing');
  });

  it('fires every weapon', () => {
    const run = createRun(19, RADIUS);
    for (const id of ['bolts', 'shards', 'strike', 'charge', 'pulse'] as const)
      applyOffer(run, { kind: 'weapon', id, isNew: true });
    run.player.invulnerable = 1e9;
    play(run, 45, kite);
    for (const id of [
      'blade',
      'bolts',
      'shards',
      'strike',
      'charge',
      'pulse',
    ] as const)
      expect(run.damageBy[id] ?? 0).toBeGreaterThan(0);
  });

  it('marches a Bulwark line across and clears it once it has passed', () => {
    const run = createRun(23, RADIUS);
    runEvent(run, 'line');
    const line = run.enemies.filter((e) => e.kind === 'bulwark' && e.straight);
    expect(line.length).toBeGreaterThanOrEqual(30);
    // Adjacent columns leave space for the new shield-bearing model.
    const row = line.slice(0, line.length / 3);
    for (let i = 1; i < row.length; i++)
      expect(chord(row[i - 1].n, row[i].n) * RADIUS).toBeGreaterThan(
        row[i].spec.radius * 2
      );
    run.player.invulnerable = 1e9;
    for (let i = 0; i < 40 * SIM_HZ; i++) {
      run.status = 'playing';
      tick(run, DT, still);
    }
    expect(run.enemies.filter((e) => e.straight)).toHaveLength(0);
  });

  it('brings the Warden at three and a half minutes and keeps enemies near the player', () => {
    const run = createRun(29, RADIUS);
    run.player.invulnerable = 1e9;
    play(run, 215, kite);
    expect(run.wardens).toBe(1);
    for (const enemy of run.enemies)
      if (!enemy.straight)
        expect(chord(enemy.n, run.player.n) * RADIUS).toBeLessThan(7.7);
  });

  it('eventually overwhelms a player who stands still', () => {
    const run = play(createRun(5, RADIUS), 600, () => still);
    expect(run.status).toBe('fallen');
    expect(run.lastHitBy).not.toBeNull();
    expect(run.time).toBeGreaterThan(30);
  });
});

it('fires Lancer bolts without a warning while preserving Captain volley warnings', () => {
  for (const kind of ['lancer', 'captain'] as const) {
    const run = createRun(17, RADIUS);
    run.weapons = [];
    run.spawnCredit = -1e6;
    const enemy = spawnEnemy(
      run,
      kind,
      pointAt(vec3(), run.player.n, run.player.forward, 1.8 / RADIUS)
    );
    enemy.cooldown = 0;
    tick(run, DT, still);
    if (kind === 'lancer') {
      expect(enemy.mode).toBe('walk');
      expect(run.effects.some((effect) => effect.kind === 'aim')).toBe(false);
      expect(run.projectiles).toHaveLength(1);
      expect(run.projectiles[0].speed).toBe(1.36);
      expect(enemy.cooldown).toBeGreaterThanOrEqual(3.2);
    } else {
      expect(enemy.mode).toBe('aim');
      expect(run.effects.some((effect) => effect.kind === 'aim')).toBe(true);
      expect(run.projectiles).toHaveLength(0);
    }
  }
});

it('adds common charging Bulwarks to the spawn pool at 2:30', () => {
  for (const time of [149, 150]) {
    const run = createRun(17, RADIUS);
    run.weapons = [];
    run.time = time;
    run.eventIndex = 1000;
    run.spawnCredit = 100;
    tick(run, DT, still);
    const bulwarks = run.enemies.filter((enemy) => enemy.kind === 'bulwark');
    if (time < 150) expect(bulwarks).toHaveLength(0);
    else {
      expect(bulwarks.length).toBeGreaterThan(0);
      expect(bulwarks.every((enemy) => !enemy.straight)).toBe(true);
    }
  }
});
