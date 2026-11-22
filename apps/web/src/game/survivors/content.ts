/**
 * Core Survivors content: the heroes, their weapons and systems, and the
 * Hollow Legion. Numbers come from the Last Ronin prototype, converted from
 * pixels to world units on the Core (about 0.016 units per pixel). Hero
 * classes follow docs/concepts/core-survivors/hero-classes.md.
 */

export type WeaponId =
  | 'blade'
  | 'bolts'
  | 'shards'
  | 'strike'
  | 'charge'
  | 'pulse'
  | 'crescent'
  | 'rebuke';
export type SystemId =
  | 'force'
  | 'overclock'
  | 'thrusters'
  | 'amplifier'
  | 'nanorepair'
  | 'tractor'
  | 'aegis';

export interface WeaponSpec {
  name: string;
  pair: SystemId;
  evolution: string;
  evolutionDetail: string;
  /** What each level adds, from level 1 to 5. */
  levels: [string, string, string, string, string];
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  blade: {
    name: 'Arc Blade',
    pair: 'force',
    evolution: 'Eclipse',
    evolutionDetail: 'A full-circle cut that throws the Legion back.',
    levels: [
      'Aims a 90° cut at a nearby enemy for 16 damage.',
      'The cut widens to 95° and deals 18 damage.',
      'A 100° cut reaches a little farther and deals 19 damage.',
      'A quicker 105° cut deals 21 damage.',
      'Sweeps 110° for 23 damage every 0.91 seconds.',
    ],
  },
  bolts: {
    name: 'Bolt Caster',
    pair: 'overclock',
    evolution: 'Railstorm',
    evolutionDetail: 'A ceaseless stream of bolts that pierce two enemies.',
    levels: [
      'Fires one bolt at the nearest enemy.',
      'Each bolt hits for 11 damage, up from 10.',
      'Every fifth volley fires a double tap in a short spray.',
      'Each bolt hits for 12. Every fourth volley is a double tap.',
      'Reloads faster and alternates double and triple taps between single shots.',
    ],
  },
  shards: {
    name: 'Orbit Shards',
    pair: 'thrusters',
    evolution: 'Shard Halo',
    evolutionDetail: 'Four shards on a wide, pulsing orbit.',
    levels: [
      'Two shards circle you.',
      'Each shard hits for 11 damage, up from 10.',
      'The shards circle a little faster and farther out.',
      'Each shard hits for 12 damage.',
      'The shards circle faster.',
    ],
  },
  strike: {
    name: 'Orbital Strike',
    pair: 'amplifier',
    evolution: 'Chain Barrage',
    evolutionDetail:
      'Strikes for 15 damage every 0.60 seconds. Up to four jumps deal half the initial damage. Repeat hits on an enemy deal half again.',
    levels: [
      'Strikes a random enemy for 17 damage every 1.35 seconds.',
      'Strikes every 1.20 seconds with 20% more radius than level 1.',
      'Strikes every 1.05 seconds for 18 damage with 44% more radius than level 1.',
      'Strikes every 0.90 seconds for 19 damage with 70% more radius than level 1.',
      'Strikes every 0.88 seconds for 20 damage with 80% more radius than level 1.',
    ],
  },
  charge: {
    name: 'Sector Charge',
    pair: 'tractor',
    evolution: 'Meltdown',
    evolutionDetail: 'Three charges that melt wide Sectors for longer.',
    levels: [
      'Lobs a charge that sets the ground burning.',
      'Throws a little sooner and burns a wider patch.',
      'Every fifth throw lobs a second charge.',
      'Wider burns deal 7 damage per hit. Every fourth throw lobs two charges.',
      'Burns linger a little longer. Every third throw lobs two charges.',
    ],
  },
  pulse: {
    name: 'Stake Pulse',
    pair: 'nanorepair',
    evolution: 'Bastion',
    evolutionDetail: 'A wide field that repairs you as it burns.',
    levels: [
      'Slows nearby enemies. Pulses for 5 damage every 0.9 seconds.',
      'Pulses every 0.8 seconds in a slightly wider field.',
      'Pulses for 6 damage in a wider field.',
      'Pulses every 0.75 seconds and reaches farther.',
      'Pulses for 7 damage and slows enemies a little more.',
    ],
  },
  crescent: {
    name: 'Crescent Wave',
    pair: 'amplifier',
    evolution: 'Meridian',
    evolutionDetail:
      'Every cut releases a wide crescent that crosses the whole view.',
    levels: [
      'A ready saber cut releases a crescent through enemies in its path.',
      'The wave recharges in 2.15 seconds, down from 2.4.',
      'Every fifth release fans out two crescents.',
      'Wider waves hit for 18 damage. Every fourth release fans out two.',
      'Waves reach farther. Every third release fans out two.',
    ],
  },
  rebuke: {
    name: 'Rebuke',
    pair: 'aegis',
    evolution: 'Rampart',
    evolutionDetail:
      'Erases hostile bolts. Timed bursts restore two Aegis segments.',
    levels: [
      'Taking a hit sends out a shockwave that throws enemies back.',
      'A slightly wider shockwave hits for 22 damage.',
      'Also bursts on its own every 12 seconds.',
      'Widens the burst. A timed burst restores one Aegis segment.',
      'Bursts for 24 damage and fires on its own every 10 seconds.',
    ],
  },
};

