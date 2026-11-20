/**
 * When things happen in an action's loop: the swing, how its clip is
 * retimed to the sim's hit, the slash mark, sounds and the kit's effects.
 * Read from one replay of the scripted run, so the timeline shows what the
 * game does rather than what it is meant to do.
 */
import { SABER } from '../survivors/saberAttack';
import type { Run } from '../survivors/sim';
import { VANGUARD } from '../utils/vanguardAnimation';
import type { ActionSpec, Stance, SwingOptions } from './actions';
import { ActionDriver, STEP } from './driver';

/** The model's authored frame rate. */
export const CLIP_FPS = 24;

/** Lengths of the Vanguard's clips in seconds, from its sword metadata. */
export const CLIP_SECONDS = {
  Idle: 48 / CLIP_FPS,
  Walk: 32 / CLIP_FPS,
  Run: 20 / CLIP_FPS,
  Attack: 22 / CLIP_FPS,
  AttackBackhand: 22 / CLIP_FPS,
  RunAttack: 20 / CLIP_FPS,
  RunAttackBackhand: 20 / CLIP_FPS,
  Defeated: VANGUARD.deathDuration,
} as const;

export type ClipName = keyof typeof CLIP_SECONDS;
export type SwingClip =
  | 'Attack'
  | 'AttackBackhand'
  | 'RunAttack'
  | 'RunAttackBackhand';
export const SWING_CLIPS: SwingClip[] = [
  'Attack',
  'AttackBackhand',
  'RunAttack',
  'RunAttackBackhand',
];

/** The cut's authored active window in clip seconds, frames 6 to 11. */
export const SWING_ACTIVE = [0.25, 11 / CLIP_FPS] as const;

/**
 * The swing's upper-body blend, as fractions of the swing: it eases in over
 * the first 8% and out over the last 12% (VanguardAnimation.update).
 */
export const SWING_BLEND = { in: 0.08, out: 0.12 } as const;

/**
 * The clip a swing plays. Any movement at all swaps the standing cut for
 * the running one; the side picks forehand (-1) or backhand (+1).
 */
export function swingClip(stance: Stance, side: number): SwingClip {
  const base = stance === 'stand' ? 'Attack' : 'RunAttack';
  return side > 0 ? `${base}Backhand` : base;
}

/**
 * Seconds into a swing of `duration` at which its clip shows clip time
 * `clip`: the inverse of `saberClipTime`, which stretches the clip so its
 * cut at `clipImpact` lands on the sim's hit.
 */
export function swingElapsedAt(
  clip: number,
  duration: number,
  clipDuration: number,
  clipImpact: number = VANGUARD.impact
) {
  const t =
    clip <= clipImpact
      ? (clip / clipImpact) * SABER.impact
      : SABER.impact +
        ((clip - clipImpact) / (clipDuration - clipImpact)) *
          (SABER.duration - SABER.impact);
  return (t / SABER.duration) * duration;
}

/** Clip seconds played per run second, `elapsed` into the swing. */
export function swingClipRate(
  elapsed: number,
  duration: number,
  clipDuration: number,
  clipImpact: number = VANGUARD.impact
) {
  const scale = SABER.duration / duration;
  return (
    scale *
    ((elapsed / duration) * SABER.duration <= SABER.impact
      ? clipImpact / SABER.impact
      : (clipDuration - clipImpact) / (SABER.duration - SABER.impact))
  );
}

/** Everything the timeline marks, in seconds into the loop. */
export interface ActionProbe {
  loop: number;
  swing?: {
    start: number;
    duration: number;
    side: number;
    clip: SwingClip;
    /** When the sim's hit lands. */
    impact: number;
  };
  /** The slash mark on the ground, from the moment it shows. */
  slash?: { start: number; life: number; kind: 'sweep' | 'eclipse' };
  /** The swing's sound at its peak, and each hit sound. */
  sounds: { id: 'swing' | 'hit' | 'shot'; at: number }[];
  crescent?: { start: number; end: number };
  rebuke?: { start: number; life: number };
  aegis: { at: number; result: 'blocked' | 'broke' }[];
  pulses: number[];
  shardHits: number[];
  strikes: { at: number; linked: boolean; count: number }[];
  lob?: { start: number; count: number };
  burn?: { start: number; life: number };
  wounds: number[];
  fall?: number;
}

