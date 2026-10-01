import data from './bulwarkAttackData.json';

export const BULWARK_ATTACK = {
  ...data,
  triggerRange: 1.3,
  rootMotionScale: 2,
  cooldown: 3,
  knockback: 0.12,
  blendIn: 0.12,
  blendOut: 0.16,
};

// Scale actor travel without stretching the shield or changing the local pose.
// Collision, warning lanes, and skid trails all consume these same samples.
const gameplaySamples = data.samples.map(([root, left, right, near, far]) => {
  const extraTravel = root * (BULWARK_ATTACK.rootMotionScale - 1);
  return [
    root + extraTravel,
    left,
    right,
    near + extraTravel,
    far + extraTravel,
  ];
});

/** Retargeted root movement and shield bounds, including travel, in model units. */
export function sampleBulwarkAttack(time: number): number[] {
  const frame = Math.max(0, Math.min(data.samples.length - 1, time * data.fps));
  const a = Math.floor(frame),
    b = Math.min(a + 1, data.samples.length - 1);
  return gameplaySamples[a].map(
    (value, i) => value + (gameplaySamples[b][i] - value) * (frame - a)
  );
}

export function bulwarkWarningBounds(scale: number) {
  const samples = gameplaySamples.slice(16, 21);
  return {
    left: Math.min(...samples.map((s) => s[1])) * scale,
    right: Math.max(...samples.map((s) => s[2])) * scale,
    near: Math.min(...samples.map((s) => s[3])) * scale,
    far: Math.max(...samples.map((s) => s[4])) * scale,
  };
}

/** Swept point vs moving rectangle; bounds grow by the player's collision radius. */
export function sweptShieldHit(
  before: number[],
  after: number[],
  playerBefore: readonly number[],
  playerAfter: readonly number[],
  scale: number,
  radius: number
) {
  let enter = 0,
    leave = 1;
  for (const [axis, low, high] of [
    [0, 1, 2],
    [1, 3, 4],
  ]) {
    for (const sign of [-1, 1]) {
      const edge = sign < 0 ? low : high;
      const start = sign * (playerBefore[axis] - before[edge] * scale) - radius;
      const end = sign * (playerAfter[axis] - after[edge] * scale) - radius;
      if (start > 0 && end > 0) return false;
      if (start <= 0 && end <= 0) continue;
      const crossing = start / (start - end);
      if (start > 0) enter = Math.max(enter, crossing);
      else leave = Math.min(leave, crossing);
    }
  }
  return enter <= leave;
}
