/**
 * Head starts for balance runs. `natural` starts like a real run; the others
 * hand the bot the kit a practiced player has by mid or late game, so the
 * simulator can ask whether that kit ever stops losing health.
 */
import type { HeroId, SystemId, WeaponId } from '../content';
import type { Offer } from '../sim';

export type BuildName = 'natural' | 'mid' | 'kit' | 'max';

function weapon(id: WeaponId, level: number): Offer[] {
  // Every hero so far starts with the Arc Blade at level 1.
  const first = id === 'blade' ? [] : [{ kind: 'weapon', id, isNew: true }];
  const ups = Array.from({ length: level - 1 }, () => ({
    kind: 'weapon' as const,
    id,
    isNew: false,
  }));
  return [...(first as Offer[]), ...ups];
}

function system(id: SystemId, level: number): Offer[] {
  return Array.from({ length: level }, (_, i) => ({
    kind: 'system' as const,
    id,
    isNew: i === 0,
  }));
}

const evolve = (id: WeaponId): Offer => ({ kind: 'evolution', id });

const TROOPER_WEAPONS = [
  'blade',
  'bolts',
  'shards',
  'strike',
  'charge',
  'pulse',
] as const;
/** The Vanguard benchmark fills six slots, leaving out Bolt Caster and Sector Charge. */
const VANGUARD_WEAPONS = [
  'blade',
  'crescent',
  'rebuke',
  'shards',
  'strike',
  'pulse',
] as const;

const maxed = (
  weapons: readonly WeaponId[],
  sixthSystem: 'tractor' | 'aegis'
): Offer[] => [
  ...weapons.flatMap((id) => weapon(id, 5)),
  ...(
    [
      'force',
      'overclock',
      'thrusters',
      'amplifier',
      'nanorepair',
      sixthSystem,
    ] as const
  ).flatMap((id) => system(id, 5)),
  ...weapons.map(evolve),
];

const SHARED_BUILDS = {
  natural: [] as Offer[],
  /** About minute 5 for a good player: two evolutions and some defense. */
  mid: [
    ...weapon('blade', 5),
    ...system('force', 3),
    evolve('blade'),
    ...weapon('strike', 5),
    ...system('amplifier', 2),
    evolve('strike'),
    ...weapon('pulse', 3),
    ...system('tractor', 2),
    ...system('nanorepair', 2),
  ],
};

/**
 * `mid` is the same kit for every hero, so it isolates what a hero's stats
 * and trait change; `kit` swaps in the hero's own weapons at the same size;
 * `max` is everything a run can own, maxed and evolved.
 */
export const BUILDS: Record<HeroId, Partial<Record<BuildName, Offer[]>>> = {
  trooper: { ...SHARED_BUILDS, max: maxed(TROOPER_WEAPONS, 'tractor') },
  vanguard: {
    natural: SHARED_BUILDS.natural,
    /** The shared kit plus the Aegis branch part-raised: three segments. */
    mid: [...SHARED_BUILDS.mid, ...system('aegis', 3)],
    kit: [
      ...weapon('blade', 5),
      ...system('force', 3),
      evolve('blade'),
      ...weapon('rebuke', 5),
      ...system('aegis', 5),
      evolve('rebuke'),
      ...weapon('crescent', 3),
      ...system('amplifier', 2),
      ...system('nanorepair', 2),
      ...system('tractor', 2),
    ],
    max: maxed(VANGUARD_WEAPONS, 'aegis'),
  },
};

export function buildFor(hero: HeroId, build: BuildName): Offer[] {
  const offers = BUILDS[hero][build];
  if (!offers) throw new Error(`No ${build} build for the ${hero}`);
  return offers;
}