/** Weapons available to both the Vanguard and Sector Trooper. */
const SHARED_WEAPONS = [
  'bolts',
  'shards',
  'strike',
  'charge',
  'pulse',
] as const;
const CORE_SYSTEMS = [
  'force',
  'overclock',
  'thrusters',
  'amplifier',
  'nanorepair',
  'tractor',
] as const;

/**
 * `trooper` is the Sector Trooper as it played before the classes: the
 * balance baseline, and the default for runs that name no hero.
 */
export type HeroId = 'trooper' | 'vanguard';

/** The hero selected by the play page and the balance simulator. */
export const DEFAULT_HERO: HeroId = 'vanguard';

/** Radians per second for a Vanguard pivot, shared by the barrel and the feet. */
export const VANGUARD_TURN_RATE = 14;

export interface HeroSpec {
  name: string;
  detail: string;
  maxHp: number;
  /** Multiplies the base move speed. */
  speed: number;
  starter: WeaponId;
  /** Every weapon a run can offer this hero, the starter included. */
  weapons: readonly WeaponId[];
  /** Every system it can offer: the shared Core tech, plus any class branch. */
  systems: readonly SystemId[];
}

export const HEROES: Record<HeroId, HeroSpec> = {
  trooper: {
    name: 'Sector Trooper',
    detail: 'The Arc Blade, with the Bolt Caster and all Core tech on offer.',
    maxHp: 100,
    speed: 1,
    starter: 'blade',
    weapons: ['blade', ...SHARED_WEAPONS],
    systems: CORE_SYSTEMS,
  },
  vanguard: {
    name: 'Vanguard',
    detail:
      'Cuts with the Arc Blade, and can raise the Aegis shield to hold the line.',
    maxHp: 100,
    /** A Skitter's starting speed, so the opening swarm keeps pace. */
    speed: 0.77,
    starter: 'blade',
    weapons: ['blade', 'crescent', 'rebuke', ...SHARED_WEAPONS],
    systems: ['aegis', ...CORE_SYSTEMS],
  },
};

/** Whether a hero's run can raise the Aegis shield. */
export const carriesAegis = (hero: HeroId) =>
  HEROES[hero].systems.includes('aegis');

export interface SystemSpec {
  name: string;
  detail: string;
  /** A class branch says what each rank adds, 1 to 5; `detail` sums it up. */
  levels?: [string, string, string, string, string];
}

export const SYSTEMS: Record<SystemId, SystemSpec> = {
  force: { name: 'FORCE', detail: '+10% damage.' },
  overclock: { name: 'Overclock', detail: 'Weapons recharge 8% faster.' },
  thrusters: { name: 'Thrusters', detail: '+10% move speed.' },
  amplifier: { name: 'Amplifier', detail: '+10% weapon area.' },
  nanorepair: {
    name: 'Nanorepair',
    detail: '+20 max integrity and slow repair.',
  },
  tractor: { name: 'Tractor Beam', detail: '+30% pickup range.' },
  aegis: {
    name: 'Aegis',
    detail:
      'A shield gauge that takes hits before integrity and refills once you step clear.',
    levels: [
      'Immediately gain 2 full shield segments. Recharge begins 4 s after the last hit or 6 s after a break.',
      '+1 segment.',
      'Refills 1 s sooner, and recovers 1 s sooner after it breaks.',
      '+1 segment.',
      '+1 segment.',
    ],
  },
};

/** The weapons a system evolves for this hero; several can share one. */
export function pairedWeapons(system: SystemId, hero: HeroId): WeaponId[] {
  return HEROES[hero].weapons.filter((id) => WEAPONS[id].pair === system);
}

export type EnemyKind =
  | 'mite'
  | 'skitter'
  | 'volt'
  | 'lancer'
  | 'bulwark'
  | 'seeker'
  | 'captain'
  | 'warden';

/** Which renderer draws a kind: an authored model or a placeholder. */
export type EnemyModel = 'mite' | 'lancer' | 'bulwark' | 'seeker' | 'warden';
export type EnemyTint = 'none' | 'volt' | 'captain';

