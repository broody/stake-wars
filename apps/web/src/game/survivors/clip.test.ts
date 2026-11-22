import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { pilot } from './balance/bot';
import {
  CLIP_TICKS,
  ClipPlayer,
  captureClip,
  clipPlaysBack,
  readClip,
  type DeathClip,
} from './clip';
import {
  MAX_RANKED_TICKS,
  RankedReplay,
  rankedRun,
  rerollAction,
  scoreReplay,
  supplyAction,
} from './rankedReplay';
import type { Run } from './sim';
import { restoreRun } from './snapshot';

/**
 * Plays a ranked game with the balance bot until it falls. A long game with
 * varied upgrades fills the state with projectiles, timers and shared objects.
 */
function playToDeath(seed: number) {
  const run = rankedRun(seed);
  const replay = new RankedReplay();
  while (run.status !== 'fallen' && replay.ticks < MAX_RANKED_TICKS) {
    if (run.status === 'choosing') {
      if (run.rerolls > 0 && replay.ticks % 5 === 0)
        replay.choose(run, rerollAction);
      replay.choose(run, (replay.ticks * 7) % run.offers.length);
    } else if (run.status === 'supply') {
      replay.choose(run, supplyAction);
    } else {
      replay.advance(
        run,
        pilot(run, 1 - run.player.hp / run.player.maxHp, 'kite')
      );
    }
  }
  return { run, bytes: replay.data() };
}

// One game serves every test. It runs about six minutes of play.
const seed = 1;
let game: ReturnType<typeof playToDeath> | undefined;
const recorded = () => (game ??= playToDeath(seed));

const comparable = (run: Run) => JSON.stringify(captureClip(run));

describe('Survivor death clips', () => {
  it('replays the last moments to the same fall, state for state', () => {
    const { run, bytes } = recorded();
    expect(run.status).toBe('fallen');
    const { clip, destroyed } = scoreReplay(seed, bytes, { clip: true });
    expect(clip).toBeDefined();
    expect(destroyed).toBe(run.kills);
    expect(clip!.end).toEqual({ ticks: CLIP_TICKS, kills: run.kills });

    // The verifier never plays sounds, so a clip drops the ones it queued.
    expect(restoreRun(clip!.state).cues).toEqual([]);
    const player = new ClipPlayer(clip!);
    expect(player.run.status).not.toBe('fallen');
    while (player.step());
    expect(player.ticks).toBe(CLIP_TICKS);
    expect(comparable(player.run)).toBe(comparable(run));
    expect(clipPlaysBack(clip!)).toBe(true);

    const size = gzipSync(JSON.stringify(clip)).length;
    expect(size).toBeLessThan(64 * 1024);
  });

  it('refuses a clip that this build would play out differently', () => {
    const { bytes } = recorded();
    const { clip } = scoreReplay(seed, bytes, { clip: true });
    const changed: DeathClip = {
      ...clip!,
      end: { ...clip!.end, kills: clip!.end.kills + 1 },
    };
    expect(clipPlaysBack(changed)).toBe(false);
    expect(
      clipPlaysBack({ ...clip!, state: { ...clip!.state, shapes: [] } })
    ).toBe(false);
  });

  it('reads the gzipped clip the API serves', async () => {
    const { bytes } = recorded();
    const { clip } = scoreReplay(seed, bytes, { clip: true });
    const served = gzipSync(JSON.stringify(clip));
    const read = await readClip(
      served.buffer.slice(
        served.byteOffset,
        served.byteOffset + served.byteLength
      )
    );
    expect(read).toEqual(clip);
  });
});
