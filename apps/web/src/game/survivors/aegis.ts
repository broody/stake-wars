/**
 * Aegis, the Vanguard's shield: a gauge of segments in front of integrity.
 * Each hit spends segments instead of integrity; the gauge refills only after
 * a spell without being hit, and takes longer to come back once it breaks.
 * The Vanguard raises it through five level-up ranks. The first pick equips
 * a full gauge.
 * See docs/concepts/core-survivors/hero-classes.md for the design.
 */
export interface AegisTuning {
  segments: number;
  /** Segments a telegraphed heavy attack spends: thrust, leap or slam. */
  heavyCost: number;
  /** Seconds without a hit before refilling starts. */
  rechargeDelay: number;
  /** The same wait after the last segment goes. */
  brokenDelay: number;
  /** Segments refilled per second once refilling starts. */
  rechargeRate: number;
  /**
   * How much more each hit costs per minute of the run; 0.08 matches the
   * Legion's damage growth, so a full gauge stands for the same integrity
   * all run. 0 keeps a hit a hit.
   */
  growth: number;
  /**
   * When a hit costs more than the segments left, the share of it they could
   * not cover that goes through to integrity: 0 absorbs the whole hit as the
   * gauge breaks, 1 lets the uncovered part through.
   */
  spill: number;
}

/**
 * The v0 ground settings, which the top rank of the branch plays; balance
 * runs can override any of them, and the lower ranks follow.
 */
export const AEGIS: AegisTuning = {
  segments: 5,
  heavyCost: 3,
  rechargeDelay: 3,
  brokenDelay: 5,
  rechargeRate: 2,
  growth: 0,
  spill: 0,
};

export const AEGIS_RANKS = 5;
/** What each rank is short of the top one: segments, and seconds on both delays. */
const RANK_SHORTFALL: [segments: number, delay: number][] = [
  [3, 1],
  [2, 1],
  [2, 0],
  [1, 0],
  [0, 0],
];

/** The tuning at a rank of the branch; overrides shift the top rank. */
export function aegisAtRank(
  rank: number,
  overrides: Partial<AegisTuning> = {}
): AegisTuning {
  const top = { ...AEGIS, ...overrides };
  const [segments, delay] =
    RANK_SHORTFALL[Math.min(AEGIS_RANKS, Math.max(1, rank)) - 1];
  return {
    ...top,
    segments: Math.max(1, top.segments - segments),
    rechargeDelay: top.rechargeDelay + delay,
    brokenDelay: top.brokenDelay + delay,
  };
}

export interface Aegis {
  /** Segments left; fractional while refilling, and only whole ones block. */
  segments: number;
  max: number;
  /** Seconds until refilling starts. */
  delay: number;
  /** Run time when protection last came online, on equip or recovery. */
  raisedAt: number;
  /** Contact azimuth in the transported player frame, +Z along screen-up. */
  hitBearing: number;
  heavyHit: boolean;
  /** Run time of the last blocked hit and the last break, for effects. */
  blockedAt: number;
  brokeAt: number;
  /** The share of the last hit that reached integrity. */
  through: number;
  tuning: AegisTuning;
}

/** The pick immediately provides every segment of its rank. */
export function newAegis(overrides: Partial<AegisTuning> = {}, now = 0): Aegis {
  const tuning = { ...AEGIS, ...overrides };
  return {
    segments: tuning.segments,
    max: tuning.segments,
    delay: 0,
    raisedAt: now,
    hitBearing: 0,
    heavyHit: false,
    blockedAt: -Infinity,
    brokeAt: -Infinity,
    through: 0,
    tuning,
  };
}

export type AegisHit = 'blocked' | 'broke' | 'open';

/**
 * Take a hit on the gauge at run time `now`, `minutes` into the Legion's
 * clock (which sets how much its damage has grown). Any hit, blocked or not,
 * restarts the recharge delay. A hit that costs more than what is left still
 * lands on the shield, and breaks it.
 */
export function hitAegis(
  aegis: Aegis,
  heavy: boolean,
  now: number,
  minutes = now / 60,
  bearing = 0
): AegisHit {
  const tuning = aegis.tuning;
  if (aegis.segments < 1) {
    aegis.delay = Math.max(aegis.delay, tuning.rechargeDelay);
    aegis.through = 1;
    return 'open';
  }
  aegis.blockedAt = now;
  aegis.hitBearing = bearing;
  aegis.heavyHit = heavy;
  const cost = (heavy ? tuning.heavyCost : 1) * (1 + tuning.growth * minutes);
  const covered = Math.min(1, aegis.segments / cost);
  aegis.segments -= cost;
  aegis.through = tuning.spill * (1 - covered);
  if (aegis.segments >= 1) {
    aegis.delay = tuning.rechargeDelay;
    return 'blocked';
  }
  aegis.segments = 0;
  aegis.delay = tuning.brokenDelay;
  aegis.brokeAt = now;
  return 'broke';
}

/** Count down the delay, then refill for whatever is left of the step. */
export function rechargeAegis(aegis: Aegis, dt: number, now: number) {
  const wait = Math.min(aegis.delay, dt);
  aegis.delay -= wait;
  const refill = dt - wait;
  if (refill <= 0) return;
  restoreAegis(aegis, aegis.tuning.rechargeRate * refill, now);
}

/**
 * Raise the gauge to `rank`. Each additional slot comes full and existing
 * segments keep their current charge.
 */
export function rankAegis(
  aegis: Aegis | undefined,
  rank: number,
  overrides?: Partial<AegisTuning>,
  now = 0
): Aegis {
  const tuning = aegisAtRank(rank, overrides);
  if (!aegis) return newAegis(tuning, now);
  const gained = tuning.segments - aegis.max;
  aegis.tuning = tuning;
  aegis.max = tuning.segments;
  restoreAegis(aegis, Math.max(0, gained), now);
  return aegis;
}

/** Record the instant protection returns, including a restore from Rebuke. */
export function restoreAegis(aegis: Aegis, segments: number, now: number) {
  const before = aegis.segments;
  aegis.segments = Math.min(aegis.max, before + segments);
  if (before < 1 && aegis.segments >= 1) aegis.raisedAt = now;
}
