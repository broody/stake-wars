import { describe, expect, it } from 'vitest';
import {
  applyOffer,
  chooseOffer,
  createRun,
  makeOffers,
  SIM_HZ,
  spawnEnemy,
  tick,
  type EnemyKind,
  type HeroId,
  type Run,
} from './sim';
import { AEGIS, AEGIS_RANKS } from './aegis';
import { ENEMIES } from './content';
import { pointAt, vec3, type Vec3 } from './sphere';

const RADIUS = 5.006;
const dt = 1 / SIM_HZ;
const still = { x: 0, y: 0 };

/** A quiet run: no spawns or events, just what each test places. */
function drill(hero: HeroId = 'vanguard') {
  const run = createRun(42, RADIUS, hero);
  run.spawnCredit = -1e6;
  run.eventIndex = 1000;
  return run;
}

/** A quiet run with the Aegis branch fully raised. */
function charged() {
  const run = drill();
  for (let rank = 0; rank < AEGIS_RANKS; rank++)
    applyOffer(run, { kind: 'system', id: 'aegis', isNew: rank === 0 });
  return run;
}

function place(run: Run, kind: EnemyKind, distance: number, dir?: Vec3) {
  const enemy = spawnEnemy(
    run,
    kind,
    pointAt(vec3(), run.player.n, dir ?? run.right, distance / RADIUS)
  );
  enemy.speed = 0;
  enemy.cooldown = 1e6;
  enemy.hp = enemy.maxHp = 1000;
  return enemy;
}

function play(run: Run, seconds: number) {
  const end = run.time + seconds;
  while (run.time < end - 1e-9) tick(run, dt, still);
}

describe('Vanguard', () => {
  it('equips a full two-segment Aegis from the level-up choice and blocks on the next tick', () => {
    const run = drill();
    expect(run.player.aegis).toBeUndefined();
    expect(run.weapons.map((w) => w.id)).toEqual(['blade']);
    expect(drill('trooper').player.aegis).toBeUndefined();
    play(run, 2);
    run.status = 'choosing';
    run.offers = [{ kind: 'system', id: 'aegis', isNew: true }];
    chooseOffer(run, 0);
    const shield = run.player.aegis!;
    expect(shield.raisedAt).toBe(run.time);
    expect(shield.segments).toBe(2);
    expect(shield.max).toBe(2);
    run.weapons = [];
    place(run, 'mite', 0.15);
    tick(run, dt, still);
    expect(shield.segments).toBe(1);
    expect(run.player.hp).toBe(100);
    expect(shield.hitBearing).toBeCloseTo(-Math.PI / 2);
    // An unrelated selection recalculates stats without re-equipping the shield.
    applyOffer(run, { kind: 'system', id: 'force', isNew: true });
    expect(shield.segments).toBe(1);
    expect(shield.raisedAt).toBeCloseTo(2);
  });

  it("starts at a Skitter's speed", () => {
    expect(drill().player.speedScale).toBe(ENEMIES.skitter.speed);
    expect(drill('trooper').player.speedScale).toBe(1);
  });

  it('offers only its own class weapons and branch alongside the shared Core tech', () => {
    for (const hero of ['vanguard', 'trooper'] as const) {
      const run = drill(hero);
      const seen = new Set<string>();
      const systems = new Set<string>();
      for (let i = 0; i < 300; i++)
        for (const offer of makeOffers(run, 3)) {
          if (offer.kind === 'weapon') seen.add(offer.id);
          if (offer.kind === 'system') systems.add(offer.id);
        }
      if (hero === 'vanguard') {
        expect(seen).toContain('crescent');
        expect(seen).toContain('rebuke');
        expect(systems).toContain('aegis');
      } else {
        expect(seen).not.toContain('crescent');
        expect(seen).not.toContain('rebuke');
        expect(systems).not.toContain('aegis');
      }
      expect(seen).toContain('bolts');
      expect(systems).not.toContain('plating');
      expect(systems).toContain('tractor');
    }
  });
});

