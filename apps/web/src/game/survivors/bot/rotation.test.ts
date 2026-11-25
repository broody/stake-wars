import { describe, expect, it } from 'vitest';
import { botsPerRound, botsToPlay } from './rotation';

const bots = [1, 2, 3, 4, 5, 6].map((n) => ({
  address: '0x' + n.toString(16),
}));
const rules = { minBots: 1, maxBots: 6, min: 600, max: 1600 };
const names = (list: { bot: { address: string } }[]) =>
  list.map((t) => t.bot.address);

describe('botsToPlay', () => {
  it('plays every count from the minimum to the maximum', () => {
    const seen = new Set<number>();
    for (let round = 1; round <= 200; round++) {
      const count = botsPerRound(round, 1, 6);
      seen.add(count);
      expect(botsToPlay(bots, round, [], rules)).toHaveLength(count);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('picks the same bots on every firing in a round', () => {
    expect(botsToPlay(bots, 7, [], rules)).toEqual(
      botsToPlay([...bots].reverse(), 7, [], rules)
    );
  });

  it('counts bots already on the board, whatever their address spelling', () => {
    // A round with room for two bots on the board and one left out.
    let round = 1;
    while (![3, 4, 5].includes(botsPerRound(round, 1, 6))) round++;
    const count = botsPerRound(round, 1, 6);
    const lineup = botsToPlay(bots, round, [], rules);
    const first = lineup[0].bot;
    // A bot outside today's pick that already posted still uses a place.
    const outsider = bots.find((b) => !names(lineup).includes(b.address))!;
    const padded = '0x000' + outsider.address.slice(2);
    const left = botsToPlay(
      bots,
      round,
      [padded, first.address.toUpperCase().replace('0X', '0x')],
      rules
    );
    expect(left).toHaveLength(count - 2);
    expect(names(left)).not.toContain(first.address);
    expect(botsToPlay(bots, round, names(lineup), rules)).toEqual([]);
  });

  it('rotates: over many rounds every bot plays, and no bot plays every round', () => {
    const plays = new Map<string, number>();
    for (let round = 1; round <= 60; round++)
      for (const { bot } of botsToPlay(bots, round, [], rules))
        plays.set(bot.address, (plays.get(bot.address) ?? 0) + 1);
    for (const bot of bots) {
      expect(plays.get(bot.address)).toBeGreaterThan(15);
      expect(plays.get(bot.address)).toBeLessThan(60);
    }
  });
});

describe('score bands', () => {
  it('gives each bot in a round its own band inside the range, with gaps between', () => {
    for (let round = 1; round <= 200; round++) {
      const bands = botsToPlay(bots, round, [], rules).sort(
        (a, b) => a.min - b.min
      );
      for (const [i, band] of bands.entries()) {
        expect(band.min).toBeGreaterThanOrEqual(rules.min);
        expect(band.max).toBeLessThanOrEqual(rules.max);
        expect(band.max - band.min).toBeGreaterThan(120);
        if (i > 0) expect(band.min - bands[i - 1].max).toBeGreaterThan(30);
      }
    }
  });

  it('keeps each bot in the same band as the others post their scores', () => {
    for (let round = 1; round <= 50; round++) {
      const before = botsToPlay(bots, round, [], rules);
      const posted = names(before.slice(0, 2));
      expect(botsToPlay(bots, round, posted, rules)).toEqual(before.slice(2));
    }
  });

  it('moves the top band between wallets from round to round', () => {
    const tops = new Set<string>();
    for (let round = 1; round <= 30; round++) {
      const lineup = botsToPlay(bots, round, [], rules);
      tops.add(lineup.reduce((a, b) => (b.max > a.max ? b : a)).bot.address);
    }
    expect(tops.size).toBe(bots.length);
  });
});
