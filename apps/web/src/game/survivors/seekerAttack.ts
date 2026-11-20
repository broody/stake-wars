/** Shared simulation timings and authored, in-place Seeker gait speeds. */
export const SEEKER_ATTACK = {
  windup: 0.8,
  packWindup: 1.6,
  drive: 1,
  packDrive: 99,
  recover: 0.6,
  speed: 3,
  trigger: 3,
  cooldown: 3,
} as const;

/** Independently aimed charges from ordinary Sector breaches. */
export const SOLO_SEEKERS = {
  maxAlive: 3,
  spawnInterval: 2,
} as const;

/**
 * A Seeker pack: one file of Seekers trailing back from the leader, each
 * stepped a little to alternate sides. Pack Seekers are solid, so the column
 * is a moving wall the player has to wait out or go around.
 */
export const SEEKER_PACK = {
  size: 8,
  /** World units between one Seeker and the next one back. */
  spacing: 0.32,
  /** World units each Seeker sits to the side of the lane. */
  stagger: 0.12,
} as const;

/**
 * Seeker pack waves: the first sends packs down three lanes, each later wave
 * one more, up to `max`. A wave's first `perAxis` lanes run side by side;
 * the rest cross them at right angles.
 */
export const SEEKER_LANES = {
  first: 3,
  max: 8,
  perAxis: 4,
  /** World units between neighbouring lanes. */
  spacing: 1.6,
} as const;

/** Packs in the `wave`th pack wave, counting from 0. */
export const seekerPacksFor = (wave: number) =>
  Math.min(SEEKER_LANES.max, SEEKER_LANES.first + wave);

export interface SeekerLane {
  /** 0 for the wave's first axis, 1 for the one crossing it. */
  axis: 0 | 1;
  /** Charges the opposite way along its axis. */
  reverse: boolean;
  /** World units to the side of the axis; null to pick at random. */
  across: number | null;
}

/** Where each of `packs` packs runs: side by side, then crossing. */
export function seekerLanes(packs: number): SeekerLane[] {
  const lanes: SeekerLane[] = [];
  const counts = [
    Math.min(packs, SEEKER_LANES.perAxis),
    Math.max(0, packs - SEEKER_LANES.perAxis),
  ];
  counts.forEach((count, axis) => {
    for (let p = 0; p < count; p++)
      lanes.push({
        axis: axis as 0 | 1,
        reverse: p % 2 === 1,
        across:
          count === 1 ? null : (p - (count - 1) / 2) * SEEKER_LANES.spacing,
      });
  });
  return lanes;
}

export const SEEKER_GAIT = {
  // Stance travel / (fraction of cycle planted × clip duration), in model units/s.
  walkSpeed: 0.78 / (0.64 * 1.2),
  runSpeed: 1.12 / (0.37 * 0.65),
  chargeSpeed: 12,
} as const;

/** Remaining simulation time includes interpolation back to the drawn tick. */
export function seekerAttackPose(
  mode: string,
  remaining: number,
  pack: boolean
) {
  if (mode === 'aim')
    return {
      clip: 'ChargeWindup' as const,
      elapsed:
        Math.max(
          0,
          1 -
            remaining / (pack ? SEEKER_ATTACK.packWindup : SEEKER_ATTACK.windup)
        ) * SEEKER_ATTACK.windup,
    };
  if (mode === 'charge')
    return {
      clip: 'Charge' as const,
      elapsed: Math.max(
        0,
        (pack ? SEEKER_ATTACK.packDrive : SEEKER_ATTACK.drive) - remaining
      ),
    };
  if (mode === 'recover')
    return {
      clip: 'ChargeRecover' as const,
      elapsed: Math.max(0, SEEKER_ATTACK.recover - remaining),
    };
  return undefined;
}
