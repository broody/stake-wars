import { SIM_HZ, type Run } from './sim';
import { restoreRun, saveRun, type SavedState } from './snapshot';
import { actionMarker, applyAction, move } from './rankedReplay';

/**
 * A death clip holds a run's last moments: the full game state a little
 * before the fall and the inputs from there to the end. Playing the inputs
 * on the restored state reproduces those moments exactly, on the real Core.
 *
 * The API makes clips while it verifies a run, so a clip always shows a
 * verified run.
 */
export const CLIP_SECONDS = 5;
export const CLIP_TICKS = CLIP_SECONDS * SIM_HZ;

export interface DeathClip {
  format: 1;
  /** Replay bytes from the saved state to the fall, in base64. */
  tail: string;
  /**
   * How the clip ends. A game update can change the rules so the clip no
   * longer plays out the same way, and this catches that before it plays.
   */
  end: { ticks: number; kills: number };
  state: SavedState;
}

/**
 * Save the run's state for a clip. Verification-only data is left out. So
 * are queued sounds: the game plays and clears them every frame, but the
 * verifier never does, and a clip should not start with a burst of stale ones.
 */
export function captureClip(run: Run): SavedState {
  const rest: Run = { ...run, cues: [] };
  delete rest.upgradeHistory;
  return saveRun(rest);
}

function fromBase64(text: string) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Plays a clip one simulation step at a time. */
export class ClipPlayer {
  readonly run: Run;
  ticks = 0;
  private readonly bytes: Uint8Array;
  private index = 0;

  constructor(clip: DeathClip) {
    this.run = restoreRun(clip.state);
    this.bytes = fromBase64(clip.tail);
    if (this.bytes.length % 2) throw new Error('Invalid clip');
    this.applyChoices();
  }

  get done() {
    return this.index >= this.bytes.length;
  }

  /** One movement step. False at the end. */
  step() {
    if (this.done) return false;
    move(this.run, this.bytes[this.index], this.bytes[this.index + 1]);
    this.index += 2;
    this.ticks++;
    this.applyChoices();
    return true;
  }

  /**
   * The player's menu choices are applied as soon as their menu opens, so a
   * viewer never sees an upgrade or Supply Drop menu.
   */
  private applyChoices() {
    const { bytes, run } = this;
    while (this.index < bytes.length && bytes[this.index] === actionMarker) {
      if (!applyAction(run, bytes[this.index + 1]))
        throw new Error('Invalid clip choice');
      this.index += 2;
    }
  }
}

/**
 * Whether this build plays the clip out as recorded. A clip from an older
 * version of the game can fail to restore, or end differently.
 */
export function clipPlaysBack(clip: DeathClip) {
  try {
    const player = new ClipPlayer(clip);
    while (player.step());
    return (
      player.run.status === 'fallen' &&
      player.ticks === clip.end.ticks &&
      player.run.kills === clip.end.kills
    );
  } catch {
    return false;
  }
}

/** Clips are served as gzipped JSON. */
export async function readClip(compressed: ArrayBuffer): Promise<DeathClip> {
  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const clip = JSON.parse(await new Response(stream).text()) as DeathClip;
  if (clip?.format !== 1 || typeof clip.tail !== 'string' || !clip.end)
    throw new Error('Unknown clip format');
  return clip;
}
