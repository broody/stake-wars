#!/usr/bin/env node
/**
 * Core Survivors sound effects, synthesized from the recipes below.
 *
 *   pnpm --filter @stakewars/web sfx:survivors [id ...]
 *
 * Most sounds are synthesized from the recipes below; some come from
 * recorded WAVs in assets/sfx-source (see SAMPLES), cleaned up the same way.
 * Re-running reproduces the same files. Each id must match
 * src/game/survivors/sounds.ts, where volume, voice limits, pitch variation
 * and the number of takes are mixed; takes are written as `id-1`, `id-2`… Writes Opus (.ogg) and an MP3 fallback to
 * public/audio/survivors/; needs ffmpeg with libopus and libmp3lame.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 48000;
const TAU = Math.PI * 2;

// ---------- Synthesis toolkit ----------

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let v = Math.imul(state ^ (state >>> 15), state | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

/** Attack, then exponential decay with time constant `decay`. */
const perc = (attack, decay) => (t) =>
  t < attack ? t / attack : Math.exp(-(t - attack) / decay);
/** Exponential glide from f0 to f1 over `time` seconds, then hold. */
const glide = (f0, f1, time) => (t) =>
  f0 * Math.pow(f1 / f0, Math.min(1, t / time));
const constant = (value) => () => value;

/** One sample of a band-limited waveform at phase `p` (cycles). */
function wave(type, p, f) {
  switch (type) {
    case 'sine':
      return Math.sin(TAU * p);
    case 'triangle':
      return (2 / Math.PI) * Math.asin(Math.sin(TAU * p));
    case 'square':
      return Math.tanh(4 * Math.sin(TAU * p));
    case 'saw': {
      const harmonics = Math.max(1, Math.min(40, Math.floor(SR / 2 / f)));
      let sum = 0;
      for (let k = 1; k <= harmonics; k++) sum += Math.sin(TAU * k * p) / k;
      return sum * (2 / Math.PI);
    }
  }
  throw new Error(`unknown wave ${type}`);
}

/** Topology-preserving state-variable filter whose cutoff can move. */
function filter(type, cutoff, q = 0.707) {
  let ic1 = 0,
    ic2 = 0;
  const k = 1 / q;
  return (x, t) => {
    const fc = Math.min(SR * 0.45, Math.max(20, cutoff(t)));
    const g = Math.tan((Math.PI * fc) / SR);
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1,
      a3 = g * a2;
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    return type === 'lp' ? v2 : type === 'bp' ? v1 : x - k * v1 - v2;
  };
}

/**
 * Add one layer to `out`: an oscillator (`wave` with `freq`) or noise, shaped
 * by `amp`, optionally filtered, gated or driven. Times are local seconds.
 */
function layer(out, options) {
  const {
    at = 0,
    dur,
    wave: type = 'noise',
    freq = constant(440),
    amp,
    lp,
    hp,
    bp,
    q,
    gate,
    seed = 1,
  } = options;
  const random = seeded(seed);
  const chain = [];
  if (lp) chain.push(filter('lp', lp, q));
  if (hp) chain.push(filter('hp', hp, q));
  if (bp) chain.push(filter('bp', bp, q ?? 1));
  const start = Math.round(at * SR);
  const length = Math.round(dur * SR);
  let phase = 0;
  let open = 1;
  for (let i = 0; i < length && start + i < out.length; i++) {
    const t = i / SR;
    let x;
    if (type === 'noise') x = random() * 2 - 1;
    else {
      const f = freq(t);
      phase += f / SR;
      x = wave(type, phase, f);
    }
    for (const stage of chain) x = stage(x, t);
    // A crackle: the layer switches on and off at random, `gate` times a second.
    if (gate && i % Math.max(1, Math.round(SR / gate)) === 0)
      open = random() < 0.55 ? 1 : 0;
    out[start + i] += x * amp(t) * (gate ? open : 1);
  }
}

function drive(out, amount) {
  const norm = Math.tanh(amount);
  for (let i = 0; i < out.length; i++)
    out[i] = Math.tanh(out[i] * amount) / norm;
}

