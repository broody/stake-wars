/**
 * Every action the Vanguard takes as the player, each one a short scripted
 * run of the game's own simulation, for the unlisted action dashboard at
 * /play/actions. Swings, effects and timing come from `sim.ts` exactly as in
 * a run; a script only places targets, holds the joystick and schedules the
 * moment something happens. Add an action to ACTIONS and the dashboard shows
 * it.
 */
import { HEROES, WEAPONS } from '../survivors/content';
import { SABER } from '../survivors/saberAttack';
import {
  applyOffer,
  hurtPlayer,
  march,
  offsetPoint,
  orbitalStrikeRank,
  shardOrbitRadius,
  SIM_HZ,
  spawnEnemy,
  stakePulseRadius,
  type Enemy,
  type MoveInput,
  type Run,
  type Weapon,
} from '../survivors/sim';
import {
  angleBetween,
  copy,
  cross,
  dot,
  normalize,
  pointAt,
  rotateAbout,
  set,
  vec3,
  type Vec3,
} from '../survivors/sphere';
import { VANGUARD } from '../utils/vanguardAnimation';

export type Stance = 'stand' | 'walk' | 'run';
/** Where a target stands, relative to the Vanguard's facing. */
export type Bearing = 'left' | 'right' | 'ahead' | 'behind';
export type BladeLevel = 1 | 2 | 3 | 4 | 'eclipse';

/** The knobs of every action built on an Arc Blade swing. */
export interface SwingOptions {
  stance: Stance;
  bearing: Bearing;
  blade: BladeLevel;
}

export type ActionKind =
  | 'idle'
  | 'walk'
  | 'reversal'
  | 'run'
  | 'swing'
  | 'crescent'
  | 'rebuke'
  | 'aegis'
  | 'bolt-caster'
  | 'railstorm'
  | 'shards'
  | 'shard-halo'
  | 'pulse'
  | 'bastion'
  | 'charge'
  | 'meltdown'
  | 'orbital-strike'
  | 'chain-barrage'
  | 'moving-loadout'
  | 'hurt'
  | 'defeated';

export interface ActionSpec {
  id: string;
  /** Heading the action sits under on the dashboard. */
  group: string;
  name: string;
  detail: string;
  kind: ActionKind;
  /** Starting knobs for actions built on a swing; the inspector changes them. */
  swing?: SwingOptions;
  /** Weapon rank shown in the Orbital Strike inspector. */
  strikeLevel?: number;
  /** Camera distance (world units) and elevation (degrees) that fit it. */
  framing: { distance: number; pitch: number };
}

/** How a scripted run plays one action. */
export interface ActionScript {
  /** Run seconds before the loop opens, so gaits and blends settle. */
  preroll: number;
  /** Seconds the loop shows. */
  loop: number;
  /** Joystick position, fixed or sampled just before each simulation tick. */
  input: MoveInput | ((run: Run) => MoveInput);
  /** Shape the fresh run: arm weapons, place targets, schedule events. */
  setup: (run: Run) => void;
  /** Runs after every tick. */
  after?: (run: Run) => void;
}

/** Every scripted run uses this seed, so it plays the same each time. */
export const ACTION_SEED = 7;
const STEP = 1 / SIM_HZ;
const PREROLL = 0.6;
/** Loop seconds before a scripted swing or event starts. */
export const ACTION_LEAD = 0.3;
/** Ground distance of a target from the Vanguard, inside the blade's reach. */
const TARGET_DISTANCE = 0.6;
/** Joystick push that moves at the Walk clip's authored speed. */
export const WALK_INPUT =
  (VANGUARD.walkSpeed * VANGUARD.scale) / HEROES.vanguard.speed;

const CLOSE = { distance: 1.25, pitch: 12 };
const WIDE = { distance: 2.1, pitch: 30 };

const swing = (
  stance: Stance,
  bearing: Bearing,
  blade: BladeLevel = 1
): SwingOptions => ({ stance, bearing, blade });