describe('Aegis in a run', () => {
  it('takes contact hits on the shield instead of integrity', () => {
    const run = charged();
    run.weapons = [];
    place(run, 'mite', 0.15);
    tick(run, dt, still);
    expect(run.player.hp).toBe(100);
    expect(run.player.aegis!.segments).toBe(AEGIS.segments - 1);
    expect(run.player.shielded).toBe(true);
    expect(run.hurtBy).toEqual({});
    expect(run.absorbedBy.mite).toBeGreaterThan(0);

    // Without the branch, the same hit lands on integrity.
    const fresh = drill();
    fresh.weapons = [];
    place(fresh, 'mite', 0.15);
    tick(fresh, dt, still);
    expect(fresh.player.hp).toBeLessThan(100);
    expect(fresh.player.shielded).toBe(false);

    const trooper = drill('trooper');
    trooper.weapons = [];
    place(trooper, 'mite', 0.15);
    tick(trooper, dt, still);
    expect(trooper.player.hp).toBeLessThan(100);
  });

  it('holds for five hits in constant contact, then integrity takes over', () => {
    const run = charged();
    run.weapons = [];
    place(run, 'mite', 0.15);
    // One hit per invulnerability window of about 0.63 s: the fifth lands
    // near 2.5 s and the sixth near 3.2 s.
    expect(AEGIS.segments).toBe(5);
    play(run, 2.9);
    expect(run.player.hp).toBe(100);
    expect(run.player.aegis!.segments).toBe(0);
    expect(run.aegisBreaks).toBe(1);
    play(run, 1);
    expect(run.player.hp).toBeLessThan(100);
    expect(run.player.shielded).toBe(false);
  });

  it('refills once the player gets clear', () => {
    const run = charged();
    run.weapons = [];
    const mite = place(run, 'mite', 0.15);
    play(run, 2);
    const spent = run.player.aegis!.segments;
    expect(spent).toBeLessThan(AEGIS.segments);
    mite.dead = true;
    play(run, AEGIS.rechargeDelay - 0.5);
    expect(run.player.aegis!.segments).toBe(spent);
    play(run, 3);
    expect(run.player.aegis!.segments).toBe(AEGIS.segments);
  });
});

describe('Crescent Wave', () => {
  it('rides the next cut and strikes every enemy along its path once', () => {
    const run = drill();
    run.player.invulnerable = 1e6;
    applyOffer(run, { kind: 'weapon', id: 'crescent', isNew: true });
    const near = place(run, 'bulwark', 0.5);
    const far = place(run, 'bulwark', 1.8);
    play(run, 2.5);
    expect(far.hp).toBeLessThan(far.maxHp);
    // 16 a crescent, or 32 on a critical, once on each of the two.
    expect(run.damageBy.crescent).toBeGreaterThanOrEqual(32);
    expect(run.damageBy.crescent).toBeLessThanOrEqual(64);
    expect(near.hp).toBeLessThan(near.maxHp);
  });

  it('fans two crescents on the fifth release at level 3', () => {
    const run = drill();
    run.player.invulnerable = 1e6;
    applyOffer(run, { kind: 'weapon', id: 'crescent', isNew: true });
    applyOffer(run, { kind: 'weapon', id: 'crescent', isNew: false });
    applyOffer(run, { kind: 'weapon', id: 'crescent', isNew: false });
    place(run, 'bulwark', 0.5);
    let most = 0;
    for (let i = 0; i < 18 * SIM_HZ; i++) {
      tick(run, dt, still);
      most = Math.max(most, run.crescents.length);
    }
    expect(most).toBe(2);
  });

  it('becomes a cross of four on every Eclipse once both are evolved', () => {
    const run = drill();
    run.player.invulnerable = 1e6;
    applyOffer(run, { kind: 'weapon', id: 'crescent', isNew: true });
    run.weapons[0].evolved = true;
    run.weapons[1].evolved = true;
    place(run, 'bulwark', 0.5);
    let most = 0;
    for (let i = 0; i < 40; i++) {
      tick(run, dt, still);
      most = Math.max(most, run.crescents.length);
    }
    expect(most).toBe(4);
  });
});

