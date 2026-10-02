import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { alignStart, CueGate, PickupStreak } from './audio';
import { SOUNDS, SOUND_IDS, soundFiles } from './sounds';

describe('cue gate', () => {
  it('keeps a sound apart by its minimum gap', () => {
    const gate = new CueGate();
    expect(gate.allow('hit', 0, 0.1)).toBe(true);
    expect(gate.allow('hit', SOUNDS.hit.gap / 2, 0.1)).toBe(false);
    expect(gate.allow('hit', SOUNDS.hit.gap * 1.01, 0.1)).toBe(true);
  });

  it('drops a cue past the voice limit until a voice ends', () => {
    const gate = new CueGate();
    const { voices, gap } = SOUNDS.death;
    for (let i = 0; i < voices; i++)
      expect(gate.allow('death', i * gap * 1.01, 10)).toBe(true);
    expect(gate.allow('death', voices * gap * 1.01, 10)).toBe(false);
    expect(gate.allow('death', 11, 10)).toBe(true);
  });

  it('limits each sound on its own', () => {
    const gate = new CueGate();
    expect(gate.allow('hit', 0, 0.1)).toBe(true);
    expect(gate.allow('death', 0, 0.1)).toBe(true);
  });

  it('caps a late-run flood of kills to a handful of voices', () => {
    const gate = new CueGate();
    let played = 0;
    // 3,000 kills in one second, each about a quarter-second long.
    for (let i = 0; i < 3000; i++)
      if (gate.allow('death', i / 3000, 0.25)) played++;
    expect(played).toBeLessThanOrEqual(Math.ceil(1 / SOUNDS.death.gap));
  });
});

describe('timed sounds', () => {
  it('starts early enough for the anchor to land after the output delay', () => {
    const { delay, offset } = alignStart(0.6, 0.2, 0.1);
    expect(delay).toBeCloseTo(0.3, 9);
    expect(offset).toBe(0);
  });

  it('skips into a sound that is already late, keeping the anchor on time', () => {
    // The anchor should be heard in 0.1 s, but it sits 0.25 s in and the
    // device adds 0.05 s: start now, 0.2 s in.
    const { delay, offset } = alignStart(0.1, 0.25, 0.05);
    expect(delay).toBe(0);
    expect(offset).toBeCloseTo(0.2, 9);
  });

  it('accounts for a faster playback reaching the anchor sooner', () => {
    const { delay } = alignStart(0.6, 0.3, 0, 1.5);
    expect(delay).toBeCloseTo(0.4, 9);
  });
});

describe('pickup streak', () => {
  it('climbs a semitone per quick pickup, up to an octave, then resets', () => {
    const streak = new PickupStreak();
    expect(streak.rate(0)).toBe(1);
    expect(streak.rate(0.1)).toBeCloseTo(Math.pow(2, 1 / 12), 9);
    let rate = 1;
    for (let i = 2; i < 30; i++) rate = streak.rate(i * 0.1);
    expect(rate).toBeCloseTo(2, 9);
    expect(streak.rate(10)).toBe(1);
  });
});

it('ships an Opus file and an MP3 fallback for every sound', () => {
  const folder = resolve(__dirname, '../../../public/audio/survivors');
  for (const id of SOUND_IDS)
    for (const name of soundFiles(id))
      for (const format of ['ogg', 'mp3']) {
        const file = resolve(folder, `${name}.${format}`);
        expect(existsSync(file), `${name}.${format}`).toBe(true);
        expect(statSync(file).size).toBeGreaterThan(500);
      }
  // Nothing stale is left behind, like a sound's single file after it gained takes.
  const expected = new Set(
    SOUND_IDS.flatMap(soundFiles).flatMap((name) => [
      `${name}.ogg`,
      `${name}.mp3`,
    ])
  );
  expect(readdirSync(folder).filter((file) => !expected.has(file))).toEqual([]);
});
