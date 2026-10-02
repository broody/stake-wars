/** Timing and root arc from Mite.glb's authored LeapAttack (24 fps). */
export const VOLT_LEAP = {
  fps: 24,
  duration: 30 / 24,
  start: 0,
  /** Stretch the authored coil to let the directional warning fill before takeoff. */
  windup: 0.55,
  cooldown: 1.2,
  damage: 16,
  hitReach: 0.06,
  takeoff: 8 / 24,
  impact: 18 / 24,
  rootDistance: 1.2,
  rootHeight: 0.18,
  trigger: 0.9,
  maxDistance: 0.9,
  heightScale: 4,
  blendIn: 0.06,
  blendOut: 0.08,
} as const;

/** Interpolate the exported frame samples, shared by movement and GPU placement. */
export function sampleVoltLeap(time: number) {
  const frame = Math.min(30, Math.max(0, time * VOLT_LEAP.fps));
  const a = Math.floor(frame),
    b = Math.min(30, a + 1);
  const progress = (f: number) => Math.min(1, Math.max(0, (f - 8) / 10));
  const t = progress(a),
    u = progress(b),
    mix = frame - a;
  return {
    progress: t + (u - t) * mix,
    height:
      VOLT_LEAP.rootHeight *
      4 *
      (t * (1 - t) + (u * (1 - u) - t * (1 - t)) * mix),
  };
}

/** Gameplay clock to the authored clip: a readable coil, then the original flight. */
export function voltLeapClipTime(elapsed: number) {
  return elapsed < VOLT_LEAP.windup
    ? (Math.max(0, elapsed) / VOLT_LEAP.windup) * VOLT_LEAP.takeoff
    : Math.min(
        VOLT_LEAP.duration,
        VOLT_LEAP.takeoff + elapsed - VOLT_LEAP.windup
      );
}
export const VOLT_IMPACT_TIME =
  VOLT_LEAP.windup + VOLT_LEAP.impact - VOLT_LEAP.takeoff;
export const VOLT_END_TIME =
  VOLT_LEAP.windup + VOLT_LEAP.duration - VOLT_LEAP.takeoff;

/** Fixed-size carets fill the path, with fewer marks for shorter lunges. */
export const VOLT_WARNING_STEPS = 5;
export const VOLT_WARNING_SPACING = VOLT_LEAP.maxDistance / VOLT_WARNING_STEPS;
export function voltWarningSteps(distance: number) {
  return Math.min(
    VOLT_WARNING_STEPS,
    Math.max(0, Math.ceil(distance / VOLT_WARNING_SPACING))
  );
}
export function voltWarningCount(
  elapsed: number,
  distance: number = VOLT_LEAP.maxDistance
) {
  if (elapsed < 0 || elapsed >= VOLT_LEAP.windup) return 0;
  const steps = voltWarningSteps(distance);
  return Math.min(steps, 1 + Math.floor((elapsed / VOLT_LEAP.windup) * steps));
}
