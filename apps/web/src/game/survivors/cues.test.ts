import { describe, expect, it } from 'vitest';
import {
  applyOffer,
  createRun,
  playerRight,
  SIM_HZ,
  spawnEnemy,
  tick,
  type Run,
} from './sim';
import { pointAt, vec3 } from './sphere';
import { SABER } from './saberAttack';
import { SOUNDS, SOUND_IDS, type SoundId } from './sounds';

const DT = 1 / SIM_HZ;
const RADIUS = 5.006;
const still = { x: 0, y: 0 };

function quietRun(seed = 21) {
  const run = createRun(seed, RADIUS);
  run.spawnCredit = -1e6;
  run.eventIndex = 1000;
  return run;
}

const heard = (run: Run) => new Set(run.cues.map((cue) => cue.id));

function play(run: Run, seconds: number, until?: SoundId) {
  for (let i = 0; i < seconds * SIM_HZ; i++) {
    if (run.status !== 'playing') run.status = 'playing';
    tick(run, DT, still);
    if (until && heard(run).has(until)) return;
  }
}

describe('sound cues', () => {
  it('swings, hits and kills with sound, placed where they happen', () => {
    const run = quietRun();
    const right = playerRight(vec3(), run.player);
    const mite = spawnEnemy(
      run,
      'mite',
      pointAt(vec3(), run.player.n, right, 0.45 / RADIUS)
    );
    mite.hp = 1;
    play(run, 3, 'death');
    const ids = heard(run);
    expect(ids).toContain('blade');
    expect(ids).toContain('death');
    const death = run.cues.find((cue) => cue.id === 'death')!;
    expect(death.n).not.toBeNull();
  });

  it('queues each saber cut ahead of the swing, timed to its visible sweep', () => {
    const run = quietRun();
    run.weapons[0].cooldown = 1;
    const cues: { time: number; at: number }[] = [];
    let swungAt: number | null = null;
    let duration = 0;
    for (let i = 0; i < 2 * SIM_HZ && swungAt === null; i++) {
      tick(run, DT, still);
      for (const cue of run.cues)
        if (cue.id === 'blade') cues.push({ time: run.time, at: cue.at! });
      run.cues.length = 0;
      if (run.player.saberAttack) {
        swungAt = run.player.saberAttack.startedAt;
        duration = run.player.saberAttack.duration;
      }
    }
    expect(swungAt).not.toBeNull();
    expect(cues).toHaveLength(1);
    const [early] = cues;
    // Queued about SWING_LEAD ahead, and nothing more when the swing starts.
    expect(swungAt! - early.time).toBeGreaterThan(0.3);
    expect(swungAt! - early.time).toBeLessThanOrEqual(0.35 + DT + 1e-9);
    // Its moment is the middle of the cut, measured from the swing's start.
    const sweep = (SABER.sweep / SABER.duration) * duration;
    expect(early.time + early.at).toBeCloseTo(swungAt! + sweep, 9);
  });

  it('times Eclipse to its full-circle burst at the impact', () => {
    const run = quietRun();
    run.weapons[0].evolved = true;
    run.weapons[0].cooldown = 1;
    let cue: { time: number; at: number } | null = null;
    for (let i = 0; i < 2 * SIM_HZ && !run.player.saberAttack; i++) {
      tick(run, DT, still);
      for (const c of run.cues)
        if (c.id === 'eclipse') cue = { time: run.time, at: c.at! };
      run.cues.length = 0;
    }
    const attack = run.player.saberAttack!;
    const impact = (SABER.impact / SABER.duration) * attack.duration;
    expect(cue).not.toBeNull();
    expect(cue!.time + cue!.at).toBeCloseTo(attack.startedAt + impact, 9);
  });

  it('queues both cuts of a double swing, one swing length apart', () => {
    const run = quietRun();
    run.weapons[0].level = 2;
    run.weapons[0].cooldown = 1;
    const ats: number[] = [];
    for (let i = 0; i < 2 * SIM_HZ && !run.player.saberAttack; i++) {
      tick(run, DT, still);
      for (const cue of run.cues) if (cue.id === 'blade') ats.push(cue.at!);
      run.cues.length = 0;
    }
    expect(ats).toHaveLength(2);
    expect(ats[1] - ats[0]).toBeCloseTo(run.player.saberAttack!.duration, 9);
  });

  it('marks a heavy kill apart from a small one', () => {
    const run = quietRun();
    const right = playerRight(vec3(), run.player);
    const bulwark = spawnEnemy(
      run,
      'bulwark',
      pointAt(vec3(), run.player.n, right, 0.6 / RADIUS)
    );
    bulwark.hp = 1;
    play(run, 3, 'death-heavy');
    expect(heard(run)).toContain('death-heavy');
  });

  it('sounds the Vanguard being hurt, and its fall', () => {
    const run = quietRun();
    run.weapons = [];
    spawnEnemy(run, 'mite', { ...run.player.n });
    play(run, 1, 'hurt');
    expect(heard(run)).toContain('hurt');
    run.cues.length = 0;
    run.player.hp = 1;
    run.player.invulnerable = 0;
    play(run, 2, 'fallen');
    expect(heard(run)).toContain('fallen');
  });

  it('chimes for shards and level-ups', () => {
    const run = quietRun();
    run.weapons = [];
    run.gems.push({
      n: { ...run.player.n },
      prev: { ...run.player.n },
      value: run.player.xpNext,
      pulled: false,
      speed: 0,
      dead: false,
    });
    play(run, 0.5, 'levelup');
    expect(heard(run)).toContain('shard');
    expect(heard(run)).toContain('levelup');
  });

  it('never lets a flood of hits crowd out being hurt', () => {
    const run = quietRun();
    applyOffer(run, { kind: 'weapon', id: 'shards', isNew: true });
    const right = playerRight(vec3(), run.player);
    // A dense crowd the saber and shards keep striking without killing.
    for (let i = 0; i < 200; i++)
      spawnEnemy(
        run,
        'mite',
        pointAt(vec3(), run.player.n, right, (0.3 + (i % 8) * 0.03) / RADIUS)
      ).hp = 1e9;
    const limit = SOUND_IDS.reduce((sum, id) => sum + SOUNDS[id].voices, 0);
    let longest = 0;
    let hurt = false;
    for (let i = 0; i < 2 * SIM_HZ && !hurt; i++) {
      if (run.status !== 'playing') run.status = 'playing';
      run.player.hp = run.player.maxHp;
      tick(run, DT, still);
      longest = Math.max(longest, run.cues.length);
      hurt = heard(run).has('hurt');
    }
    expect(hurt).toBe(true);
    expect(longest).toBeLessThanOrEqual(limit);
  });

  it('queues no more of a sound than it can play at once', () => {
    const run = quietRun();
    const right = playerRight(vec3(), run.player);
    for (let i = 0; i < 60; i++)
      spawnEnemy(
        run,
        'mite',
        pointAt(vec3(), run.player.n, right, (0.45 + (i % 4) * 0.01) / RADIUS)
      ).hp = 1;
    play(run, 2);
    const deaths = run.cues.filter((cue) => cue.id === 'death').length;
    expect(deaths).toBeLessThanOrEqual(5);
  });

  it('stays bounded when nothing plays the cues', () => {
    const run = createRun(5, RADIUS);
    for (let i = 0; i < 60 * SIM_HZ; i++) {
      if (run.status !== 'playing') run.status = 'playing';
      run.player.hp = run.player.maxHp;
      tick(run, DT, { x: Math.sin(i / 40), y: Math.cos(i / 50) });
    }
    expect(run.cues.length).toBeLessThanOrEqual(128);
  });
});