/** A small Schroeder room: four damped combs into two allpasses. */
function reverb(out, wet) {
  const scale = SR / 44100;
  const combs = [1116, 1188, 1277, 1356].map((d) => ({
    buffer: new Float32Array(Math.round(d * scale)),
    index: 0,
    store: 0,
  }));
  const passes = [556, 441].map((d) => ({
    buffer: new Float32Array(Math.round(d * scale)),
    index: 0,
  }));
  for (let i = 0; i < out.length; i++) {
    const x = out[i];
    let sum = 0;
    for (const comb of combs) {
      const y = comb.buffer[comb.index];
      comb.store = y * 0.8 + comb.store * 0.2;
      comb.buffer[comb.index] = x + comb.store * 0.78;
      comb.index = (comb.index + 1) % comb.buffer.length;
      sum += y;
    }
    let y = sum * 0.25;
    for (const pass of passes) {
      const stored = pass.buffer[pass.index];
      const input = y;
      y = -input + stored;
      pass.buffer[pass.index] = input + stored * 0.5;
      pass.index = (pass.index + 1) % pass.buffer.length;
    }
    out[i] = x + y * wet;
  }
}

/** Remove DC, fade the tail, and normalize the peak. */
function finish(out) {
  const dc = filter('hp', constant(25));
  for (let i = 0; i < out.length; i++) out[i] = dc(out[i], 0);
  const fade = Math.round(0.006 * SR);
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] *= 0.8 / peak;
  return out;
}

const sound = (seconds, build) => () => {
  const out = new Float32Array(Math.round(seconds * SR));
  build(out);
  return finish(out);
};

// ---------- Recipes ----------

