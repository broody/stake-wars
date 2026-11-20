import { MAX_GEMS } from '../survivors/sim';
import { copy, pointAt, rotateAbout, vec3 } from '../survivors/sphere';
import { ENTRIES, type CatalogEntry } from './entries';

export const ITEM_ENTRIES = ENTRIES.filter(
  (entry) => entry.category === 'pickups'
);
/** Deterministic mixed field, drawn through the same pickup batches as a run. */
export const FULL_FIELD: CatalogEntry = {
  id: 'field',
  name: 'Full field',
  group: 'Pickups',
  category: 'pickups',
  layers: ['pickups'],
  detail: `${MAX_GEMS} XP shards with repair kits, Tractor Pulses, EMPs and both Supply Drops.`,
  framing: { distance: 3.85, height: 0.04 },
  setup(run) {
    const spot = (angle: number, distance: number) => {
      const direction = rotateAbout(
        copy(vec3(), run.player.forward),
        run.player.n,
        angle
      );
      return pointAt(
        vec3(),
        run.player.n,
        direction,
        distance / run.groundRadius
      );
    };
    for (let i = 0; i < MAX_GEMS; i++) {
      const angle = i * Math.PI * (3 - Math.sqrt(5));
      const n = spot(angle, 1.38 * Math.sqrt((i + 0.5) / MAX_GEMS));
      run.gems.push({
        n,
        prev: { ...n },
        value: i % 19 === 0 ? 12 : i % 5 === 0 ? 5 : 1,
        pulled: false,
        speed: 0,
        dead: false,
      });
    }
    const utilities = [
      'repair',
      'tractor',
      'emp',
      'repair',
      'tractor',
      'emp',
      'drop',
      'drop',
    ] as const;
    utilities.forEach((kind, i) => {
      const n = spot((i * 2 * Math.PI) / utilities.length, 0.76);
      run.items.push({
        kind,
        n,
        prev: { ...n },
        big: kind === 'drop' && i === utilities.length - 1,
        age: 2 + i * 0.4,
        dead: false,
      });
    });
  },
};
