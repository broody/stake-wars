/**
 * Plays Core Survivors sounds through Web Audio. The sim queues cues on the
 * run; the scene hands them here each frame with a stereo position. Late runs
 * fire hundreds of cues a second, so `CueGate` keeps each sound within its
 * voice limit and minimum gap from `sounds.ts`.
 */
import {
  SOUNDS,
  SOUND_IDS,
  soundFiles,
  type SoundId,
  type SoundSpec,
} from './sounds';

/** Which cues may start now. Free of Web Audio so it can be tested. */
export class CueGate {
  private last = new Map<SoundId, number>();
  private endings = new Map<SoundId, number[]>();

  allow(id: SoundId, now: number, duration: number) {
    const spec = SOUNDS[id];
    if (now - (this.last.get(id) ?? -Infinity) < spec.gap) return false;
    const playing = (this.endings.get(id) ?? []).filter((end) => end > now);
    this.endings.set(id, playing);
    if (playing.length >= spec.voices) return false;
    playing.push(now + duration);
    this.last.set(id, now);
    return true;
  }
}

/**
 * When to start a sound so its `anchor` (seconds into it, at speed `rate`) is
 * heard `at` seconds from now, given the device's output `latency`. Too late
 * to start in time, it starts now but skips in, so the anchor still lands on
 * time and only the lead-up is lost.
 */
export function alignStart(
  at: number,
  anchor: number,
  latency: number,
  rate = 1
) {
  const delay = at - anchor / rate - latency;
  return delay >= 0
    ? { delay, offset: 0 }
    : { delay: 0, offset: -delay * rate };
}

/** Shard pickups climb a semitone each in a quick streak, up to an octave. */
export class PickupStreak {
  private count = 0;
  private lastAt = -Infinity;

  rate(now: number) {
    this.count = now - this.lastAt < 0.45 ? Math.min(12, this.count + 1) : 0;
    this.lastAt = now;
    return Math.pow(2, this.count / 12);
  }
}

export type VolumeLevel = 'off' | 'low' | 'medium' | 'high';

export const VOLUME_LEVELS: { value: VolumeLevel; label: string }[] = [
  { value: 'off', label: 'OFF' },
  { value: 'low', label: 'LOW' },
  { value: 'medium', label: 'MEDIUM' },
  { value: 'high', label: 'HIGH' },
];

const GAIN: Record<VolumeLevel, number> = {
  off: 0,
  low: 0.35,
  medium: 0.65,
  high: 1,
};
const STORAGE_KEY = 'stakewars.survivors.volume';
const isLevel = (value: unknown): value is VolumeLevel =>
  typeof value === 'string' && value in GAIN;

function storedLevel(): VolumeLevel {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLevel(value) ? value : 'medium';
  } catch {
    return 'medium';
  }
}

