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

export const SEEKER_GAIT = {
  walkSpeed: 0.4761904761904762,
  runSpeed: 1.9871794871794872,
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
