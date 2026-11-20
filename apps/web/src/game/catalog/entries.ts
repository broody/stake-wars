/**
 * Every Core Survivors object, for the unlisted catalog page. Each entry sets
 * up a mock run holding just that object at the player's spot; the page
 * draws it with the game's own renderers, so the catalog always matches a
 * run. Add an object here; add a Layer only for a new kind of renderer.
 */
import { VOLT_LEAP, VOLT_END_TIME } from '../survivors/voltAttack';
import { SEEKER_ATTACK, SEEKER_GAIT } from '../survivors/seekerAttack';
import { ENEMIES } from '../survivors/content';
import {
  applyOffer,
  shardOrbitRadius,
  spawnEnemy,
  type EnemyKind,
  type ItemKind,
  type Run,
} from '../survivors/sim';
import { copy, rotateAbout, vec3 } from '../survivors/sphere';

/** A game renderer the stage mounts; see LAYERS in CatalogStage. */
export type Layer =
  | 'vanguard'
  | 'mite'
  | 'lancer'
  | 'bulwark'
  | 'seeker'
  | 'warden'
  | 'pickups'
  | 'bolts'
  | 'shards';

export type Category = 'characters' | 'pickups' | 'combat';

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'characters', label: 'CHARACTERS' },
  { id: 'pickups', label: 'PICKUPS' },
  { id: 'combat', label: 'COMBAT' },
];

export interface CatalogEntry {
  id: string;
  category: Category;
  /** Heading the entry sits under within its tab. */
  group: string;
  name: string;
  detail: string;
  layers: Layer[];
  /** Put the object on a fresh run, at the player's spot. */
  setup: (run: Run) => void;
  /** Keep it moving between frames, where the game would. */
  animate?: (run: Run, dt: number) => void;
  /** Camera distance and look-at height, in ground units. */
  framing?: { distance: number; height: number };
}

const SMALL = { distance: 0.7, height: 0.08 };

/** Turn every character on the run slowly, to show all sides. */
function turntable(run: Run, dt: number) {
  rotateAbout(run.player.heading, run.player.n, dt * 0.6);
  for (const enemy of run.enemies)
    rotateAbout(enemy.heading, enemy.n, dt * 0.6);
}

/** Turn bolts slowly in place so their length reads from every side. */
function turnBolts(run: Run, dt: number) {
  for (const shot of run.projectiles) rotateAbout(shot.dir, shot.n, dt * 0.8);
}

function enemy(
  kind: EnemyKind,
  detail: string,
  framing: { distance: number; height: number },
  name = ENEMIES[kind].label
): CatalogEntry {
  return {
    id: kind,
    category: 'characters',
    group: 'Hollow Legion',
    name,
    detail,
    layers: [ENEMIES[kind].model],
    setup: (run) => {
      const spawned = spawnEnemy(run, kind, copy(vec3(), run.player.n));
      const f = run.player.forward;
      // Face the camera, which looks along the player's forward.
      spawned.heading = vec3(-f.x, -f.y, -f.z);
    },
    animate: turntable,
    framing,
  };
}

/** Let the walk open into a lope before the Seeker commits to its charge. */
function seeker(): CatalogEntry {
  const entry = enemy(
    'seeker',
    `Walks, breaks into a lope, then folds its fins to charge. Locks on from ${SEEKER_ATTACK.trigger} units away.`,
    { distance: 0.8, height: 0.12 },
    'Seeker'
  );
  entry.animate = (run, dt) => {
    turntable(run, dt);
    const unit = run.enemies[0];
    copy(unit.aim, unit.heading);
    const approach = 5.4;
    let elapsed =
      run.time %
      (approach +
        SEEKER_ATTACK.windup +
        SEEKER_ATTACK.drive +
        SEEKER_ATTACK.recover);
    unit.mode = 'walk';
    unit.modeTime = 0;
    unit.seekerPace = 0;
    if (elapsed < approach) {
      const walk = SEEKER_GAIT.walkSpeed * unit.spec.scale;
      const acceleration = Math.min(1, Math.max(0, elapsed - 2.6));
      if (elapsed >= 0.6)
        unit.seekerPace = walk + (unit.speed - walk) * acceleration;
      return;
    }
    elapsed -= approach;
    for (const [mode, duration] of [
      ['aim', SEEKER_ATTACK.windup],
      ['charge', SEEKER_ATTACK.drive],
      ['recover', SEEKER_ATTACK.recover],
    ] as const) {
      if (elapsed < duration) {
        unit.mode = mode;
        unit.modeTime = duration - elapsed;
        return;
      }
      elapsed -= duration;
    }
  };
  return entry;
}

function voltMite(): CatalogEntry {
  const entry = enemy(
    'volt',
    'Carets fill its lunge path before it jumps. Dodge the landing and avoid contact.',
    { distance: 1.8, height: 0.2 },
    'Volt Mite'
  );
  entry.animate = (run, dt) => {
    turntable(run, dt);
    const unit = run.enemies[0];
    const elapsed = (run.time % (2 + VOLT_END_TIME)) - 2 + VOLT_LEAP.start;
    unit.leap =
      elapsed < VOLT_LEAP.start
        ? undefined
        : {
            origin: copy(vec3(), unit.n),
            direction: copy(vec3(), unit.heading),
            distance: VOLT_LEAP.maxDistance,
            impacted: false,
            elapsed,
            previousElapsed: elapsed,
          };
    unit.mode = unit.leap ? 'leap' : 'walk';
  };
  return entry;
}

const gem =
  (value: number) =>
  (run: Run): void => {
    run.gems.push({
      n: copy(vec3(), run.player.n),
      prev: copy(vec3(), run.player.n),
      value,
      pulled: false,
      speed: 0,
      dead: false,
    });
  };