export const ACTIONS: ActionSpec[] = [
  {
    id: 'idle',
    group: 'Locomotion',
    name: 'Idle',
    detail: 'Standing still. The Idle clip loops over the whole body.',
    kind: 'idle',
    framing: CLOSE,
  },
  {
    id: 'walk',
    group: 'Locomotion',
    name: 'Walk',
    detail:
      'A light joystick push, at the Walk clip’s authored 0.81 m/s. Keys always run.',
    kind: 'walk',
    framing: CLOSE,
  },
  {
    id: 'run',
    group: 'Locomotion',
    name: 'Run',
    detail:
      'Full speed. The stride follows the ground covered, so the feet stay planted.',
    kind: 'run',
    framing: CLOSE,
  },
  {
    id: 'reversal',
    group: 'Locomotion',
    name: 'Running reversal',
    detail:
      'The player reverses direction at full speed. The support boot catches the turn.',
    kind: 'reversal',
    framing: CLOSE,
  },
  {
    id: 'forehand',
    group: 'Arc Blade',
    name: 'Forehand',
    detail:
      'Standing, target on the left. The Attack clip plays on the upper body.',
    kind: 'swing',
    swing: swing('stand', 'left'),
    framing: CLOSE,
  },
  {
    id: 'backhand',
    group: 'Arc Blade',
    name: 'Backhand',
    detail:
      'Standing, target on the right. The right boot steps out and takes the weight of the cut.',
    kind: 'swing',
    swing: swing('stand', 'right'),
    framing: CLOSE,
  },
  {
    id: 'run-forehand',
    group: 'Arc Blade',
    name: 'Running forehand',
    detail: 'RunAttack’s upper body over the uninterrupted Run legs.',
    kind: 'swing',
    swing: swing('run', 'left'),
    framing: CLOSE,
  },
  {
    id: 'run-backhand',
    group: 'Arc Blade',
    name: 'Running backhand',
    detail: 'RunAttackBackhand’s upper body over the Run legs.',
    kind: 'swing',
    swing: swing('run', 'right'),
    framing: CLOSE,
  },
  {
    id: 'cut-behind',
    group: 'Arc Blade',
    name: 'Cut behind',
    detail:
      'The outside boot opens toward the target behind. The hips lead the backhand.',
    kind: 'swing',
    swing: swing('stand', 'behind'),
    framing: CLOSE,
  },
  {
    id: 'eclipse',
    group: 'Arc Blade',
    name: 'Eclipse',
    detail: 'The evolved blade: a full-circle cut on the same swing clips.',
    kind: 'swing',
    swing: swing('stand', 'right', 'eclipse'),
    framing: WIDE,
  },
  {
    id: 'crescent',
    group: 'Vanguard kit',
    name: 'Crescent Wave',
    detail: 'A ready cut also throws a crescent toward the cut’s side.',
    kind: 'crescent',
    swing: swing('stand', 'right'),
    framing: WIDE,
  },
  {
    id: 'rebuke',
    group: 'Vanguard kit',
    name: 'Rebuke',
    detail:
      'The Vanguard braces behind the left gauntlet, then drives an open palm outward as the shockwave throws back nearby enemies.',
    kind: 'rebuke',
    framing: WIDE,
  },
  {
    id: 'aegis',
    group: 'Vanguard kit',
    name: 'Aegis',
    detail:
      'Six plates float and tilt around the Vanguard. The field absorbs strikes from either side and shatters on the third hit.',
    kind: 'aegis',
    framing: { distance: 1.56, pitch: 18 },
  },
  {
    id: 'bolt-caster',
    group: 'Core weapons',
    name: WEAPONS.bolts.name,
    detail:
      'The rank-five caster opens with a double tap, turns toward the rear target, then sweeps a triple tap.',
    kind: 'bolt-caster',
    framing: WIDE,
  },
  {
    id: 'railstorm',
    group: 'Core weapons',
    name: WEAPONS.bolts.evolution,
    detail: 'The Vanguard keeps firing as he pivots from one Mite to the next.',
    kind: 'railstorm',
    framing: WIDE,
  },
  {
    id: 'shards',
    group: 'Core weapons',
    name: WEAPONS.shards.name,
    detail:
      'Two ivory-edged blades circle the Vanguard. Sparks mark where an edge clips a target.',
    kind: 'shards',
    framing: { distance: 4.1, pitch: 39 },
  },
  {
    id: 'shard-halo',
    group: 'Core weapons',
    name: WEAPONS.shards.evolution,
    detail:
      'Four gold-trimmed blades sweep out and draw back in, cutting targets at different distances.',
    kind: 'shard-halo',
    framing: { distance: 6.9, pitch: 48 },
  },
  {
    id: 'charge',
    group: 'Core weapons',
    name: 'Sector Charge',
    detail:
      'The Vanguard lobs a charge underhand. Its casing bursts on landing and leaves a patch of burning ground.',
    kind: 'charge',
    framing: { distance: 3.25, pitch: 25 },
  },
  {
    id: 'meltdown',
    group: 'Core weapons',
    name: 'Meltdown',
    detail:
      'The evolved throw fans out three charges. Each leaves a wider burn that lasts 3.2 seconds.',
    kind: 'meltdown',
    framing: { distance: 4.15, pitch: 36 },
  },
  {
    id: 'pulse',
    group: 'Core weapons',
    name: 'Stake Pulse',
    detail:
      'Yellow stakes slow enemies on contact. At rank one each pulse deals 5 damage every 0.9 seconds.',
    kind: 'pulse',
    framing: { distance: 3.8, pitch: 41 },
  },
  {
    id: 'bastion',
    group: 'Core weapons',
    name: 'Bastion',
    detail:
      'The evolved field burns a wider area. Red motes return to the Vanguard as the field restores integrity.',
    kind: 'bastion',
    framing: { distance: 6.7, pitch: 50 },
  },
  {
    id: 'orbital-strike',
    group: 'Core weapons',
    name: WEAPONS.strike.name,
    detail:
      'Each level brings the strikes closer together and widens the blast.',
    kind: 'orbital-strike',
    framing: { distance: 3.1, pitch: 30 },
  },
  {
    id: 'chain-barrage',
    group: 'Core weapons',
    name: WEAPONS.strike.evolution,
    detail: WEAPONS.strike.evolutionDetail,
    kind: 'chain-barrage',
    framing: { distance: 4.8, pitch: 47 },
  },
  {
    id: 'moving-loadout',
    group: 'Loadouts',
    name: 'Moving loadout',
    detail:
      'The Vanguard runs a figure eight through crossing Mites with Aegis, Stake Pulse and Orbit Shards equipped.',
    kind: 'moving-loadout',
    framing: { distance: 5.95, pitch: 55 },
  },
  {
    id: 'hurt',
    group: 'Reactions',
    name: 'Hurt',
    detail:
      'Two hits from opposite sides turn the shoulders away while the running stride continues.',
    kind: 'hurt',
    framing: CLOSE,
  },
  {
    id: 'defeated',
    group: 'Reactions',
    name: 'Defeated',
    detail: 'Integrity runs out. The Defeated clip plays once and holds.',
    kind: 'defeated',
    framing: CLOSE,
  },
];

