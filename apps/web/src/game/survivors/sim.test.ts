import { describe, expect, it } from 'vitest';
import {
  applyOffer,
  chooseOffer,
  closeSupply,
  createRun,
  makeOffers,
  PACE,
  playerRight,
  runEvent,
  shardDirection,
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

  it('adds occasional second charges as the player earns ranks', () => {
    const run = createRun(7, RADIUS);
    run.weapons = [];
    run.spawnCredit = -1e6;
    run.eventIndex = 1000;
    for (const [rank, radius, cooldown, period] of [
      [1, 0.3, 2.2, 0],
      [2, 0.32, 2.1, 0],
      [3, 0.32, 2.1, 5],
      [4, 0.33, 2.1, 4],
      [5, 0.34, 2, 3],
    ]) {
      applyOffer(run, { kind: 'weapon', id: 'charge', isNew: rank === 1 });
      const charge = run.weapons[0];
      for (let volley = 1; volley <= (period || 5); volley++) {
        charge.cooldown = 0;
        run.lobs.length = 0;
        tick(run, DT, still);
        expect(run.lobs).toHaveLength(volley === period ? 2 : 1);
        expect(run.lobs[0].radius).toBeCloseTo(radius);
        expect(charge.cooldown).toBeCloseTo(cooldown);
      }
    }
  });

  it.each([
    [1, false, 0.96],
    [2, false, 0.98],
    [3, false, 1],
    [4, false, 1.06],
    [5, false, 1.08],
    [5, true, 1.3],
  ] as const)(
    'applies the field up to its visible edge at rank %i (evolved %s)',
    (level, evolved, baseRadius) => {
      const run = createRun(7, RADIUS);
      run.weapons = [];
      run.spawnCredit = -1e6;
      run.eventIndex = 1000;
      applyOffer(run, { kind: 'weapon', id: 'pulse', isNew: true });
      applyOffer(run, { kind: 'system', id: 'amplifier', isNew: true });
      const weapon = run.weapons[0];
      Object.assign(weapon, { level, evolved, cooldown: 0 });
      const expected = baseRadius * 1.1;
      const place = (sign: number) => {
        const target = spawnEnemy(run, 'mite', { ...run.player.n });
        const contact = expected + target.spec.radius + sign * 0.01;
        const angle = sign * 2 * Math.asin(contact / (2 * RADIUS));
        pointAt(target.n, run.player.n, run.right, angle);
        target.hp = target.maxHp = 200;
        target.speed = 0;
        return target;
      };
      const inside = place(-1),
        outside = place(1);
      tick(run, DT, still);
      expect(weapon.radius).toBeCloseTo(expected, 9);
      expect(inside.hp).toBeLessThan(200);
      expect(inside.slowTime).toBeGreaterThan(0);
      expect(outside.hp).toBe(200);
      expect(outside.slowTime).toBe(0);
    }
  );

  it.each([
    [1, false, 0, 1.1],
    [2, false, 0, 1.1],
    [3, false, 0, 1.16],
    [4, false, 0, 1.16],
    [5, false, 0, 1.16],
    [5, true, Math.PI / 2 / 2.2, 2],
    [5, true, (1.5 * Math.PI) / 2.2, 0.96],
  ] as const)(
    'hits on the visible shard orbit at rank %i (evolved %s, time %f)',
    (level, evolved, time, reach) => {
      const run = createRun(7, RADIUS);
      run.weapons = [];
      run.eventIndex = 1000;
      run.spawnCredit = -1e6;
      applyOffer(run, { kind: 'weapon', id: 'shards', isNew: true });
      applyOffer(run, { kind: 'system', id: 'amplifier', isNew: true });
      const weapon = run.weapons[0];
      Object.assign(weapon, { level, evolved });
      run.time = Math.max(DT, time) - DT;
      const spin = evolved ? 4.2 : level === 5 ? 3.8 : level >= 3 ? 3.5 : 3.2;
      const bearing = shardDirection(
        vec3(),
        run.right,
        run.player.n,
        spin * DT
      );
      const place = (distance: number) => {
        const target = spawnEnemy(
          run,
          'mite',
          pointAt(vec3(), run.player.n, bearing, distance / RADIUS)
        );
        target.speed = 0;
        target.hp = target.maxHp = 100;
        return target;
      };
      const expected = reach * run.player.area;
      const inner = place(expected / 2),
        onOrbit = place(expected);
      tick(run, DT, still);
      expect(weapon.radius).toBeCloseTo(expected, 9);
      expect(weapon.count).toBe(evolved ? 4 : 2);
      expect(inner.hp).toBe(100);
      const contact = run.texts.find((hit) => hit.shardTangent);
      expect(contact).toBeDefined();
      const damage = evolved ? 13 : level >= 4 ? 12 : level >= 2 ? 11 : 10;
      expect(100 - onOrbit.hp).toBe(damage * (contact!.crit ? 2 : 1));
    }
  );

  it.each([
    [1, false, 5, 0.9],
    [2, false, 5, 0.8],
    [3, false, 6, 0.8],
    [4, false, 6, 0.75],
    [5, false, 7, 0.75],
    [5, true, 8, 0.7],
  ] as const)(
    'slows immediately and deals discrete pulses at rank %i (evolved %s)',
    (level, evolved, damage, interval) => {
      const run = createRun(7, RADIUS);
      run.weapons = [];
      run.eventIndex = 1000;
      run.spawnCredit = -1e6;
      for (let i = 0; i < level; i++)
        applyOffer(run, { kind: 'weapon', id: 'pulse', isNew: i === 0 });
      if (evolved) applyOffer(run, { kind: 'evolution', id: 'pulse' });
      const target = spawnEnemy(
        run,
        'mite',
        pointAt(vec3(), run.player.n, run.right, 0.6 / RADIUS)
      );
      target.speed = 0;
      target.hp = target.maxHp = 200;
      const ticks = Math.ceil(interval * SIM_HZ);
      for (let beat = 0; beat < 2; beat++) {
        const before = target.hp;
        for (let i = 1; i < ticks; i++) {
          tick(run, DT, still);
          expect(target.slowTime).toBeGreaterThan(0);
          expect(target.hp).toBe(before);
        }
        tick(run, DT, still);
        const hit = run.texts[run.texts.length - 1];
        expect(hit.pulseContact).toBeDefined();
        expect(before - target.hp).toBe(damage * (hit.crit ? 2 : 1));
      }
    }
  );

  it('signals Stake Pulse contacts only on damage and Bastion returns only on actual repair', () => {
    const run = createRun(7, RADIUS);
    run.weapons = [];
    run.spawnCredit = -1e6;
    run.eventIndex = 1000;
    applyOffer(run, { kind: 'weapon', id: 'pulse', isNew: true });
    const weapon = run.weapons[0];
    const lastContact = () => run.texts[run.texts.length - 1]?.pulseContact;
    const discharge = () => {
      weapon.cooldown = 0;
      tick(run, DT, still);
    };
    const target = spawnEnemy(
      run,
      'mite',
      pointAt(vec3(), run.player.n, run.right, 2 / RADIUS)
    );
    target.speed = 0;
    target.hp = target.maxHp = 200;
    discharge();
    expect(weapon.dischargedAt).toBeUndefined();
    expect(run.texts).toHaveLength(0);
    pointAt(target.n, run.player.n, run.right, 0.4 / RADIUS);
    tick(run, DT, still);
    expect(target.slowTime).toBeGreaterThan(0);
    expect(weapon.dischargedAt).toBeUndefined();
    discharge();
    expect(weapon.dischargedAt).toBe(run.time);
    expect(lastContact()).toEqual({
      radius: target.spec.radius,
      repaired: false,
    });
    applyOffer(run, { kind: 'evolution', id: 'pulse' });
    discharge();
    expect(lastContact()?.repaired).toBe(false);
    run.player.hp -= 3;
    target.hp = 1;
    discharge();
    expect(run.enemies).not.toContain(target);
    expect(run.healedBy.bastion).toBeCloseTo(0.35);
    expect(lastContact()?.repaired).toBe(true);
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

  it.each([
    ['trooper', 'blade', 'force'],
    ['trooper', 'charge', 'tractor'],
    ['vanguard', 'charge', 'tractor'],
    ['vanguard', 'rebuke', 'aegis'],
    ['vanguard', 'bolts', 'overclock'],
  ] as const)(
    '%s can evolve %s with %s through level-ups and Supply Drops',
    (hero, weapon, system) => {
      const run = createRun(17, RADIUS, hero);
      if (weapon !== 'blade')
        applyOffer(run, { kind: 'weapon', id: weapon, isNew: true });
      const owned = run.weapons.find((w) => w.id === weapon)!;
      owned.level = 5;
      const evolution = { kind: 'evolution', id: weapon };
      const allOffers = () => makeOffers(run, Infinity);
      const unpaired = allOffers();
      expect(unpaired).not.toContainEqual(evolution);
      expect(unpaired).toContainEqual({
        kind: 'system',
        id: system,
        isNew: true,
      });
      applyOffer(run, { kind: 'system', id: system, isNew: true });
      expect(allOffers()).toContainEqual(evolution);
      run.pendingDrops.push(1);
      tick(run, DT, still);
      expect(run.status).toBe('supply');
      expect(run.supply[0]).toEqual(evolution);
      expect(owned.evolved).toBe(true);
      closeSupply(run);
      expect(run.status).toBe('playing');
    }
  );

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

  it('leaves space in the opening and fills the arena later', () => {
    const snapshot = (minutes: number) => {
      const run = createRun(7, RADIUS);
      run.time = minutes * 60 - DT;
      run.eventIndex = 1000;
      run.spawnCredit = 500;
      tick(run, DT, still);
      return { crowd: run.enemies.length, healthScale: run.healthScale };
    };
    const opening = snapshot(3);
    const midgame = snapshot(8);
    const late = snapshot(15);
    expect(opening.crowd).toBeGreaterThan(8);
    expect(opening.crowd).toBeLessThan(25);
    expect(midgame.crowd).toBeGreaterThan(opening.crowd * 2);
    expect(midgame.healthScale).toBeGreaterThan(opening.healthScale);
    expect(late.crowd).toBe(380);
    expect(late.healthScale).toBeGreaterThan(midgame.healthScale);
  });

  it('brings the Warden at three and a half Legion minutes and keeps enemies near the player', () => {
    const run = createRun(29, RADIUS);
    run.player.invulnerable = 1e9;
    play(run, 210 / PACE - 1, kite);
    expect(run.wardens).toBe(0);
    play(run, 2, kite);
    expect(run.wardens).toBe(1);
    for (const enemy of run.enemies)
      if (!enemy.straight)
        expect(chord(enemy.n, run.player.n) * RADIUS).toBeLessThan(7.7);
  });

  it('eventually overwhelms a player who stands still, though not at once', () => {
    const run = play(createRun(5, RADIUS), 600, () => still);
    expect(run.status).toBe('fallen');
    expect(run.lastHitBy).not.toBeNull();
    // A trooper that never moves lasts about half a minute on the slower XP curve.
    expect(run.time).toBeGreaterThan(20);
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
    run.random = () => 0.5;
    tick(run, DT, still);
    if (kind === 'lancer') {
      expect(enemy.mode).toBe('walk');
      expect(run.effects.some((effect) => effect.kind === 'aim')).toBe(false);
      expect(run.projectiles).toHaveLength(1);
      expect(run.projectiles[0].speed).toBe(1.36);
      expect(enemy.cooldown).toBeCloseTo(4.625);
    } else {
      expect(enemy.mode).toBe('aim');
      expect(enemy.modeTime).toBe(0.5);
      expect(enemy.cooldown + enemy.modeTime).toBeCloseTo(4);
      expect(run.effects.some((effect) => effect.kind === 'aim')).toBe(true);
      expect(run.projectiles).toHaveLength(0);
    }
  }
});

it('adds common charging Bulwarks to the spawn pool at 2:30 on the Legion clock', () => {
  for (const time of [150 / PACE - 1, 150 / PACE]) {
    const run = createRun(17, RADIUS);
    run.weapons = [];
    // Pick the last eligible kind so a smaller crowd still exercises the unlock.
    run.random = () => 0.999;
    run.time = time;
    run.eventIndex = 1000;
    run.spawnCredit = 100;
    tick(run, DT, still);
    const bulwarks = run.enemies.filter((enemy) => enemy.kind === 'bulwark');
    if (time < 150 / PACE) expect(bulwarks).toHaveLength(0);
    else {
      expect(bulwarks.length).toBeGreaterThan(0);
      expect(bulwarks.every((enemy) => !enemy.straight)).toBe(true);
    }
  }
});

it('spaces out lone Seeker breaches and caps them independently of pack waves', () => {
  const run = createRun(17, RADIUS);
  run.weapons = [];
  run.eventIndex = 1000;
  // Seekers are the last entry in the ordinary spawn pool. Pick one whenever eligible.
  run.random = () => 0.999;
  const spawnAt = (seconds: number, credits = 1) => {
    run.time = seconds - DT;
    run.spawnCredit = credits;
    tick(run, DT, still);
    return run.enemies.filter(
      (enemy) => enemy.kind === 'seeker' && !enemy.straight
    );
  };
  expect(spawnAt((5.25 * 60) / PACE - 1)).toHaveLength(0);
  runEvent(run, 'seekerPacks');
  expect(spawnAt(360, 12)).toHaveLength(1);
  expect(spawnAt(361.9)).toHaveLength(1);
  expect(spawnAt(362)).toHaveLength(2);
  expect(spawnAt(364)).toHaveLength(3);
  const capped = spawnAt(366);
  expect(capped).toHaveLength(3);
  capped[0].dead = true;
  const replenished = spawnAt(367);
  expect(replenished).toHaveLength(3);
  expect(replenished).not.toContain(capped[0]);
});
