/**
 * Head starts for balance runs. `natural` starts like a real run; the others
 * hand the bot the kit a practiced player has by mid or late game, so the
 * simulator can ask whether that kit ever stops losing health.
 */
import type { SystemId, WeaponId } from '../content';
import type { Offer } from '../sim';

export type BuildName = 'natural' | 'mid' | 'max';

function weapon(id: WeaponId, level: number): Offer[] {
  // The run starts with the Arc Blade at level 1.
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

export const BUILDS: Record<BuildName, Offer[]> = {
  natural: [],
  /** About minute 8 for a good player: two evolutions and some defense. */
  mid: [
    ...weapon('blade', 5),
    ...system('force', 3),
    evolve('blade'),
    ...weapon('strike', 5),
    ...system('amplifier', 2),
    evolve('strike'),
    ...weapon('pulse', 3),
    ...system('plating', 2),
    ...system('nanorepair', 2),
  ],
  /** Everything a run can own, maxed and evolved. */
  max: [
    ...(
      ['blade', 'bolts', 'shards', 'strike', 'charge', 'pulse'] as const
    ).flatMap((id) => weapon(id, 5)),
    ...(
      [
        'force',
        'overclock',
        'thrusters',
        'amplifier',
        'plating',
        'nanorepair',
      ] as const
    ).flatMap((id) => system(id, 5)),
    ...(['blade', 'bolts', 'shards', 'strike', 'charge', 'pulse'] as const).map(
      evolve
    ),
  ],
};
