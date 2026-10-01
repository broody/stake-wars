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

export function enemyDefeatTiming(model: EnemyModel) {
  return model === 'warden' ? WARDEN_DEFEAT : ENEMY_DEFEAT;
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