describe('Rebuke', () => {
  function rebukeOnly(level = 1) {
    const run = drill();
    run.weapons = [];
    applyOffer(run, { kind: 'weapon', id: 'rebuke', isNew: true });
    run.weapons[0].level = level;
    return run;
  }
  const bursts = (run: Run) =>
    run.effects.filter((e) => e.kind === 'rebuke' && e.age <= dt + 1e-9).length;

  it('bursts on the tick after a hit and throws the attacker back', () => {
    const run = rebukeOnly();
    const mite = place(run, 'mite', 0.15);
    tick(run, dt, still);
    expect(run.damageBy.rebuke).toBeUndefined();
    tick(run, dt, still);
    expect(bursts(run)).toBe(1);
    expect(run.weapons[0].dischargedAt).toBe(run.time);
    expect(run.damageBy.rebuke).toBeGreaterThan(0);
    expect(mite.knock).toBeGreaterThan(0);
  });

  it('stays quiet without hits at level 2 and runs on a timer from level 3', () => {
    const quiet = rebukeOnly(2);
    quiet.player.invulnerable = 1e6;
    place(quiet, 'bulwark', 0.6);
    play(quiet, 8);
    expect(quiet.damageBy.rebuke).toBeUndefined();

    const timed = rebukeOnly(3);
    timed.player.invulnerable = 1e6;
    place(timed, 'bulwark', 0.6);
    let count = 0;
    while (timed.time < 13 - 1e-9) {
      tick(timed, dt, still);
      if (bursts(timed)) {
        expect(timed.weapons[0].dischargedAt).toBe(timed.time);
        count++;
      }
    }
    // Once as it comes online, then every 12 seconds.
    expect(count).toBe(2);
  });

  it('restores an Aegis segment from level 4 without restarting the wait', () => {
    const run = rebukeOnly(4);
    applyOffer(run, { kind: 'system', id: 'aegis', isNew: true });
    applyOffer(run, { kind: 'system', id: 'aegis', isNew: false });
    const aegis = run.player.aegis!;
    aegis.segments = 2;
    aegis.delay = 10;
    run.weapons[0].cooldown = 0;
    run.weapons[0].primed = true;
    tick(run, dt, still);
    expect(aegis.segments).toBe(3);
    expect(aegis.delay).toBeGreaterThan(9);
  });

  it('clears bolts on a reactive Rampart burst and restores two segments on a timed burst', () => {
    const run = rebukeOnly(5);
    applyOffer(run, { kind: 'system', id: 'aegis', isNew: true });
    const shield = run.player.aegis!;
    shield.segments = 0;
    shield.delay = 10;
    const rampart = run.weapons[0];
    rampart.evolved = true;
    rampart.cooldown = 1;
    const at = pointAt(vec3(), run.player.n, run.right, 1 / RADIUS);
    run.projectiles.push({
      n: at,
      prev: { ...at },
      dir: { x: -run.right.x, y: -run.right.y, z: -run.right.z },
      speed: 0.1,
      life: 4,
      damage: 4,
      pierce: 0,
      hit: new Set(),
      from: 'lancer',
    });
    rampart.primed = true;
    tick(run, dt, still);
    expect(run.projectiles).toHaveLength(0);
    expect(rampart.dischargedAt).toBe(run.time);
    expect(shield.segments).toBe(0);

    rampart.cooldown = 0;
    tick(run, dt, still);
    expect(rampart.dischargedAt).toBe(run.time);
    expect(shield.segments).toBe(2);
  });
});