/** Replay an action's run once and note when each of its events fires. */
export function probeAction(
  spec: ActionSpec,
  options: SwingOptions | undefined = spec.swing
): ActionProbe {
  const seen = new Set<object>();
  let blockedAt = -Infinity;
  let brokeAt = -Infinity;
  let preroll = 0;
  const probe: ActionProbe = {
    loop: 0,
    sounds: [],
    aegis: [],
    pulses: [],
    shardHits: [],
    strikes: [],
    wounds: [],
  };
  const record = (run: Run) => {
    const now = run.time - preroll;
    const player = run.player;
    if (spec.kind === 'moving-loadout') {
      let shardHit = false;
      for (const hit of run.texts) {
        if (!hit.shardTangent || seen.has(hit)) continue;
        seen.add(hit);
        shardHit = true;
      }
      if (shardHit) probe.shardHits.push(now);
    }
    const attack = player.saberAttack;
    if (attack && !probe.swing)
      probe.swing = {
        start: attack.startedAt - preroll,
        duration: attack.duration,
        side: attack.side,
        clip: swingClip(options?.stance ?? 'stand', attack.side),
        impact:
          attack.startedAt -
          preroll +
          (SABER.impact / SABER.duration) * attack.duration,
      };
    for (const effect of run.effects) {
      if (seen.has(effect)) continue;
      seen.add(effect);
      // Renderers age an effect from the start of the tick that made it, so
      // it shows up to a tick before the moment that made it.
      const born = now - effect.age;
      if (effect.kind === 'sweep' || effect.kind === 'eclipse')
        probe.slash ??= { start: born, life: effect.life, kind: effect.kind };
      if (effect.kind === 'rebuke')
        probe.rebuke ??= { start: born, life: effect.life };
      if (effect.kind === 'strike') {
        const previous = probe.strikes[probe.strikes.length - 1];
        if (
          previous &&
          previous.at === born &&
          previous.linked === effect.linked
        )
          previous.count++;
        else probe.strikes.push({ at: born, linked: effect.linked, count: 1 });
      }
    }
    const lob = run.lobs[0],
      zone = run.zones[0];
    if (lob) probe.lob ??= { start: now - lob.age, count: run.lobs.length };
    if (zone) probe.burn ??= { start: now - zone.age, life: zone.life };
    let hit = false;
    for (const cue of run.cues) {
      if (
        (spec.kind === 'pulse' ||
          spec.kind === 'bastion' ||
          spec.kind === 'moving-loadout') &&
        (cue.id === 'pulse' || cue.id === 'bastion')
      )
        probe.pulses.push(now);
      if (cue.id === 'blade' || cue.id === 'eclipse')
        probe.sounds.push({ id: 'swing', at: now + (cue.at ?? 0) });
      else if (cue.id === 'bolt' || cue.id === 'railstorm')
        probe.sounds.push({ id: 'shot', at: now });
      else if (
        (cue.id === 'hit' || cue.id === 'crit' || cue.id === 'shard-hit') &&
        !hit
      ) {
        hit = true;
        probe.sounds.push({ id: 'hit', at: now });
      }
    }
    if (run.crescents.length) {
      // Drawn moving from where it was last tick, so it shows a tick early.
      probe.crescent ??= { start: now - STEP, end: now };
      probe.crescent.end = now;
    }
    const aegis = player.aegis;
    if (aegis && aegis.brokeAt !== brokeAt) {
      brokeAt = aegis.brokeAt;
      blockedAt = aegis.blockedAt;
      probe.aegis.push({ at: now, result: 'broke' });
    } else if (aegis && aegis.blockedAt !== blockedAt) {
      blockedAt = aegis.blockedAt;
      probe.aegis.push({ at: now, result: 'blocked' });
    }
    if (player.wound && !seen.has(player.wound)) {
      seen.add(player.wound);
      probe.wounds.push(player.wound.at - preroll);
    }
    if (run.status === 'fallen' && probe.fall === undefined) probe.fall = now;
  };
  const driver = new ActionDriver(spec, options, record);
  preroll = driver.script.preroll;
  probe.loop = driver.loop;
  driver.show(driver.runTime(driver.loop));
  return probe;
}

/** Where each authored frame of a swing's clip shows, in loop seconds. */
export function swingFrameTimes(swing: NonNullable<ActionProbe['swing']>) {
  const seconds = CLIP_SECONDS[swing.clip];
  const frames = Math.round(seconds * CLIP_FPS);
  return Array.from(
    { length: frames + 1 },
    (_, frame) =>
      swing.start + swingElapsedAt(frame / CLIP_FPS, swing.duration, seconds)
  );
}

/** Clips that loop as authored; the others are one-shots. */
const LOOPING: ClipName[] = ['Idle', 'Walk', 'Run'];
/** How long a one-shot holds its last frame before it plays again. */
const HOLD = 0.35;

/** The clip an action plays when shown as authored, if it has one. */
export function authoredClip(
  spec: ActionSpec,
  probe: ActionProbe
): ClipName | null {
  switch (spec.kind) {
    case 'defeated':
      return 'Defeated';
    case 'idle':
      return 'Idle';
    case 'walk':
      return 'Walk';
    case 'run':
      return 'Run';
    case 'swing':
    case 'crescent':
      return probe.swing?.clip ?? null;
    default:
      return null;
  }
}

/** The loop of a clip shown as authored, and its clip time `time` into it. */
export function authoredLoop(clip: ClipName) {
  const seconds = CLIP_SECONDS[clip];
  const loops = LOOPING.includes(clip);
  return {
    loop: loops ? seconds : seconds + HOLD,
    clipTime: (time: number) =>
      loops ? time % seconds : Math.min(time, seconds - 1e-4),
  };
}
