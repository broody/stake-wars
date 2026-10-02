/**
 * One headless Core Survivors run driven by the balance bot.
 *
 * The run never really ends: real health is held at half each tick so the
 * pressure curve continues to the cap, while a virtual health bar takes the
 * same hits and heals and records when the player would have fallen. That
 * separates "how long does the bot last" from "how hard is minute 15".
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
  type Run,
  type RunStatus,
  type WeaponId,
} from '../sim';
import { decide, pilot, type OfferPolicy } from './bot';
import { BUILDS, type BuildName } from './builds';

export interface RunOptions {
  seed: number;
  policy: OfferPolicy;
  build: BuildName;
  /** Seconds to play; runs always reach it. */
  cap: number;
}

export interface Minute {
  minute: number;
  /** Damage the player took and healed during this minute. */
  taken: number;
  healed: number;
  /** Virtual health at the end of the minute, floored at 0. */
  health: number;
  maxHp: number;
  level: number;
  kills: number;
  alive: number;
}

export interface RunResult {
  seed: number;
  policy: OfferPolicy;
  build: BuildName;
  cap: number;
  /** When virtual health first reached 0, or null if it never did. */
  fellAt: number | null;
  killedBy: EnemyKind | null;
  level: number;
  kills: number;
  weapons: { id: WeaponId; level: number; evolved: boolean }[];
  systems: Partial<Record<string, number>>;
  firstEvolution: number | null;
  damageBy: Partial<Record<WeaponId, number>>;
  hurtBy: Partial<Record<EnemyKind, number>>;
  healedBy: Partial<Record<HealSource, number>>;
  minutes: Minute[];
  /** Wall-clock milliseconds, to keep an eye on simulator speed. */
  ms: number;
}

/** The Core radius the game renders at. */
const GROUND_RADIUS = 5.006;

const sum = (record: Partial<Record<string, number>>) => {
  let total = 0;
  for (const value of Object.values(record)) total += value ?? 0;
  return total;
};

export function runSurvivor({
  seed,
  policy,
  build,
  cap,
}: RunOptions): RunResult {
  const started = Date.now();
  const run: Run = createRun(seed, GROUND_RADIUS);
  for (const offer of BUILDS[build]) applyOffer(run, offer);
  run.player.hp = run.player.maxHp;
  const random = seededRandom(seed ^ 0x5bd1e995);
  const dt = 1 / SIM_HZ;
  const minutes: Minute[] = [];
  let health = run.player.maxHp;
  let fellAt: number | null = null;
  let killedBy: EnemyKind | null = null;
  let firstEvolution = run.weapons.some((w) => w.evolved) ? 0 : null;
  let taken = 0,
    healed = 0;
  let guard = 0;
  while (run.time < cap && guard++ < cap * SIM_HZ * 4) {
    const hurt = 1 - health / run.player.maxHp;
    decide(run, policy, random, hurt);
    if (run.status !== 'playing') continue;
    const pinned = run.player.maxHp / 2;
    run.player.hp = pinned;
    const hurtBefore = sum(run.hurtBy);
    const healedBefore = sum(run.healedBy);
    tick(run, dt, pilot(run, hurt));
    // A single hit past half health would end the real run; keep playing.
    if ((run.status as RunStatus) === 'fallen') run.status = 'playing';
    const hit = sum(run.hurtBy) - hurtBefore;
    const repaired = sum(run.healedBy) - healedBefore;
    taken += hit;
    healed += repaired;
    health = Math.min(run.player.maxHp, health + repaired) - hit;
    if (health <= 0 && fellAt === null) {
      fellAt = run.time;
      killedBy = run.lastHitBy;
    }
    health = Math.max(0, health);
    if (firstEvolution === null && run.weapons.some((w) => w.evolved))
      firstEvolution = run.time;
    if (run.time >= (minutes.length + 1) * 60 - 1e-9) {
      minutes.push({
        minute: minutes.length + 1,
        taken,
        healed,
        health,
        maxHp: run.player.maxHp,
        level: run.player.level,
        kills: run.kills,
        alive: run.enemies.length,
      });
      taken = healed = 0;
    }
  }
  return {
    seed,
    policy,
    build,
    cap,
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
    healedBy: { ...run.healedBy },
    minutes,
    ms: Date.now() - started,
  };
}