const RECIPES = {
  'shard-hit': sound(0.14, (o) => {
    for (const [f, a] of [
      [2800, 0.5],
      [4210, 0.3],
      [5600, 0.15],
    ])
      layer(o, {
        dur: 0.13,
        wave: 'sine',
        freq: constant(f),
        amp: (t) => perc(0.001, 0.035)(t) * a,
      });
    layer(o, {
      dur: 0.01,
      hp: constant(6000),
      amp: (t) => perc(0.001, 0.004)(t) * 0.4,
    });
  }),
  strike: sound(1.1, (o) => {
    // A short fall from orbit, then the impact.
    layer(o, {
      dur: 0.08,
      wave: 'saw',
      freq: glide(3600, 900, 0.07),
      lp: constant(5000),
      amp: (t) => Math.min(1, t / 0.06) * 0.25,
    });
    layer(o, {
      at: 0.06,
      dur: 0.95,
      wave: 'sine',
      freq: glide(110, 36, 0.35),
      amp: perc(0.004, 0.28),
    });
    layer(o, {
      at: 0.06,
      dur: 0.8,
      lp: glide(5000, 220, 0.3),
      amp: (t) => perc(0.002, 0.22)(t) * 0.85,
      seed: 3,
    });
    layer(o, {
      at: 0.06,
      dur: 0.3,
      bp: constant(2500),
      q: 2,
      gate: 300,
      amp: (t) => perc(0.002, 0.09)(t) * 0.45,
      seed: 4,
    });
    drive(o, 1.6);
    reverb(o, 0.25);
  }),
  chain: sound(0.2, (o) => {
    layer(o, {
      dur: 0.18,
      bp: constant(3200),
      q: 4,
      gate: 420,
      amp: perc(0.001, 0.06),
    });
    layer(o, {
      dur: 0.15,
      wave: 'square',
      freq: glide(560, 470, 0.12),
      amp: (t) => perc(0.001, 0.05)(t) * 0.25,
    });
    drive(o, 2);
  }),
  lob: sound(0.3, (o) => {
    layer(o, {
      dur: 0.28,
      wave: 'sine',
      freq: glide(240, 115, 0.2),
      amp: (t) => perc(0.005, 0.08)(t) * 0.85,
    });
    layer(o, {
      dur: 0.2,
      lp: constant(1500),
      amp: (t) => perc(0.01, 0.07)(t) * 0.45,
    });
    layer(o, {
      dur: 0.08,
      wave: 'sine',
      freq: glide(600, 950, 0.05),
      amp: (t) => perc(0.002, 0.04)(t) * 0.15,
    });
  }),
  ignite: sound(0.7, (o) => {
    layer(o, {
      dur: 0.65,
      bp: glide(600, 2400, 0.4),
      q: 0.8,
      amp: (t) => perc(0.04, 0.18)(t) * 0.8,
    });
    layer(o, {
      dur: 0.6,
      hp: constant(3000),
      gate: 160,
      amp: (t) => perc(0.05, 0.2)(t) * 0.3,
      seed: 5,
    });
    layer(o, {
      dur: 0.25,
      wave: 'sine',
      freq: glide(95, 50, 0.15),
      amp: (t) => perc(0.003, 0.08)(t) * 0.7,
    });
  }),
  pulse: sound(0.45, (o) => {
    layer(o, {
      dur: 0.4,
      wave: 'sine',
      freq: (t) => 440 * (1 + 0.004 * Math.sin(TAU * 7 * t)),
      amp: perc(0.005, 0.09),
    });
    layer(o, {
      dur: 0.35,
      wave: 'sine',
      freq: constant(660),
      amp: (t) => perc(0.005, 0.07)(t) * 0.45,
    });
    reverb(o, 0.2);
  }),
  bastion: sound(0.6, (o) => {
    for (const [f, a] of [
      [330, 1],
      [495, 0.55],
      [990, 0.2],
    ])
      layer(o, {
        dur: 0.55,
        wave: 'sine',
        freq: constant(f),
        amp: (t) => perc(0.008, 0.13)(t) * a,
      });
    layer(o, {
      dur: 0.3,
      lp: constant(600),
      amp: (t) => perc(0.01, 0.1)(t) * 0.18,
    });
    reverb(o, 0.25);
  }),
  hit: sound(0.09, (o) => {
    layer(o, {
      dur: 0.06,
      bp: constant(1800),
      q: 1.5,
      amp: perc(0.001, 0.018),
    });
    layer(o, {
      dur: 0.08,
      wave: 'sine',
      freq: glide(260, 170, 0.05),
      amp: (t) => perc(0.001, 0.025)(t) * 0.7,
    });
  }),
  crit: sound(0.3, (o) => {
    layer(o, { dur: 0.06, bp: constant(2000), q: 1.5, amp: perc(0.001, 0.02) });
    for (const [f, a] of [
      [1560, 0.3],
      [2380, 0.22],
      [3170, 0.15],
    ])
      layer(o, {
        dur: 0.28,
        wave: 'sine',
        freq: constant(f),
        amp: (t) => perc(0.001, 0.08)(t) * a,
      });
    layer(o, {
      dur: 0.02,
      hp: constant(4000),
      amp: (t) => perc(0.001, 0.01)(t) * 0.35,
      seed: 6,
    });
  }),
  death: sound(0.24, (o) => {
    layer(o, {
      dur: 0.2,
      bp: glide(1400, 400, 0.12),
      q: 1.2,
      amp: perc(0.002, 0.05),
    });
    layer(o, {
      dur: 0.18,
      wave: 'sine',
      freq: glide(190, 80, 0.12),
      amp: (t) => perc(0.002, 0.05)(t) * 0.75,
    });
    layer(o, {
      dur: 0.12,
      bp: constant(900),
      q: 1,
      gate: 220,
      amp: (t) => perc(0.003, 0.04)(t) * 0.35,
      seed: 7,
    });
    drive(o, 1.8);
  }),
  'death-heavy': sound(1, (o) => {
    layer(o, {
      dur: 0.9,
      lp: glide(2500, 200, 0.5),
      amp: (t) => perc(0.005, 0.2)(t) * 0.9,
    });
    for (const [f, a] of [
      [210, 0.22],
      [337, 0.2],
      [512, 0.16],
      [803, 0.12],
    ])
      layer(o, {
        dur: 0.9,
        wave: 'sine',
        freq: constant(f),
        amp: (t) => perc(0.003, 0.25)(t) * a,
      });
    layer(o, {
      dur: 0.9,
      wave: 'sine',
      freq: glide(70, 34, 0.4),
      amp: (t) => perc(0.004, 0.3)(t) * 0.8,
    });
    drive(o, 1.5);
    reverb(o, 0.2);
  }),
  shard: sound(0.13, (o) => {
    layer(o, {
      dur: 0.12,
      wave: 'sine',
      freq: constant(1320),
      amp: perc(0.002, 0.035),
    });
    layer(o, {
      dur: 0.1,
      wave: 'sine',
      freq: constant(1980),
      amp: (t) => perc(0.002, 0.03)(t) * 0.4,
    });
    layer(o, {
      dur: 0.08,
      wave: 'triangle',
      freq: constant(2640),
      amp: (t) => perc(0.002, 0.02)(t) * 0.15,
    });
  }),
  hurt: sound(0.36, (o) => {
    layer(o, {
      dur: 0.32,
      wave: 'square',
      freq: glide(150, 70, 0.2),
      amp: (t) => perc(0.003, 0.09)(t) * 0.8,
    });
    layer(o, {
      dur: 0.2,
      lp: glide(3000, 800, 0.12),
      amp: (t) => perc(0.001, 0.06)(t) * 0.6,
    });
    layer(o, {
      dur: 0.3,
      wave: 'sine',
      freq: glide(80, 50, 0.2),
      amp: (t) => perc(0.002, 0.1)(t) * 0.5,
    });
    drive(o, 3);
  }),
  levelup: sound(1, (o) => {
    [784, 988, 1175, 1568].forEach((f, i) => {
      layer(o, {
        at: i * 0.07,
        dur: 0.6,
        wave: 'triangle',
        freq: constant(f),
        amp: (t) => perc(0.004, 0.18)(t) * 0.5,
      });
      layer(o, {
        at: i * 0.07,
        dur: 0.4,
        wave: 'sine',
        freq: constant(f * 2),
        amp: (t) => perc(0.004, 0.12)(t) * 0.15,
      });
    });
    reverb(o, 0.3);
  }),
  fallen: sound(2.2, (o) => {
    layer(o, {
      dur: 2,
      wave: 'saw',
      freq: glide(520, 35, 1.6),
      lp: glide(3000, 200, 1.6),
      amp: (t) => perc(0.01, 0.7)(t) * 0.8,
    });
    layer(o, {
      dur: 1.6,
      lp: glide(1200, 100, 1.2),
      amp: (t) => perc(0.02, 0.6)(t) * 0.4,
    });
    layer(o, {
      dur: 2,
      wave: 'sine',
      freq: glide(90, 30, 1.2),
      amp: (t) => perc(0.01, 0.8)(t) * 0.6,
    });
    reverb(o, 0.3);
  }),
};