export const actionById = (id: string | null) =>
  ACTIONS.find((action) => action.id === id);

const bladeOf = (run: Run): Weapon =>
  run.weapons.find((weapon) => weapon.id === 'blade')!;

/** A run with nothing in it but the Vanguard, which cannot fall by accident. */
function quiet(run: Run) {
  run.spawnCredit = -1e6;
  run.eventIndex = 1000;
  run.player.hp = run.player.maxHp = 1e4;
  bladeOf(run).cooldown = 1e9;
}

/**
 * How far right of dead ahead or behind those targets stand. Straight ahead
 * or behind, rounding would pick the cut's side; this picks the backhand.
 */
const LEAN = (5 * Math.PI) / 180;

/** The direction of `bearing` from the Vanguard's facing, on the ground. */
export function bearingDirection(out: Vec3, run: Run, bearing: Bearing) {
  const { n, heading } = run.player;
  const right = cross(vec3(), heading, n);
  const lean = (forward: number) =>
    normalize(
      set(
        out,
        heading.x * forward * Math.cos(LEAN) + right.x * Math.sin(LEAN),
        heading.y * forward * Math.cos(LEAN) + right.y * Math.sin(LEAN),
        heading.z * forward * Math.cos(LEAN) + right.z * Math.sin(LEAN)
      )
    );
  switch (bearing) {
    case 'right':
      return copy(out, right);
    case 'left':
      return set(out, -right.x, -right.y, -right.z);
    case 'ahead':
      return lean(1);
    case 'behind':
      return lean(-1);
  }
}

