/**
 * A ranked Core Survivors run played by the balance bot and recorded as the
 * same replay a browser sends.
 *
 * The bot always plays to survive and dies only when the Legion overwhelms
 * it, so the death replay shows a real defeat. To land in a score range, the
 * house bot tries a few play styles on a run's seed and keeps the first run
 * that ends in range. A seed with no fitting style is dropped for a new one.
 */
import {
  MAX_RANKED_TICKS,
  RankedReplay,
  rankedRun,
  scoreReplay,
  supplyAction,
} from '../rankedReplay';
import { seededRandom, SIM_HZ } from '../sim';
import {
  pickOffer,
  pilot,
  type OfferPolicy,
  type Stance,
} from '../balance/bot';

export interface Style {
  /** How it picks upgrades: `greedy` builds toward evolutions, `random` doesn't. */
  policy: OfferPolicy;
  /** How it moves: `engage` wades in while its Aegis holds, `kite` keeps away. */
  stance: Stance;
}

/** The styles the house bot plays, which also vary its builds on the board. */
export const STYLES: Style[] = [
  { policy: 'random', stance: 'engage' },
  { policy: 'random', stance: 'kite' },
  { policy: 'greedy', stance: 'engage' },
  { policy: 'greedy', stance: 'kite' },
];

export interface PlayedRun {
  replay: Uint8Array;
  destroyed: number;
  /** Movement steps, at `SIM_HZ` per second. */
  ticks: number;
  durationSeconds: number;
  style: Style;
}

/** More menu actions than this in a row means the bot is stuck. */
const MAX_MENU_STREAK = 64;

/**
 * Play one ranked run from `seed` until defeat. `dice` seeds only the bot's
 * own random upgrade picks, never the run.
 */
export function playRanked(seed: number, style: Style, dice = 0): PlayedRun {
  const run = rankedRun(seed);
  const replay = new RankedReplay();
  const random = seededRandom(dice ^ 0x2c1b3c6d);
  let menuStreak = 0;
  while (run.status !== 'fallen' && replay.ticks < MAX_RANKED_TICKS) {
    if (run.status === 'supply' || run.status === 'choosing') {
      if (++menuStreak > MAX_MENU_STREAK)
        throw new Error('The bot could not answer a Survivor menu');
      replay.choose(
        run,
        run.status === 'supply'
          ? supplyAction
          : pickOffer(run, style.policy, random)
      );
      continue;
    }
    menuStreak = 0;
    replay.advance(run, pilot(run, undefined, style.stance));
  }
  return {
    replay: replay.data(),
    destroyed: run.kills,
    ticks: replay.ticks,
    durationSeconds: Math.floor(replay.ticks / SIM_HZ),
    style,
  };
}

/**
 * Find a run from `seed` that ends in defeat with between `min` and `max`
 * destroyed. Styles are tried in the given order. Returns null when none
 * fits, and the caller takes a new seed.
 *
 * Every accepted replay is scored again by the verifier's own code, so a run
 * this returns is one the API will accept with the same score.
 */
export function planRun(
  seed: number,
  min: number,
  max: number,
  styles: Style[] = STYLES,
  dice = 0
): PlayedRun | null {
  for (const style of styles) {
    const played = playRanked(seed, style, dice);
    if (played.destroyed < min || played.destroyed > max) continue;
    const verified = scoreReplay(seed, played.replay);
    if (verified.destroyed !== played.destroyed)
      throw new Error(
        `The verifier scored ${verified.destroyed}, the bot counted ${played.destroyed}`
      );
    return played;
  }
  return null;
}