// ---------- Output ----------

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) =>
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2)
  );
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Recorded sounds, by id. Each file becomes one take; the game picks a take
 * at random every time the sound plays; a single file is written as just
 * `id`. A list of files, or `{ files,
 * highpass }` to cut everything below `highpass` Hz first. A file can be
 * `{ file, from, seconds }` to use only that stretch of it, faded out.
 */
const SAMPLES = {
  // Eclipse's full-circle cut, generated with ElevenLabs sound effects:
  // "A powerful glowing energy saber spun in one full 360-degree circle
  // around the fighter: a deep resonant whoosh that swirls all the way around
  // and builds, ending in a heavy concussive energy shockwave that throws
  // enemies back. Sci-fi, punchy, no voices, no music." (1.4 s, influence 0.5)
  eclipse: [
    'assets/sfx-source/eclipse-1.wav',
    'assets/sfx-source/eclipse-2.wav',
  ],
  // The Bolt Caster shot, generated with ElevenLabs sound effects: "A single
  // sci-fi laser blaster pistol shot, the classic space-opera blaster: a sharp
  // bright metallic "pew" that zaps and drops quickly in pitch with a twangy
  // springy ring, punchy and loud, dry, one shot only, no voices, no music."
  // (0.5 s, influence 0.6). Its sub-bass thump is cut so the falling "pew"
  // carries the loudness.
  bolt: { highpass: 120, files: ['assets/sfx-source/bolt.wav'] },
  // Railstorm's rapid fire, generated the same way: "One single very short
  // shot from a sci-fi rapid-fire repeating laser blaster: a quick tight
  // high-pitched "pew" zap that drops fast in pitch, light and snappy, clean
  // metallic ring, very short, dry, one shot only, no voices, no music."
  // (0.5 s, influence 0.7). Cut to its first 0.16 s, short enough for twelve
  // shots a second.
  railstorm: {
    highpass: 150,
    files: [
      { file: 'assets/sfx-source/railstorm.wav', from: 0, seconds: 0.16 },
    ],
  },
  // Three lightsaber swings, the third an upward swing.
  blade: [
    'assets/sfx-source/blade-1.wav',
    'assets/sfx-source/blade-2.wav',
    'assets/sfx-source/blade-3.wav',
  ],
};