export interface EnemySpec {
  label: string;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  xp: number;
  model: EnemyModel;
  scale: number;
  tint: EnemyTint;
  mass: number;
  boss?: boolean;
  elite?: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemySpec> = {
  mite: {
    label: 'Mites',
    hp: 11,
    speed: 0.4,
    damage: 4,
    radius: 0.12,
    xp: 1,
    model: 'mite',
    scale: 0.35,
    tint: 'none',
    mass: 1,
  },
  skitter: {
    label: 'Skitters',
    hp: 6,
    speed: 0.77,
    damage: 3,
    radius: 0.09,
    xp: 1,
    model: 'mite',
    scale: 0.26,
    tint: 'none',
    mass: 1,
  },
  volt: {
    label: 'Volt Mites',
    hp: 16,
    speed: 0.53,
    damage: 4,
    radius: 0.11,
    xp: 2,
    model: 'mite',
    scale: 0.32,
    tint: 'volt',
    mass: 1,
  },
  lancer: {
    label: 'Lancers',
    hp: 13,
    speed: 0.37,
    damage: 4,
    radius: 0.12,
    xp: 2,
    model: 'lancer',
    scale: 0.3,
    tint: 'none',
    mass: 1,
  },
  bulwark: {
    label: 'Bulwarks',
    hp: 70,
    speed: 0.27,
    damage: 10,
    radius: 0.24,
    xp: 6,
    model: 'bulwark',
    // Walk bounds: 0.56 wide (including shield), 0.46 tall.
    scale: 0.25,
    tint: 'none',
    mass: 3,
  },
  seeker: {
    label: 'Seekers',
    hp: 28,
    speed: 0.6,
    damage: 10,
    radius: 0.15,
    xp: 3,
    model: 'seeker',
    scale: 0.125,
    tint: 'none',
    mass: 1,
  },
  captain: {
    label: 'A Lancer Captain',
    hp: 320,
    speed: 0.48,
    damage: 10,
    radius: 0.16,
    xp: 30,
    model: 'lancer',
    scale: 0.45,
    tint: 'captain',
    mass: 4,
    elite: true,
  },
  warden: {
    label: 'The Warden',
    hp: 1800,
    speed: 0.35,
    damage: 14,
    radius: 0.3,
    xp: 120,
    model: 'warden',
    scale: 0.3,
    tint: 'none',
    mass: 20,
    boss: true,
  },
};

/** Scripted pressure, in seconds; after the last entry the cycle repeats harder. */
export type EventId =
  | 'swarm'
  | 'line'
  | 'lines'
  | 'captain'
  | 'captains'
  | 'seekers'
  | 'seekerPacks'
  | 'encircle'
  | 'encircleHeavy'
  | 'warden';

export const SCRIPT: [number, EventId][] = [
  [40, 'swarm'],
  [80, 'line'],
  [110, 'captain'],
  [140, 'seekers'],
  [210, 'warden'],
  [245, 'encircle'],
  [280, 'lines'],
  [310, 'seekerPacks'],
  [340, 'captains'],
  [365, 'encircleHeavy'],
  [390, 'warden'],
];

const CYCLE: [number, EventId][] = [
  [20, 'lines'],
  [50, 'seekerPacks'],
  [80, 'encircleHeavy'],
  [105, 'captains'],
  [140, 'warden'],
];

export function scriptedEvent(index: number): [number, EventId] {
  if (index < SCRIPT.length) return SCRIPT[index];
  const j = index - SCRIPT.length;
  const cycle = Math.floor(j / CYCLE.length);
  const [offset, id] = CYCLE[j % CYCLE.length];
  return [390 + cycle * 150 + offset, id];
}

export const EVENT_BANNERS: Record<EventId, [string, string]> = {
  swarm: ['Skitter swarm', 'A pack is coming in fast from one side.'],
  line: ['Bulwark line advancing', 'Cut a gap before it reaches you.'],
  lines: ['Bulwark lines on two fronts', 'Cut a gap before they close.'],
  captain: ['A Lancer Captain approaches', 'Destroy it for a Supply Drop.'],
  captains: ['Two Captains approach', 'Each carries a Supply Drop.'],
  seekers: ['Seekers are aiming', 'Get out of the marked paths.'],
  seekerPacks: ['Seeker packs', 'Three packs are lining up.'],
  encircle: ['Surrounded', 'The ring is closing.'],
  encircleHeavy: ['Surrounded', 'Bulwarks in the ring.'],
  warden: [
    'The Warden',
    'Its staff slam strikes the marked area. Watch for rings of bolts.',
  ],
};
