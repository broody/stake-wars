import type { EnemyModel } from './content';

export const ENEMY_DEFEAT = {
  duration: 1.25,
  blendIn: 0.08,
  fadeStart: 1.4,
  lifetime: 1.8,
  capacity: 192,
};

export const WARDEN_DEFEAT = {
  ...ENEMY_DEFEAT,
  duration: 1.75,
  fadeStart: 1.95,
  lifetime: 2.5,
};

export const SEEKER_DEFEAT = {
  ...ENEMY_DEFEAT,
  duration: 1.8,
  fadeStart: 1.95,
  lifetime: 2.5,
};

export function enemyDefeatTiming(model: EnemyModel) {
  return model === 'warden'
    ? WARDEN_DEFEAT
    : model === 'seeker'
      ? SEEKER_DEFEAT
      : ENEMY_DEFEAT;
}

/** Immediately translucent, then fade the settled body away. */
export function enemyDefeatOpacity(age: number, model: EnemyModel = 'mite') {
  const timing = enemyDefeatTiming(model);
  const collapse = Math.min(1, Math.max(0, age / timing.duration));
  const fade = Math.min(
    1,
    Math.max(0, (age - timing.fadeStart) / (timing.lifetime - timing.fadeStart))
  );
  return (0.72 - 0.22 * collapse) * (1 - fade);
}

/** A small enemy killed by an Orbital Strike or a saber cut is thrown clear of the hit. */
export const STRIKE_TOSS = {
  duration: 0.6,
  /** Ground distance it lands from where it died, plus up to `spread` more. */
  distance: 0.7,
  spread: 0.4,
  /** A skim just off the ground; each throw varies from 0.6× to 1.4× this. */
  height: 0.045,
  /** Each throw leaves up to this many radians either side of straight away. */
  jitter: 0.45,
  /** After touchdown it skids on, `slide` plus up to `slideSpread` more. */
  slide: 0.08,
  slideSpread: 0.2,
  slideDuration: 0.4,
  /** The skid veers up to this far either side of the line of flight. */
  slideTurn: 1.1,
  /**
   * A Mite lands on its back leaning `minTilt`–`tilt` radians toward a random
   * side, so its legs never point straight up, and turns up to `twist`.
   */
  minTilt: 0.15,
  tilt: 0.4,
  twist: 1.2,
  /** Heaviest enemy that is thrown; Bulwarks, Captains and Wardens stand firm. */
  maxMass: 1,
};

/** Model-unit middle and half-width of thrown bodies, from the authored GLBs. */
export const TOSS_SHAPE: Partial<
  Record<EnemyModel, { center: number; halfWidth: number }>
> = {
  // Half its 0.63 height: turned over about it, the Mite rests on its back.
  mite: { center: 0.31, halfWidth: 0.45 },
  lancer: { center: 0.96, halfWidth: 0.47 },
};

/**
 * Flight progress, ground travel and lift fraction `age` seconds after death,
 * then how far through its skid from touchdown to rest it is.
 */
export function tossFlight(age: number) {
  const k = Math.min(1, Math.max(0, age / STRIKE_TOSS.duration));
  const skid = Math.min(
    1,
    Math.max(0, (age - STRIKE_TOSS.duration) / STRIKE_TOSS.slideDuration)
  );
  // Fast off the hit, settling into the landing; the skid brakes to a stop.
  return {
    k,
    travel: 1 - (1 - k) * (1 - k),
    lift: 4 * k * (1 - k),
    slide: 1 - (1 - skid) * (1 - skid),
  };
}