/** A Mite that takes hits forever and never moves or attacks. */
function standIn(run: Run, direction: Vec3, distance: number): Enemy {
  const enemy = spawnEnemy(
    run,
    'mite',
    pointAt(vec3(), run.player.n, direction, distance / run.groundRadius)
  );
  enemy.hp = enemy.maxHp = 1e9;
  enemy.speed = 0;
  enemy.cooldown = 1e9;
  return enemy;
}

/**
 * Carry `enemy` through the turn that took the player from its previous
 * position to this one, so it keeps its place beside a moving Vanguard.
 */
function carry(run: Run, enemy: Enemy) {
  const { prev, n } = run.player;
  const angle = angleBetween(prev, n);
  if (angle < 1e-9) return;
  const axis = normalize(cross(vec3(), prev, n));
  rotateAbout(enemy.n, axis, angle);
  rotateAbout(enemy.heading, axis, angle);
  normalize(enemy.n);
}

const STANCE_INPUT: Record<Stance, number> = {
  stand: 0,
  walk: WALK_INPUT,
  run: 1,
};

/** Seconds for two strides at the authored stride and the run's speed. */
const strides = (stride: number, input: number) =>
  (2 * stride * VANGUARD.scale) / (input * HEROES.vanguard.speed);

/** A swing that opens `ACTION_LEAD` into the loop, once, at a target. */
function swingScript(options: SwingOptions, tail: number): ActionScript {
  let target: Enemy | undefined;
  return {
    preroll: PREROLL,
    loop: ACTION_LEAD + SABER.duration + tail,
    input: { x: 0, y: STANCE_INPUT[options.stance] },
    setup: (run) => {
      quiet(run);
      const blade = bladeOf(run);
      blade.level = options.blade === 'eclipse' ? 5 : options.blade;
      blade.evolved = options.blade === 'eclipse';
      // The swing opens on the first tick the cooldown runs out.
      blade.cooldown = PREROLL + ACTION_LEAD - STEP / 2;
      target = standIn(
        run,
        bearingDirection(vec3(), run, options.bearing),
        TARGET_DISTANCE
      );
    },
    after: (run) => {
      // One swing a loop: the next waits for the replay.
      if (run.player.saberAttack) bladeOf(run).cooldown = 1e9;
      if (target && options.stance !== 'stand') carry(run, target);
    },
  };
}

/** Schedule `event` `at` seconds into the loop. */
const at = (run: Run, seconds: number, event: () => void) =>
  run.timers.push({ at: PREROLL + seconds, run: event });

/** Aim a preview hit from a bearing in the same frame the shield and body use. */
function strike(run: Run, heavy: boolean, bearing = 0) {
  const source = rotateAbout(
    copy(vec3(), run.player.forward),
    run.player.n,
    bearing
  );
  hurtPlayer(
    run,
    4,
    'mite',
    pointAt(vec3(), run.player.n, source, 0.2 / run.groundRadius),
    heavy
  );
}

