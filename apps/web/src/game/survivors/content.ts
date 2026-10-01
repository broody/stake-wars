/**
 * Core Survivors content: the Vanguard's weapons and systems, and the Hollow
 * Legion. Numbers come from the Last Ronin prototype, converted from pixels
 * to world units on the Core (about 0.016 units per pixel).
 */

export type WeaponId =
  | 'blade'
  | 'bolts'
  | 'shards'
  | 'strike'
  | 'charge'
  | 'pulse';
export type SystemId =
  | 'force'
  | 'overclock'
  | 'thrusters'
  | 'amplifier'
  | 'plating'
  | 'nanorepair'
  | 'tractor';

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
      'Aims a 90° slash at a nearby enemy.',
      'Also sweeps the other side.',
      '+30% damage and a wider 120° arc.',
      '+25% reach and a wider 150° arc.',
      '+30% damage and faster sweeps.',
    ],
  },
  bolts: {
    name: 'Bolt Caster',
    pair: 'overclock',
    evolution: 'Railstorm',
    evolutionDetail: 'A ceaseless stream of bolts that pierce three enemies.',
    levels: [
      'Fires a bolt at the nearest enemy.',
      '+1 bolt per volley.',
      '+40% damage. Pierces 1 enemy.',
      '+1 bolt per volley.',
      'Fires faster. Pierces 2 more.',
    ],
  },
  shards: {
    name: 'Orbit Shards',
    pair: 'thrusters',
    evolution: 'Shard Halo',
    evolutionDetail: 'Six shards on a wide, pulsing orbit.',
    levels: [
      'Two shards circle you.',
      '+1 shard.',
      '+30% damage and a wider orbit.',
      '+1 shard.',
      '+1 shard. Spins faster.',
    ],
  },
  strike: {
    name: 'Orbital Strike',
    pair: 'amplifier',
    evolution: 'Chain Barrage',
    evolutionDetail: 'Strikes that arc between up to five enemies.',
    levels: [
      'Calls a strike from orbit on a random enemy.',
      '+1 strike.',
      '+40% damage.',
      '+1 strike and a bigger blast.',
      'Strikes more often.',
    ],
  },
  charge: {
    name: 'Sector Charge',
    pair: 'plating',
    evolution: 'Meltdown',
    evolutionDetail: 'Three charges that melt wide Sectors for longer.',
    levels: [
      'Lobs a charge that sets the ground burning.',
      '+1 charge.',
      'Burns longer.',
      '+40% damage and wider burns.',
      '+1 charge.',
    ],
  },
  pulse: {
    name: 'Stake Pulse',
    pair: 'nanorepair',
    evolution: 'Bastion',
    evolutionDetail: 'A wide field that repairs you as it burns.',
    levels: [
      'A field that hurts and slows enemies near you.',
      '+20% radius.',
      '+40% damage.',
      '+20% radius.',
      '+40% damage and a stronger slow.',
    ],
  },
};

export interface SystemSpec {
  name: string;
  detail: string;
}

export const SYSTEMS: Record<SystemId, SystemSpec> = {
  force: { name: 'FORCE', detail: '+10% damage.' },
  overclock: { name: 'Overclock', detail: 'Weapons recharge 8% faster.' },
  thrusters: { name: 'Thrusters', detail: '+10% move speed.' },
  amplifier: { name: 'Amplifier', detail: '+10% weapon area.' },
  plating: { name: 'Plating', detail: 'Blocks 1 damage from every hit.' },
  nanorepair: {
    name: 'Nanorepair',
    detail: '+20 max integrity and slow repair.',
  },
  tractor: { name: 'Tractor Beam', detail: '+30% pickup range.' },
};

export const PAIRED_WEAPON = Object.fromEntries(
  (Object.keys(WEAPONS) as WeaponId[]).map((id) => [WEAPONS[id].pair, id])
) as Partial<Record<SystemId, WeaponId>>;

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
    damage: 0,
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
    scale: 1,
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
