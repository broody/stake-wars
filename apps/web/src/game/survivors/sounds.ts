/**
 * Every Core Survivors sound. The sim emits cues by id, the audio director
 * plays them, and `scripts/survivors-sfx.mjs` renders a file for each id into
 * `public/audio/survivors/`. Mixing lives here so it can be tuned in one place.
 */
export interface SoundSpec {
  name: string;
  /** What triggers it, for the catalog. */
  detail: string;
  /** Playback gain, 0–1, before the player's volume. */
  volume: number;
  /** Most copies that may sound at once; a new one past this is dropped. */
  voices: number;
  /** Seconds before the same sound may start again. */
  gap: number;
  /** Random playback-rate spread, ± this fraction, so repeats vary. */
  jitter: number;
  /** Recorded alternatives, one picked at random each time; files `id-n`. */
  takes?: number;
  /**
   * Seconds into each take (or the one file) where the moment it marks lands,
   * so a cue timed to an action can line it up. For the saber swings this is
   * each recording's loudest point; `pnpm sfx:survivors` prints them.
   */
  anchors?: readonly number[];
}

export const SOUNDS = {
  blade: {
    name: 'Arc Blade',
    detail: 'A saber swing, from one of three recorded swings at random.',
    volume: 0.45,
    voices: 2,
    gap: 0.06,
    jitter: 0.03,
    takes: 3,
    anchors: [0.2, 0.31, 0.24],
  },
  eclipse: {
    name: 'Eclipse',
    detail:
      'The evolved Arc Blade’s full-circle cut, from one of two generated takes at random.',
    volume: 0.5,
    voices: 2,
    gap: 0.2,
    jitter: 0.03,
    takes: 2,
    anchors: [0.5, 0.29],
  },
  bolt: {
    name: 'Bolt Caster',
    detail: 'A Bolt Caster volley: a blaster shot.',
    volume: 0.65,
    voices: 3,
    gap: 0.05,
    jitter: 0.05,
  },
  railstorm: {
    name: 'Railstorm',
    detail: 'The evolved Bolt Caster’s rapid fire: a short blaster shot.',
    volume: 0.4,
    voices: 4,
    gap: 0.07,
    jitter: 0.06,
  },
  'shard-hit': {
    name: 'Orbit Shard hit',
    detail: 'An Orbit Shard cutting an enemy.',
    volume: 0.3,
    voices: 4,
    gap: 0.05,
    jitter: 0.12,
  },
  strike: {
    name: 'Orbital Strike',
    detail: 'A strike from orbit landing.',
    volume: 0.75,
    voices: 3,
    gap: 0.08,
    jitter: 0.05,
  },
  chain: {
    name: 'Chain Barrage',
    detail: 'An evolved strike jumping to the next enemy.',
    volume: 0.45,
    voices: 3,
    gap: 0.06,
    jitter: 0.1,
  },
  lob: {
    name: 'Sector Charge throw',
    detail: 'A Sector Charge leaving the Vanguard.',
    volume: 0.4,
    voices: 3,
    gap: 0.08,
    jitter: 0.08,
  },
  ignite: {
    name: 'Sector Charge burn',
    detail: 'A Sector Charge landing and setting the ground alight.',
    volume: 0.5,
    voices: 3,
    gap: 0.1,
    jitter: 0.08,
  },
  pulse: {
    name: 'Stake Pulse',
    detail: 'The Stake Pulse field hitting enemies.',
    volume: 0.25,
    voices: 1,
    gap: 0.4,
    jitter: 0.03,
  },
  bastion: {
    name: 'Bastion',
    detail: 'The evolved Stake Pulse burning and repairing.',
    volume: 0.3,
    voices: 1,
    gap: 0.4,
    jitter: 0.03,
  },
  hit: {
    name: 'Hit',
    detail: 'A saber or bolt connecting.',
    volume: 0.3,
    voices: 4,
    gap: 0.035,
    jitter: 0.15,
  },
  crit: {
    name: 'Critical hit',
    detail: 'Any weapon landing a critical hit.',
    volume: 0.45,
    voices: 2,
    gap: 0.08,
    jitter: 0.08,
  },
  death: {
    name: 'Kill',
    detail: 'A Mite, Skitter, Volt Mite, Lancer or Seeker destroyed.',
    volume: 0.35,
    voices: 5,
    gap: 0.03,
    jitter: 0.15,
  },
  'death-heavy': {
    name: 'Heavy kill',
    detail: 'A Bulwark, Captain or the Warden destroyed.',
    volume: 0.7,
    voices: 2,
    gap: 0.12,
    jitter: 0.05,
  },
  shard: {
    name: 'Shard pickup',
    detail: 'Collecting a shard; rises in pitch through a streak.',
    volume: 0.28,
    voices: 3,
    gap: 0.03,
    jitter: 0,
  },
  hurt: {
    name: 'Hurt',
    detail: 'The Vanguard taking damage.',
    volume: 0.75,
    voices: 1,
    gap: 0.2,
    jitter: 0.05,
  },
  levelup: {
    name: 'Level up',
    detail: 'A level gained; the upgrade choice opens.',
    volume: 0.6,
    voices: 1,
    gap: 0.3,
    jitter: 0,
  },
  fallen: {
    name: 'Vanguard down',
    detail: 'The run ending.',
    volume: 0.85,
    voices: 1,
    gap: 1,
    jitter: 0,
  },
} as const satisfies Record<string, SoundSpec>;

export type SoundId = keyof typeof SOUNDS;
export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];

/** The file names (without extension) a sound plays from, one per take. */
export function soundFiles(id: SoundId): string[] {
  const takes = (SOUNDS[id] as SoundSpec).takes ?? 0;
  return takes
    ? Array.from({ length: takes }, (_, take) => `${id}-${take + 1}`)
    : [id];
}
