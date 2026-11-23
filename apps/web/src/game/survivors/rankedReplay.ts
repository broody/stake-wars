import { DEFAULT_HERO } from './content';
import { ENEMY_GROUND_RADIUS } from '../utils/enemySwarm';
import { captureClip, ClipPlayer, CLIP_TICKS, type DeathClip } from './clip';
import {
  chooseOffer,
  closeSupply,
  createRun,
  rerollOffers,
  SIM_HZ,
  tick,
  type EarnedUpgrade,
  type MoveInput,
  type Run,
} from './sim';
import * as portable from './portableMath';

// Ranked games have the same camera-independent spawn bounds, hero and rules.
export const rankedRun = (seed: number) =>
  createRun(seed, ENEMY_GROUND_RADIUS, DEFAULT_HERO);
export const MAX_RANKED_TICKS = 60 * 60 * SIM_HZ;
export const actionMarker = 255;
export const rerollAction = 3;
export const supplyAction = 4;

export function applyAction(run: Run, action: number) {
  if (action === supplyAction && run.status === 'supply') closeSupply(run);
  else if (
    action === rerollAction &&
    run.status === 'choosing' &&
    run.rerolls > 0
  )
    rerollOffers(run);
  else if (
    action >= 0 &&
    action < 3 &&
    run.status === 'choosing' &&
    run.offers[action]
  )
    chooseOffer(run, action);
  else return false;
  return true;
}

export function move(run: Run, x: number, y: number) {
  tick(run, 1 / SIM_HZ, { x: (x - 127) / 127, y: (y - 127) / 127 });
}

// Two bytes per simulation step. 255 in the first byte marks a menu choice.
export class RankedReplay {
  private bytes: number[] = [];
  ticks = 0;

  advance(run: Run, input: MoveInput) {
    const length = Math.max(1, portable.hypot(input.x, input.y));
    const x = Math.round((input.x / length) * 127) + 127;
    const y = Math.round((input.y / length) * 127) + 127;
    this.bytes.push(x, y);
    this.ticks++;
    move(run, x, y);
  }

  choose(run: Run, action: number) {
    if (applyAction(run, action)) this.bytes.push(actionMarker, action);
  }

  data() {
    return Uint8Array.from(this.bytes);
  }
}

/** Movement steps in a replay, not counting menu choices. */
export function replayTicks(bytes: Uint8Array) {
  let ticks = 0;
  for (let i = 0; i < bytes.length; i += 2)
    if (bytes[i] !== actionMarker) ticks++;
  return ticks;
}

/**
 * Score a replay. With `clip`, also save the last moments before the fall
 * so others can watch them.
 */
export function scoreReplay(
  seed: number,
  bytes: Uint8Array,
  options: { clip?: boolean } = {}
) {
  const run = rankedRun(seed);
  const upgrades: EarnedUpgrade[] = [];
  run.upgradeHistory = upgrades;
  let ticks = 0;
  const clipFrom = options.clip
    ? Math.max(0, replayTicks(bytes) - CLIP_TICKS)
    : -1;
  let clipStart: { state: DeathClip['state']; index: number } | null = null;
  for (let i = 0; i < bytes.length; i += 2) {
    if (ticks === clipFrom && !clipStart) clipStart = startClip(run, i);
    const x = bytes[i],
      y = bytes[i + 1];
    if (y === undefined || ticks >= MAX_RANKED_TICKS)
      throw new Error('Invalid replay length');
    if (x === actionMarker) {
      if (!applyAction(run, y)) throw new Error('Invalid choice');
    } else {
      if (y === actionMarker || run.status !== 'playing')
        throw new Error('Invalid movement');
      move(run, x, y);
      ticks++;
    }
  }
  if (run.status !== 'fallen' && ticks !== MAX_RANKED_TICKS)
    throw new Error('Incomplete run');
  const clip: DeathClip | undefined =
    clipStart && run.status === 'fallen'
      ? {
          format: 1,
          tail: toBase64(bytes.subarray(clipStart.index)),
          end: { ticks: ticks - clipFrom, kills: run.kills },
          state: clipStart.state,
        }
      : undefined;
  return {
    destroyed: run.kills,
    durationSeconds: Math.floor(ticks / SIM_HZ),
    upgrades,
    clip: clip && endsLike(clip, run) ? clip : undefined,
  };
}

/** Whether a clip plays back to exactly the run's final state. */
function endsLike(clip: DeathClip, run: Run) {
  try {
    const player = new ClipPlayer(clip);
    while (player.step());
    return (
      JSON.stringify(captureClip(player.run)) ===
      JSON.stringify(captureClip(run))
    );
  } catch {
    return false;
  }
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** A clip is optional, so a state that cannot be saved never fails the score. */
function startClip(run: Run, index: number) {
  try {
    return { state: captureClip(run), index };
  } catch {
    return null;
  }
}