export class SurvivorAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Every take of each sound, in take order. */
  private buffers = new Map<SoundId, AudioBuffer[]>();
  private loading: Promise<void> | null = null;
  private gate = new CueGate();
  private streak = new PickupStreak();
  private listeners = new Set<() => void>();
  /** Sounds scheduled for later, with their start times, so they can be cut. */
  private pending = new Map<AudioBufferSourceNode, number>();
  private held = false;
  private level: VolumeLevel = storedLevel();
  /** The level to return to when unmuting. */
  private lastAudible: Exclude<VolumeLevel, 'off'> =
    this.level === 'off' ? 'medium' : this.level;

  /** Start audio on a user gesture; browsers refuse it before one. */
  unlock() {
    if (typeof AudioContext === 'undefined') return;
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.gain.value = GAIN[this.level];
      this.master.connect(this.context.destination);
    }
    if (!this.held && this.context.state === 'suspended')
      void this.context.resume();
    this.loading ??= this.load(this.context);
  }

  private async load(context: AudioContext) {
    const probe = typeof Audio === 'undefined' ? null : new Audio();
    const format = probe?.canPlayType('audio/ogg; codecs="opus"')
      ? 'ogg'
      : 'mp3';
    await Promise.all(
      SOUND_IDS.map(async (id) => {
        const takes = await Promise.all(
          soundFiles(id).map(async (file) => {
            try {
              const response = await fetch(
                `/audio/survivors/${file}.${format}`
              );
              return await context.decodeAudioData(
                await response.arrayBuffer()
              );
            } catch {
              // A take that fails to load is skipped; the run goes on.
              return null;
            }
          })
        );
        const loaded = takes.filter((take): take is AudioBuffer => !!take);
        if (loaded.length) this.buffers.set(id, loaded);
      })
    );
  }

  /**
   * `pan` is −1 (left) to 1 (right); `gain` scales the sound's own volume and
   * `rate` its playback speed. With `at`, the sound's anchor is lined up to be
   * heard that many seconds from now.
   */
  play(
    id: SoundId,
    {
      pan = 0,
      gain = 1,
      rate = 1,
      at = null,
    }: { pan?: number; gain?: number; rate?: number; at?: number | null } = {}
  ) {
    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state !== 'running') return;
    if (this.level === 'off') return;
    const takes = this.buffers.get(id);
    if (!takes) return;
    const take = Math.floor(Math.random() * takes.length);
    const buffer = takes[take];
    const now = context.currentTime;
    const spec: SoundSpec = SOUNDS[id];
    const speed =
      rate *
      (id === 'shard'
        ? this.streak.rate(now)
        : 1 + (Math.random() * 2 - 1) * spec.jitter);
    const { delay, offset } =
      at === null
        ? { delay: 0, offset: 0 }
        : alignStart(at, spec.anchors?.[take] ?? 0, this.latency(), speed);
    const when = now + delay;
    if (offset >= buffer.duration) return;
    if (!this.gate.allow(id, when, (buffer.duration - offset) / speed)) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = speed;
    const volume = context.createGain();
    volume.gain.value = spec.volume * gain;
    const stereo = context.createStereoPanner();
    stereo.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(volume).connect(stereo).connect(master);
    source.start(when, offset);
    if (delay > 0) {
      this.pending.set(source, when);
      source.onended = () => this.pending.delete(source);
    }
  }

  /** Seconds the device reports between playing a sound and hearing it. */
  private latency() {
    const context = this.context;
    if (!context) return 0;
    return context.outputLatency || context.baseLatency || 0;
  }

  /** The device's reported output delay in ms, once audio has started. */
  outputDelay() {
    return this.context ? Math.round(this.latency() * 1000) : null;
  }

  /** Drop sounds scheduled for later, when the run stops for a choice. */
  cancelPending() {
    const context = this.context;
    if (!context) return;
    for (const [source, when] of this.pending)
      if (when > context.currentTime) {
        source.stop();
        this.pending.delete(source);
      }
  }

  /**
   * Play one sound for review: once loaded, at its mixed volume, outside the
   * voice limits and the player's mute. `take` picks a recorded take by index;
   * without it, one is chosen at random as in a run.
   */
  async preview(id: SoundId, take?: number) {
    this.unlock();
    await this.loading;
    const context = this.context;
    const takes = this.buffers.get(id);
    if (!context || !takes) return;
    const buffer =
      takes[take ?? Math.floor(Math.random() * takes.length)] ?? takes[0];
    const source = context.createBufferSource();
    source.buffer = buffer;
    const volume = context.createGain();
    volume.gain.value = SOUNDS[id].volume;
    source.connect(volume).connect(context.destination);
    source.start();
  }

  /** Hold all sound while the run is paused, without losing the context. */
  hold(held: boolean) {
    if (held === this.held) return;
    this.held = held;
    const context = this.context;
    if (!context) return;
    if (held) void context.suspend();
    else void context.resume();
  }

  getLevel = () => this.level;

  setLevel(level: VolumeLevel) {
    this.level = level;
    if (level !== 'off') this.lastAudible = level;
    try {
      localStorage.setItem(STORAGE_KEY, level);
    } catch {
      // Private windows may refuse storage; the level still applies now.
    }
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(
        GAIN[level],
        this.context.currentTime,
        0.02
      );
    this.listeners.forEach((listener) => listener());
  }

  toggleMute() {
    this.setLevel(this.level === 'off' ? this.lastAudible : 'off');
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export const survivorAudio = new SurvivorAudio();