const item =
  (kind: ItemKind, big = false) =>
  (run: Run): void => {
    run.items.push({
      kind,
      n: copy(vec3(), run.player.n),
      prev: copy(vec3(), run.player.n),
      big,
      age: 0,
      dead: false,
    });
  };

const bolt =
  (from: EnemyKind | null) =>
  (run: Run): void => {
    run.projectiles.push({
      n: copy(vec3(), run.player.n),
      prev: copy(vec3(), run.player.n),
      dir: copy(vec3(), run.player.forward),
      speed: 0,
      life: Infinity,
      damage: 0,
      pierce: 0,
      hit: new Set(),
      from,
    });
  };

const pickup = (
  id: string,
  group: string,
  name: string,
  detail: string,
  setup: (run: Run) => void,
  framing: NonNullable<CatalogEntry['framing']>
): CatalogEntry => ({
  id,
  category: 'pickups',
  group,
  name,
  detail,
  layers: ['pickups'],
  setup,
  framing,
});

export const ENTRIES: CatalogEntry[] = [
  {
    id: 'vanguard',
    category: 'characters',
    group: 'Vanguard',
    name: 'Vanguard',
    detail:
      'You. Fights with the Arc Blade and can raise the Aegis shield, plus whatever the run hands you.',
    layers: ['vanguard'],
    setup: () => undefined,
    animate: turntable,
    framing: { distance: 0.95, height: 0.2 },
  },
  enemy(
    'mite',
    'Swarms in and bites on contact.',
    { distance: 0.75, height: 0.1 },
    'Mite'
  ),
  enemy(
    'skitter',
    'Small and fast; comes in swarms from one side.',
    { distance: 0.6, height: 0.08 },
    'Skitter'
  ),
  voltMite(),
  enemy(
    'lancer',
    'Stops at range and fires down a marked line.',
    { distance: 1.2, height: 0.3 },
    'Lancer'
  ),
  enemy(
    'bulwark',
    'A shield wall. Charges and knocks you back.',
    { distance: 1.1, height: 0.25 },
    'Bulwark'
  ),
  seeker(),
  enemy(
    'captain',
    'Elite Lancer. Fires volleys and carries a Supply Drop.',
    { distance: 1.6, height: 0.45 },
    'Lancer Captain'
  ),
  enemy(
    'warden',
    'Boss. Staff slams, rings of bolts, and summoned Mites.',
    { distance: 2.4, height: 0.65 },
    'Warden'
  ),

  pickup('shard-1', 'Shards', 'Shard', 'Collect to gain 1 XP.', gem(1), {
    distance: 0.29,
    height: 0.088,
  }),
  pickup(
    'shard-2',
    'Shards',
    'Shard · 2–9 XP',
    'Tougher enemies, or shards merged when the field is full.',
    gem(5),
    { distance: 0.33, height: 0.092 }
  ),
  pickup(
    'shard-10',
    'Shards',
    'Shard · 10+ XP',
    'Bosses and heavily merged shards.',
    gem(12),
    { distance: 0.39, height: 0.095 }
  ),
  pickup(
    'repair',
    'Field gear',
    'Repair',
    'Restores 30 integrity. Drops from kills, at most every 30 s.',
    item('repair'),
    { distance: 0.45, height: 0.083 }
  ),
  pickup(
    'tractor',
    'Field gear',
    'Tractor Pulse',
    'Pulls every shard on the Core to you.',
    item('tractor'),
    { distance: 0.44, height: 0.083 }
  ),
  pickup(
    'emp',
    'Field gear',
    'EMP',
    'Damages every enemy on screen.',
    item('emp'),
    { distance: 0.44, height: 0.083 }
  ),
  pickup(
    'drop',
    'Supply Drops',
    'Supply Drop',
    'One upgrade. Carried by Lancer Captains.',
    item('drop'),
    { distance: 0.52, height: 0.145 }
  ),
  pickup(
    'drop-large',
    'Supply Drops',
    'Large Supply Drop',
    'Three upgrades. Carried by the Warden.',
    item('drop', true),
    { distance: 0.68, height: 0.2 }
  ),

  {
    id: 'bolt',
    category: 'combat',
    group: 'Projectiles',
    name: 'Bolt',
    detail: "The Bolt Caster's shot.",
    layers: ['bolts'],
    setup: bolt(null),
    animate: turnBolts,
    framing: SMALL,
  },
  {
    id: 'hostile-bolt',
    category: 'combat',
    group: 'Projectiles',
    name: 'Hostile Bolt',
    detail: 'Fired by Lancers, Captains and the Warden. Hurts on contact.',
    layers: ['bolts'],
    setup: bolt('lancer'),
    animate: turnBolts,
    framing: SMALL,
  },
  {
    id: 'orbit-shard',
    category: 'combat',
    group: 'Weapons',
    name: 'Orbit Shard',
    detail: 'The Orbit Shards weapon, circling the Vanguard.',
    layers: ['shards'],
    setup: (run) => {
      applyOffer(run, { kind: 'weapon', id: 'shards', isNew: true });
      const shards = run.weapons.find((w) => w.id === 'shards')!;
      shards.count = 2;
      shards.radius = shardOrbitRadius(
        shards.level,
        false,
        run.player.area,
        run.time
      );
    },
    animate: (run, dt) => {
      const shards = run.weapons.find((w) => w.id === 'shards')!;
      shards.prevAngle = shards.angle;
      shards.angle += dt * 1.6;
    },
    framing: { distance: 3.5, height: 0.1 },
  },
];
