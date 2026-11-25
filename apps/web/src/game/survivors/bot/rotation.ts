/**
 * Which house bots play a given round, and the score each one aims for.
 *
 * Only a few bots play each round, and the set changes from round to round.
 * The score range is split into one band per bot, so the bots' scores spread
 * across the board instead of bunching together. Each choice depends only on
 * the round ID and the bot addresses, so every timer firing during a round
 * agrees on the same set and the same bands without any saved state.
 */

/** A small, stable 32-bit hash (FNV-1a) of a string. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const normal = (address: string) => '0x' + BigInt(address).toString(16);

/** Share of each band left empty on either side, so neighbours never touch. */
const BAND_MARGIN = 0.1;

export interface RoundRules {
  /** The fewest and most bots that play a round. */
  minBots: number;
  maxBots: number;
  /** The lowest and highest score any bot submits. */
  min: number;
  max: number;
}

export interface Turn<T> {
  bot: T;
  /** The score range this bot's run must end in. */
  min: number;
  max: number;
}

/** How many bots play this round, between `min` and `max`. */
export function botsPerRound(round: number, min: number, max: number) {
  return min + (hash(`count:${round}`) % (max - min + 1));
}

/** Sort bots by a per-round hash of their address. */
function shuffled<T extends { address: string }>(
  bots: T[],
  salt: string,
  round: number
) {
  return bots
    .map((bot) => ({
      bot,
      rank: hash(`${salt}:${round}:${normal(bot.address)}`),
    }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ bot }) => bot);
}

/**
 * The bots that should still play this round, in the order to play them, each
 * with its score band.
 *
 * Bots already on the board keep their places in the round's lineup, so a
 * round never has more than its count of bots. Each bot in the lineup gets its
 * own slice of `min` to `max`, shuffled per round so no wallet always scores
 * highest. A margin between slices keeps any two bots' scores apart.
 */
export function botsToPlay<T extends { address: string }>(
  bots: T[],
  round: number,
  posted: Iterable<string>,
  rules: RoundRules
): Turn<T>[] {
  const onBoard = new Set([...posted].map(normal));
  const played = (bot: T) => onBoard.has(normal(bot.address));
  const ranked = shuffled(bots, 'rank', round);
  const done = ranked.filter(played);
  const places =
    botsPerRound(round, rules.minBots, rules.maxBots) - done.length;
  if (places <= 0) return [];
  const waiting = ranked.filter((bot) => !played(bot)).slice(0, places);

  const lineup = shuffled([...done, ...waiting], 'band', round);
  const width = (rules.max - rules.min) / lineup.length;
  return waiting.map((bot) => {
    const low = rules.min + lineup.indexOf(bot) * width;
    return {
      bot,
      min: Math.ceil(low + width * BAND_MARGIN),
      max: Math.floor(low + width * (1 - BAND_MARGIN)),
    };
  });
}