/** Build the run that plays `spec`; swings take `options` over its own. */
export function actionScript(
  spec: ActionSpec,
  options: SwingOptions | undefined = spec.swing
): ActionScript {
  const still = (loop: number, setup: (run: Run) => void): ActionScript => ({
    preroll: PREROLL,
    loop,
    input: { x: 0, y: 0 },
    setup: (run) => {
      quiet(run);
      setup(run);
    },
  });
  switch (spec.kind) {
    case 'idle':
      return still(2, () => undefined);
    case 'reversal': {
      const input = { x: 0, y: 1 };
      return {
        ...still(1.45, (run) => {
          input.y = 1;
          at(run, 0.5, () => {
            input.y = -1;
          });
        }),
        input,
      };
    }
    case 'walk':
    case 'run': {
      const input = spec.kind === 'walk' ? WALK_INPUT : 1;
      const stride =
        spec.kind === 'walk' ? VANGUARD.walkStride : VANGUARD.runStride;
      return {
        ...still(strides(stride, input), () => undefined),
        input: { x: 0, y: input },
      };
    }
    case 'swing':
      return swingScript(options ?? swing('stand', 'right'), 0.45);
    case 'crescent': {
      const script = swingScript(options ?? swing('stand', 'right'), 1.05);
      return {
        ...script,
        setup: (run) => {
          script.setup(run);
          applyOffer(run, { kind: 'weapon', id: 'crescent', isNew: true });
        },
      };
    }
    case 'rebuke':
      return still(1.6, (run) => {
        applyOffer(run, { kind: 'weapon', id: 'rebuke', isNew: true });
        const rebuke = run.weapons.find((weapon) => weapon.id === 'rebuke')!;
        // A ring of Mites inside the shockwave shows its reach and knockback.
        const direction = copy(vec3(), run.player.heading);
        for (let i = 0; i < 6; i++) {
          rotateAbout(direction, run.player.n, Math.PI / 3);
          standIn(run, direction, 0.55);
        }
        at(run, ACTION_LEAD, () => {
          rebuke.primed = true;
        });
      });
    case 'aegis':
      return still(5.9, (run) => {
        at(run, 0, () => {
          for (let rank = 1; rank <= 5; rank++)
            applyOffer(run, { kind: 'system', id: 'aegis', isNew: rank === 1 });
        });
        // Show a full hover cycle before striking from alternating sides.
        at(run, 3.4, () => strike(run, false, 0.95));
        at(run, 4.3, () => strike(run, true, -1.15));
        at(run, 5.25, () => strike(run, false, 0.65));
      });
    case 'bolt-caster':
    case 'railstorm':
      return still(spec.kind === 'railstorm' ? 2.5 : 4.9, (run) => {
        applyOffer(run, { kind: 'weapon', id: 'bolts', isNew: true });
        const caster = run.weapons.find((w) => w.id === 'bolts')!;
        if (spec.kind === 'railstorm') {
          applyOffer(run, { kind: 'evolution', id: 'bolts' });
        } else {
          caster.level = 5;
          caster.volleys = 3; // Open the preview on the first double tap.
        }
        caster.cooldown = PREROLL + ACTION_LEAD - STEP / 2;
        const flank = bearingDirection(vec3(), run, 'ahead');
        rotateAbout(flank, run.player.n, 0.78);
        standIn(run, flank, 0.94);
        at(run, 0.76, () => {
          const rear = bearingDirection(vec3(), run, 'behind');
          rotateAbout(rear, run.player.n, 0.42);
          standIn(run, rear, 0.82);
        });
      });
    case 'shards':
    case 'shard-halo':
      return still(3.2, (run) => {
        const evolved = spec.kind === 'shard-halo';
        applyOffer(run, { kind: 'weapon', id: 'shards', isNew: true });
        if (evolved) applyOffer(run, { kind: 'evolution', id: 'shards' });
        const reach = (time: number) =>
          shardOrbitRadius(1, evolved, run.player.area, time);
        at(run, 0, () => {
          standIn(run, bearingDirection(vec3(), run, 'left'), reach(run.time));
          const flank = bearingDirection(vec3(), run, 'behind');
          rotateAbout(flank, run.player.n, 0.65);
          standIn(run, flank, reach(run.time + 1.4));
        });
      });
    case 'charge':
    case 'meltdown':
      return still(spec.kind === 'meltdown' ? 4.3 : 3.25, (run) => {
        applyOffer(run, { kind: 'weapon', id: 'charge', isNew: true });
        const charge = run.weapons.find((weapon) => weapon.id === 'charge')!;
        const evolved = spec.kind === 'meltdown';
        if (evolved) applyOffer(run, { kind: 'evolution', id: 'charge' });
        const direction = bearingDirection(vec3(), run, 'left');
        for (const angle of evolved ? [-0.35, 2.25, 1.7] : [-0.35]) {
          rotateAbout(direction, run.player.n, angle);
          standIn(run, direction, 0.96);
        }
        charge.cooldown = PREROLL + ACTION_LEAD - STEP / 2;
        // Leave the first volley to burn out before the loop restarts.
        at(run, ACTION_LEAD + 0.15, () => {
          charge.cooldown = 1e9;
        });
      });
    case 'pulse':
    case 'bastion':
      return still(3.3, (run) => {
        const evolved = spec.kind === 'bastion';
        const reach = stakePulseRadius(1, evolved, run.player.area);
        if (evolved) run.player.hp -= 20;
        const bearing = copy(vec3(), run.right);
        rotateAbout(bearing, run.player.n, 0.33);
        standIn(run, bearing, 0.83 * reach);
        rotateAbout(bearing, run.player.n, 2.65);
        const approaching = standIn(run, bearing, 1.38 * reach);
        approaching.speed = 0.4 * reach;
        at(run, 1.65, () => {
          approaching.speed = 0;
        });
        at(run, 0, () => {
          applyOffer(run, { kind: 'weapon', id: 'pulse', isNew: true });
          if (evolved) applyOffer(run, { kind: 'evolution', id: 'pulse' });
        });
      });
    case 'orbital-strike':
    case 'chain-barrage': {
      const evolved = spec.kind === 'chain-barrage';
      const level = spec.strikeLevel ?? 1;
      const period = orbitalStrikeRank(level, evolved).cooldown;
      return still(4 * period, (run) => {
        applyOffer(run, { kind: 'weapon', id: 'strike', isNew: true });
        if (evolved) applyOffer(run, { kind: 'evolution', id: 'strike' });
        const weapon = run.weapons.find((w) => w.id === 'strike')!;
        if (!evolved) weapon.level = level;
        // Leave time for the final chain to land before the loop wraps.
        weapon.cooldown = PREROLL + (evolved ? STEP : ACTION_LEAD) - STEP / 2;
        const bearing = bearingDirection(vec3(), run, 'left');
        const count = evolved ? 8 : 1;
        for (let i = 0; i < count; i++) {
          standIn(run, bearing, evolved ? 0.97 : 0.6);
          rotateAbout(bearing, run.player.n, (2 * Math.PI) / count);
        }
      });
    }
    case 'moving-loadout': {
      const loop = 8;
      const origin = vec3(),
        east = vec3(),
        north = vec3(),
        waypoint = vec3();
      return {
        preroll: 0,
        loop,
        input: (run) => {
          // Steer back onto the curve after real body contact displaces the runner.
          const lead = 0.28;
          const phase = ((run.time + lead) * 2 * Math.PI) / loop;
          const x = 0.82 * Math.sin(phase),
            y = 0.3 * Math.sin(2 * phase);
          set(
            waypoint,
            east.x * x + north.x * y,
            east.y * x + north.y * y,
            east.z * x + north.z * y
          );
          pointAt(
            waypoint,
            origin,
            normalize(waypoint),
            Math.hypot(x, y) / run.groundRadius
          );
          const scale = run.groundRadius / (HEROES.vanguard.speed * lead);
          return {
            x: scale * dot(waypoint, run.right),
            y: scale * dot(waypoint, run.player.forward),
          };
        },
        setup: (run) => {
          quiet(run);
          applyOffer(run, { kind: 'system', id: 'aegis', isNew: true });
          copy(origin, run.player.n);
          copy(east, run.right);
          copy(north, run.player.forward);
          for (const id of ['shards', 'pulse'] as const)
            applyOffer(run, { kind: 'weapon', id, isNew: true });
          // Crossing files use the same march as the Legion's formations.
          for (const [across, ahead] of [
            [0.88, 0.75],
            [0.36, -1.48],
            [-0.6, -1.62],
            [-0.97, 2.4],
          ]) {
            const mite = spawnEnemy(
              run,
              'mite',
              offsetPoint(run, run.right, across, ahead)
            );
            mite.hp = mite.maxHp = 1e9;
            const lane = copy(vec3(), run.player.forward);
            if (ahead > 0) set(lane, -lane.x, -lane.y, -lane.z);
            march(mite, lane, mite.spec.speed, 5);
          }
          // One hunter can be slowed and knocked back off the course.
          const hunter = standIn(run, run.right, 3.35);
          hunter.speed = hunter.spec.speed;
        },
      };
    }
    case 'hurt':
      return {
        ...still(2.0, (run) => {
          at(run, ACTION_LEAD, () => strike(run, false, -1.18));
          at(run, 1.28, () => strike(run, true, 1.18));
        }),
        input: { x: 0, y: 1 },
      };
    case 'defeated':
      return still(ACTION_LEAD + VANGUARD.deathDuration + 0.5, (run) => {
        // The fatal branch of `hurt` in sim.ts.
        at(run, ACTION_LEAD, () => {
          const player = run.player;
          player.hp = 0;
          run.status = 'fallen';
          run.deathAge = 0;
          player.saberAttack = undefined;
          player.moving = false;
          copy(player.prev, player.n);
          copy(player.prevForward, player.forward);
        });
      });
  }
}