/** Mono 48 kHz samples from any file ffmpeg can read. */
function decode(file) {
  const raw = execFileSync(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      '-i',
      resolve(web, file),
      '-ac',
      '1',
      '-ar',
      String(SR),
      '-f',
      'f32le',
      '-',
    ],
    { maxBuffer: 1 << 28 }
  );
  return new Float32Array(
    raw.buffer,
    raw.byteOffset,
    raw.byteLength / 4
  ).slice();
}

/** A source file, or the stretch of it a `{ file, from, seconds }` names. */
function excerpt(source) {
  if (typeof source === 'string') return decode(source);
  const samples = decode(source.file);
  const start = Math.round(source.from * SR);
  const part = samples.slice(start, start + Math.round(source.seconds * SR));
  // Fade the cut over 25 ms so it ends without a click.
  const fade = Math.min(part.length, Math.round(0.025 * SR));
  for (let i = 0; i < fade; i++) part[part.length - 1 - i] *= i / fade;
  return part;
}

/** Cut everything below `hz` with a steep (four-pole) high-pass; none if unset. */
function cutBelow(samples, hz) {
  if (!hz) return samples;
  const stages = [filter('hp', constant(hz)), filter('hp', constant(hz))];
  return samples.map((v) => stages.reduce((x, stage) => stage(x, 0), v));
}

/**
 * Drop a quiet lead-in, keeping 20 ms before the sound first comes within
 * 24 dB of its peak, so a take starts with the swing it accompanies.
 */
function trimHead(samples) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < peak * 0.063)
    first++;
  return samples.slice(Math.max(0, first - Math.round(0.02 * SR)));
}

/** Drop the silent tail, keeping 30 ms after the last sound above −60 dBFS. */
function trimTail(samples) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const floor = peak * 0.001;
  let last = samples.length - 1;
  while (last > 0 && Math.abs(samples[last]) < floor) last--;
  return samples.slice(
    0,
    Math.min(samples.length, last + Math.round(0.03 * SR))
  );
}

/** Seconds into a sound where it is loudest, over 10 ms windows: its anchor. */
function loudest(samples) {
  const window = Math.round(0.01 * SR);
  let best = 0,
    at = 0;
  for (let start = 0; start + window <= samples.length; start += window) {
    let energy = 0;
    for (let i = start; i < start + window; i++) energy += samples[i] ** 2;
    if (energy > best) {
      best = energy;
      at = start;
    }
  }
  return at / SR;
}

const OUTPUTS = new Map();
for (const [id, recipe] of Object.entries(RECIPES))
  OUTPUTS.set(id, { id, render: recipe });
for (const [id, source] of Object.entries(SAMPLES)) {
  if (RECIPES[id]) throw new Error(`${id} is both synthesized and recorded`);
  const { files, highpass } = Array.isArray(source)
    ? { files: source }
    : source;
  files.forEach((file, take) =>
    OUTPUTS.set(files.length > 1 ? `${id}-${take + 1}` : id, {
      id,
      render: () =>
        finish(trimTail(trimHead(cutBelow(excerpt(file), highpass)))),
    })
  );
}

const outDir = resolve(web, 'public/audio/survivors');
mkdirSync(outDir, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), 'survivors-sfx-'));
// Name sounds (`blade`) or single takes (`blade-2`) to rebuild only those.
const wanted = process.argv.slice(2);
const names = [...OUTPUTS.keys()].filter(
  (name) =>
    !wanted.length ||
    wanted.includes(name) ||
    wanted.includes(OUTPUTS.get(name).id)
);
if (wanted.length && !names.length)
  throw new Error(`no sound named ${wanted.join(', ')}`);
try {
  for (const name of names) {
    const source = join(scratch, `${name}.wav`);
    const samples = OUTPUTS.get(name).render();
    writeFileSync(source, wav(samples));
    const encode = (file, args) =>
      execFileSync('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-i',
        source,
        ...args,
        join(outDir, file),
      ]);
    encode(`${name}.ogg`, ['-c:a', 'libopus', '-b:a', '64k', '-ac', '1']);
    encode(`${name}.mp3`, ['-c:a', 'libmp3lame', '-q:a', '4', '-ac', '1']);
    // Peaks are what sounds.ts `anchors` should hold for timed sounds.
    console.log(`${name} (peak ${loudest(samples).toFixed(3)}s)`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
