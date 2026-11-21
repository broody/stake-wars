/**
 * One headless Core Survivors run driven by the balance bot.
 *
 * Survival mode uses live HP and ends on defeat. Pressure mode pins HP at
 * half each tick to keep measuring incoming damage and potential healing
 * after the bot's virtual health first reaches zero.
 *
 * Headless runs use the sim's default landscape view for spawn placement and
 * a flat Core with no raised Sectors.
 */
import {
  applyOffer,
  createRun,
  seededRandom,
  SIM_HZ,
  tick,
  type EnemyKind,
  type HealSource,
  type HeroId,
  type Run,
  type WeaponId,
} from '../sim';
import { ENEMY_GROUND_RADIUS } from '../../utils/enemySwarm';
import { carriesAegis, DEFAULT_HERO } from '../content';
import type { AegisTuning } from '../aegis';
import { decide, pilot, type OfferPolicy, type Stance } from './bot';
import { buildFor, type BuildName } from './builds';

export type BalanceMode = 'survival' | 'pressure';

export interface RunOptions {
  seed: number;
  policy: OfferPolicy;
  focus?: WeaponId;
  build: BuildName;
  /** Maximum seconds of combat. */
  cap: number;
  mode?: BalanceMode;
  hero?: HeroId;
  /** How the bot moves; by default a shielded hero engages and others kite. */
  stance?: Stance;
  /** Aegis settings to try in place of the ground settings. */
  aegis?: Partial<AegisTuning>;
  /** A Legion clock speed to try in place of the game's `PACE`. */
  pace?: number;
  /** A level speed to try in place of the game's `LEVEL_PACE`. */
  levelPace?: number;
}

export interface Minute {
  minute: number;
  /** Damage the player took and healed during this minute. */
  taken: number;
  healed: number;
  /** Integrity at the end of the minute (virtual in pressure mode). */
  health: number;
  maxHp: number;
  level: number;
  kills: number;
  alive: number;
}

export interface RunResult {
  seed: number;
  policy: OfferPolicy;
  focus?: WeaponId;
  build: BuildName;
  cap: number;
  hero: HeroId;
  stance: Stance;
  mode: BalanceMode;
  /** First actual or virtual defeat. A null value means the run reached the cap. */
  fellAt: number | null;
  killedBy: EnemyKind | null;
  level: number;
  kills: number;
  weapons: { id: WeaponId; level: number; evolved: boolean }[];
  systems: Partial<Record<string, number>>;
  firstEvolution: number | null;
  damageBy: Partial<Record<WeaponId, number>>;
  hurtBy: Partial<Record<EnemyKind, number>>;
  /** Damage Aegis took instead of integrity, and how often it broke. */
  absorbedBy: Partial<Record<EnemyKind, number>>;
  aegisBreaks: number;
  healedBy: Partial<Record<HealSource, number>>;
  minutes: Minute[];
  /** Wall-clock milliseconds, to keep an eye on simulator speed. */
  ms: number;
}

const sum = (record: Partial<Record<string, number>>) => {
  let total = 0;
  for (const value of Object.values(record)) total += value ?? 0;
  return total;
};

export function runSurvivor({
  seed,
  policy,
  focus,
  build,
  cap,
  mode = 'survival',
  hero = DEFAULT_HERO,
  stance = carriesAegis(hero) ? 'engage' : 'kite',
  aegis,
  pace,
  levelPace,
}: RunOptions): RunResult {
  const started = Date.now();
  const run: Run = createRun(seed, ENEMY_GROUND_RADIUS, hero, {
    aegis,
    pace,
    levelPace,
  });
  for (const offer of buildFor(hero, build)) applyOffer(run, offer);
  run.player.hp = run.player.maxHp;
  const random = seededRandom(seed ^ 0x5bd1e995);
  const dt = 1 / SIM_HZ;
  const minutes: Minute[] = [];
  let health = run.player.maxHp;
  let fellAt: number | null = null;
  let killedBy: EnemyKind | null = null;
  let firstEvolution = run.weapons.some((w) => w.evolved) ? 0 : null;
  let lastMinuteTaken = 0;
  let lastMinuteHealed = 0;
  const pressure = mode === 'pressure';
  const steps = Math.ceil(cap * SIM_HZ);
  for (let step = 1; step <= steps; step++) {
    const takenBefore = pressure ? sum(run.hurtBy) : 0;
    const healedBefore = pressure ? sum(run.healedBy) : 0;
    if (pressure) run.player.hp = run.player.maxHp / 2;

    while (run.status === 'choosing' || run.status === 'supply') {
      const choiceHp = pressure ? health : run.player.hp;
      decide(run, policy, random, 1 - choiceHp / run.player.maxHp, focus);
      if (firstEvolution === null && run.weapons.some((w) => w.evolved))
        firstEvolution = run.time;
    }
    const movementHp = pressure ? health : run.player.hp;
    tick(run, dt, pilot(run, 1 - movementHp / run.player.maxHp, stance));

    if (pressure) {
      const hit = sum(run.hurtBy) - takenBefore;
      const repaired = sum(run.healedBy) - healedBefore;
      health = Math.max(0, Math.min(run.player.maxHp, health + repaired) - hit);
      // A hit can also empty the pinned HP bar. Continue the pressure probe.
      if (run.player.hp <= 0) run.status = 'playing';
    } else {
      health = run.player.hp;
    }
    if (health <= 0 && fellAt === null) {
      fellAt = step / SIM_HZ;
      killedBy = run.lastHitBy;
    }
    // A Supply Drop can evolve a weapon during the tick itself.
    if (firstEvolution === null && run.weapons.some((w) => w.evolved))
      firstEvolution = run.time;
    if (step % (60 * SIM_HZ) === 0) {
      const taken = sum(run.hurtBy);
      const healed = sum(run.healedBy);
      minutes.push({
        minute: step / (60 * SIM_HZ),
        taken: taken - lastMinuteTaken,
        healed: healed - lastMinuteHealed,
        health,
        maxHp: run.player.maxHp,
        level: run.player.level,
        kills: run.kills,
        alive: run.enemies.length,
      });
      lastMinuteTaken = taken;
      lastMinuteHealed = healed;
    }
    if (!pressure && fellAt !== null) break;
  }
  return {
    mode,
    seed,
    policy,
    focus,
    build,
    cap,
    hero,
    stance,
    fellAt,
    killedBy,
    level: run.player.level,
    kills: run.kills,
    weapons: run.weapons.map((w) => ({
      id: w.id,
      level: w.level,
      evolved: w.evolved,
    })),
    systems: { ...run.systems },
    firstEvolution,
    damageBy: { ...run.damageBy },
    hurtBy: { ...run.hurtBy },
    absorbedBy: { ...run.absorbedBy },
    aegisBreaks: run.aegisBreaks,
    healedBy: { ...run.healedBy },
    minutes,
    ms: Date.now() - started,
  };
}
