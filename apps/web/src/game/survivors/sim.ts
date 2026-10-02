/**
 * Core Survivors: a single-player survival run on the surface of the Core.
 *
 * The simulation is deterministic for a seed, an input sequence and the
 * reported `view` (where spawns breach), runs at a fixed rate and knows
 * nothing about rendering. Distances are world units on
 * the Core (radius 5); times are seconds. Every actor is a unit normal.
 */
import {
  VOLT_LEAP,
  VOLT_IMPACT_TIME,
  VOLT_END_TIME,
  voltLeapClipTime,
  sampleVoltLeap,
} from './voltAttack';
import { SEEKER_ATTACK } from './seekerAttack';
import {
  ENEMIES,
  EVENT_BANNERS,
  SYSTEMS,
  WEAPONS,
  scriptedEvent,
  type EnemyKind,
  type EnemySpec,
  type EventId,
  type SystemId,
  type WeaponId,
} from './content';
import {
  chord,
  copy,
  cross,
  dot,
  normalize,
  pointAt,
  projectTangent,
  randomUnit,
  rotateAbout,
  set,
  stepAlong,
  stepToward,
  tangentToward,
  vec3,
  type Vec3,
} from './sphere';

import {
  BULWARK_ATTACK,
  bulwarkWarningBounds,
  sampleBulwarkAttack,
  sweptShieldHit,
} from './bulwarkAttack';

import { ENEMY_DEFEAT, enemyDefeatTiming, STRIKE_TOSS } from './enemyDefeat';
import {
  BREACH,
  BREACH_EMERGE,
  BREACH_LIFE,
  MAX_BREACHES,
  type Breach,
} from './breach';
import { sectorAt, sectorCenter } from './sectors';
import { MAX_RIPPLES, RIPPLE, rippleLife, type Ripple } from './ripple';
import { SOUNDS, type SoundId } from './sounds';
import { WARDEN_SLAM, WARDEN_GAIT, wardenSlamOrigin } from './wardenAttack';

import {
  SABER,
  saberReach,
  saberHits,
  saberAim,
  type SaberAttack,
} from './saberAttack';

export { ENEMIES, SYSTEMS, WEAPONS };
export type { EnemyKind, SystemId, WeaponId };

export const SIM_HZ = 30;

export type EnemyMode =
  | 'walk'
  | 'aim'
  | 'charge'
  | 'recover'
  | 'leap'
  | 'slam'
  | 'thrust';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  spec: EnemySpec;
  n: Vec3;
  prev: Vec3;
  /** Tangent heading, for the model's facing. */
  heading: Vec3;
  hp: number;
  maxHp: number;
  speed: number;
  /** Speed away from `knockFrom`, decaying. */
  knock: number;
  knockFrom: Vec3;
  slow: number;
  slowTime: number;
  flash: number;
  age: number;
  mode: EnemyMode;
  modeTime: number;
  thrust?: {
    origin: Vec3;
    direction: Vec3;
    elapsed: number;
    previousElapsed: number;
    hit: boolean;
  };
  leap?: {
    origin: Vec3;
    direction: Vec3;
    distance: number;
    impacted: boolean;
    elapsed: number;
    previousElapsed: number;
  };
  slam?: {
    origin: Vec3;
    direction: Vec3;
    elapsed: number;
    previousElapsed: number;
    impacted: boolean;
  };
  /** Committed direction for aimed shots and charges. */
  aim: Vec3;
  cooldown: number;
  cooldown2: number;
  cooldown3: number;
  strafe: number;
  /** Straight movers march along `aim` and leave after `maxTravel`. */
  straight: boolean;
  travel: number;
  maxTravel: number;
  hitAt: Partial<Record<WeaponId, number>>;
  /** Seconds until it has risen out of its breach; inert and untargetable until 0. */
  emerge: number;
  dead: boolean;
}

/** Visual remains only: never enters targeting, movement, or collision queries. */
export interface DefeatedEnemy
  extends Pick<Enemy, 'id' | 'kind' | 'spec' | 'n' | 'heading' | 'speed'> {
  diedAt: number;
  age: number;
  previousAge: number;
  /**
   * Thrown from `from`, touching down at `land`, then skidding to rest at
   * `n`. `spin` turns it end over end in flight (half a turn lands a Mite on
   * its back); as it skids it leans `tilt` toward the side `lean` radians
   * around from its skid, and `twist` turns it.
   */
  toss?: {
    from: Vec3;
    land: Vec3;
    height: number;
    spin: number;
    tilt: number;
    lean: number;
    twist: number;
  };
}

export interface Gem {
  n: Vec3;
  prev: Vec3;
  value: number;
  pulled: boolean;
  speed: number;
  dead: boolean;
}

export type ItemKind = 'repair' | 'tractor' | 'emp' | 'drop';

export interface Item {
  kind: ItemKind;
  n: Vec3;
  prev: Vec3;
  big: boolean;
  age: number;
  dead: boolean;
}

export interface Projectile {
  n: Vec3;
  prev: Vec3;
  dir: Vec3;
  speed: number;
  life: number;
  damage: number;
  pierce: number;
  hit: Set<number>;
  /** An enemy kind for hostile bolts; null for the Vanguard's. */
  from: EnemyKind | null;
}

export interface Lob {
  from: Vec3;
  to: Vec3;
  age: number;
  life: number;
  damage: number;
  radius: number;
  burn: number;
}

export interface Zone {
  n: Vec3;
  radius: number;
  age: number;
  life: number;
  damage: number;
  tick: number;
}

export type Effect =
  | {
      kind: 'sweep';
      n: Vec3;
      dir: Vec3;
      side: number;
      reach: number;
      width: number;
      arc: number;
      age: number;
      life: number;
    }
  | {
      kind: 'eclipse';
      n: Vec3;
      dir: Vec3;
      radius: number;
      age: number;
      life: number;
    }
  | { kind: 'strike'; n: Vec3; radius: number; age: number; life: number }
  | { kind: 'chain'; a: Vec3; b: Vec3; age: number; life: number }
  | {
      kind: 'blast';
      n: Vec3;
      radius: number;
      tone: 'fire' | 'volt' | 'strike' | 'warden';
      age: number;
      life: number;
    }
  | {
      kind: 'aim';
      n: Vec3;
      dir: Vec3;
      length: number;
      age: number;
      life: number;
    }
  | {
      kind: 'cone';
      enemyId: number;
      n: Vec3;
      dir: Vec3;
      radius: number;
      spread: number;
      age: number;
      life: number;
    }
  | { kind: 'emp'; age: number; life: number };

export interface DamageText {
  n: Vec3;
  value: number;
  crit: boolean;
  hurt: boolean;
  age: number;
}

export interface Weapon {
  id: WeaponId;
  level: number;
  evolved: boolean;
  cooldown: number;
  /** Arc Blade: the next swing's sound is already queued. */
  swingCued?: boolean;
  /** Orbit Shards: current and previous angle, radius and count. */
  angle: number;
  prevAngle: number;
  radius: number;
  count: number;
}

export interface Player {
  n: Vec3;
  prev: Vec3;
  /** Screen-up tangent, carried along as the player moves. */
  forward: Vec3;
  prevForward: Vec3;
  /** Last travel direction, for the model's facing. */
  heading: Vec3;
  moving: boolean;
  saberAttack?: SaberAttack;
  /** Last Bolt Caster volley, for independent off-hand aim and recoil. */
  boltShot?: { firedAt: number; forward: Vec3 };
  hp: number;
  maxHp: number;
  invulnerable: number;
  level: number;
  xp: number;
  xpNext: number;
  might: number;
  bonusMight: number;
  cooldownScale: number;
  area: number;
  speedScale: number;
  armor: number;
  regen: number;
  magnet: number;
  /** A knockback in progress: direction of travel and current speed. */
  shove?: { dir: Vec3; speed: number };
}

export type Offer =
  | { kind: 'weapon'; id: WeaponId; isNew: boolean }
  | { kind: 'system'; id: SystemId; isNew: boolean }
  | { kind: 'evolution'; id: WeaponId }
  | { kind: 'repair' }
  | { kind: 'sharpen' };

export type RunStatus = 'playing' | 'choosing' | 'supply' | 'fallen';

export interface Banner {
  title: string;
  detail: string;
  tone: 'danger' | 'good' | 'boss';
  age: number;
}

interface Timer {
  at: number;
  run: () => void;
}

export interface Run {
  seed: number;
  random: () => number;
  status: RunStatus;
  time: number;
  /** Presentation time after defeat; survival time stays frozen. */
  deathAge: number;
  groundRadius: number;
  player: Player;
  /** Screen-right tangent at the player, refreshed each tick. */
  right: Vec3;
  weapons: Weapon[];
  systems: Partial<Record<SystemId, number>>;
  enemies: Enemy[];
  defeatedEnemies: DefeatedEnemy[];
  bosses: Enemy[];
  gems: Gem[];
  items: Item[];
  projectiles: Projectile[];
  lobs: Lob[];
  zones: Zone[];
  effects: Effect[];
  texts: DamageText[];
  timers: Timer[];
  offers: Offer[];
  rerolls: number;
  supply: Offer[];
  pendingLevels: number;
  pendingDrops: number[];
  banner: Banner | null;
  kills: number;
  damageBy: Partial<Record<WeaponId, number>>;
  hurtBy: Partial<Record<EnemyKind, number>>;
  /** Integrity restored, by source. */
  healedBy: Partial<Record<HealSource, number>>;
  lastHitBy: EnemyKind | null;
  nextId: number;
  eventIndex: number;
  wardens: number;
  spawnCredit: number;
  healthScale: number;
  shake: number;
  hurtFlash: number;
  /** Earliest time the next repair may drop. */
  nextRepairAt: number;
  /** Sectors flipping open for spawns. */
  breaches: Breach[];
  /** Rings running through the Sectors from Orbital Strike impacts. */
  ripples: Ripple[];
  /** Sounds for the renderer to play and clear; bounded if nobody listens. */
  cues: Cue[];
  /** Ground distance from the player to each screen edge, set by the renderer. */
  view: ViewExtent;
}

export interface Cue {
  id: SoundId;
  /** Where it happened, to place it on screen; null for the whole run. */
  n: Vec3 | null;
  /** Playback speed, to fit a sound to an action's length; 1 as authored. */
  rate: number;
  /**
   * Seconds from now until the moment the sound marks, such as a saber's
   * cut, so the player can line its peak up with it; null to play at once.
   */
  at: number | null;
}

export interface ViewExtent {
  right: number;
  left: number;
  up: number;
  down: number;
}

export interface MoveInput {
  /** −1…1 toward the screen's right. */
  x: number;
  /** −1…1 toward the screen's top. */
  y: number;
}

const PLAYER_RADIUS = 0.1;
const PLAYER_SPEED = 1;
/** Roughly the half-height of the view; "visible" targets are within it. */
const VIEW = 3.4;
const SPAWN_DISTANCE = 5.4;
/** A landscape view from the follow camera, until the renderer reports one. */
const DEFAULT_VIEW: ViewExtent = { right: 3.5, left: 3.5, up: 3.5, down: 2.4 };
/** Breaches stay this far inside the screen edge, clear of the HUD. */
const SPAWN_MARGIN = 0.7;
const SPAWN_MIN = 1.6;
const RECYCLE_DISTANCE = 7.6;
const CELL = 0.6;
const MAX_TEXTS = 120;
const MAX_GEMS = 320;
const MAX_EFFECTS = 240;
/**
 * Repairs drop from kills, but at most this often: late runs kill thousands a
 * minute, and repairs scaling with kills let a crowd heal you faster than it
 * could hurt you.
 */
const REPAIR_COOLDOWN = 30;
/** Bastion's repair per pulse, however many enemies it burns. */
const BASTION_REPAIR = 1;
/** Enemy health compounds by `rate` a minute after minute `from`. */
const HEALTH_RAMP = { from: 6, rate: 1.15 };
const TAU = Math.PI * 2;

export const xpForLevel = (level: number) =>
  Math.round(3 + level * 3.2 + Math.pow(level, 1.8) * 0.35);

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newWeapon(id: WeaponId): Weapon {
  return {
    id,
    level: 1,
    evolved: false,
    cooldown: 0.4,
    angle: 0,
    prevAngle: 0,
    radius: 0,
    count: 0,
  };
}

export function createRun(
  seed: number,
  groundRadius: number,
  starter: WeaponId = 'blade'
): Run {
  const random = seededRandom(seed);
  const n = randomUnit(vec3(), random);
  const forward = tangentToward(vec3(), n, vec3(0, 1, 0), vec3(1, 0, 0));
  const run: Run = {
    seed,
    random,
    status: 'playing',
    deathAge: 0,
    time: 0,
    groundRadius,
    player: {
      n,
      prev: copy(vec3(), n),
      forward,
      prevForward: copy(vec3(), forward),
      heading: copy(vec3(), forward),
      moving: false,
      hp: 100,
      maxHp: 100,
      invulnerable: 0,
      level: 1,
      xp: 0,
      xpNext: xpForLevel(1),
      might: 1,
      bonusMight: 0,
      cooldownScale: 1,
      area: 1,
      speedScale: 1,
      armor: 0,
      regen: 0,
      magnet: 0.55,
    },
    right: vec3(),
    weapons: [newWeapon(starter)],
    systems: {},
    enemies: [],
    defeatedEnemies: [],
    bosses: [],
    gems: [],
    items: [],
    projectiles: [],
    lobs: [],
    zones: [],
    effects: [],
    texts: [],
    timers: [],
    offers: [],
    rerolls: 2,
    supply: [],
    pendingLevels: 0,
    pendingDrops: [],
    banner: null,
    kills: 0,
    damageBy: {},
    hurtBy: {},
    healedBy: {},
    lastHitBy: null,
    nextId: 1,
    eventIndex: 0,
    wardens: 0,
    spawnCredit: 0,
    healthScale: 1,
    shake: 0,
    hurtFlash: 0,
    nextRepairAt: 0,
    breaches: [],
    ripples: [],
    cues: [],
    view: { ...DEFAULT_VIEW },
  };
  playerRight(run.right, run.player);
  return run;
}

/** Screen-right tangent at the player: forward × normal. */
export function playerRight(out: Vec3, player: Player): Vec3 {
  return cross(out, player.forward, player.n);
}

function recalc(run: Run) {
  const p = run.player;
  const s = run.systems;
  p.might = 1 + 0.1 * (s.force ?? 0);
  p.cooldownScale = 1 - 0.08 * (s.overclock ?? 0);
  p.area = 1 + 0.1 * (s.amplifier ?? 0);
  p.speedScale = 1 + 0.1 * (s.thrusters ?? 0);
  p.armor = s.plating ?? 0;
  const maxHp = 100 + 20 * (s.nanorepair ?? 0);
  if (maxHp > p.maxHp) p.hp += maxHp - p.maxHp;
  p.maxHp = maxHp;
  p.regen = 0.25 * (s.nanorepair ?? 0);
  p.magnet = 0.55 * (1 + 0.3 * (s.tractor ?? 0));
}

const might = (run: Run) => run.player.might * (1 + run.player.bonusMight);

// ---------- Spatial grid ----------

const grid = new Map<number, Enemy[]>();
const cellOf = (value: number, radius: number) =>
  Math.floor((value * radius) / CELL);
const gridKey = (cx: number, cy: number, cz: number) =>
  ((cx + 64) * 128 + (cy + 64)) * 128 + (cz + 64);

function buildGrid(run: Run) {
  grid.clear();
  const radius = run.groundRadius;
  for (const enemy of run.enemies) {
    if (enemy.dead || enemy.emerge > 0) continue;
    const key = gridKey(
      cellOf(enemy.n.x, radius),
      cellOf(enemy.n.y, radius),
      cellOf(enemy.n.z, radius)
    );
    let cell = grid.get(key);
    if (!cell) grid.set(key, (cell = []));
    cell.push(enemy);
  }
}

/** Enemies whose cells overlap a ball of `reach` world units around `n`. */
function nearby(run: Run, n: Vec3, reach: number): Enemy[] {
  const found: Enemy[] = [];
  const radius = run.groundRadius;
  const span = Math.ceil(reach / CELL);
  const cx = cellOf(n.x, radius);
  const cy = cellOf(n.y, radius);
  const cz = cellOf(n.z, radius);
  for (let x = cx - span; x <= cx + span; x++)
    for (let y = cy - span; y <= cy + span; y++)
      for (let z = cz - span; z <= cz + span; z++) {
        const cell = grid.get(gridKey(x, y, z));
        if (cell) for (const enemy of cell) found.push(enemy);
      }
  return found;
}

const distance = (run: Run, a: Vec3, b: Vec3) => chord(a, b) * run.groundRadius;

function nearestEnemy(
  run: Run,
  n: Vec3,
  reach: number,
  except?: Set<Enemy>
): Enemy | null {
  let best: Enemy | null = null;
  let bestDistance = reach / run.groundRadius;
  for (const enemy of run.enemies) {
    if (enemy.dead || enemy.emerge > 0 || except?.has(enemy)) continue;
    const d = chord(enemy.n, n);
    if (d < bestDistance) {
      bestDistance = d;
      best = enemy;
    }
  }
  return best;
}

function visibleEnemies(run: Run) {
  const reach = VIEW / run.groundRadius;
  return run.enemies.filter(
    (enemy) =>
      !enemy.dead && enemy.emerge <= 0 && chord(enemy.n, run.player.n) < reach
  );
}

// ---------- Combat ----------

function addText(
  run: Run,
  n: Vec3,
  value: number,
  crit: boolean,
  hurt = false
) {
  if (run.texts.length >= MAX_TEXTS) run.texts.shift();
  run.texts.push({ n: copy(vec3(), n), value, crit, hurt, age: 0 });
}

const MAX_CUES = 128;

/**
 * Queue a sound. Each sound keeps at most its voice limit in the queue, since
 * the player would drop the rest, so a flood of hits never crowds out a
 * one-off like `hurt` or `levelup`.
 */
function cue(
  run: Run,
  id: SoundId,
  n?: Vec3,
  rate = 1,
  at: number | null = null
) {
  if (run.cues.length >= MAX_CUES) return;
  let queued = 0;
  for (const other of run.cues) if (other.id === id) queued++;
  if (queued >= SOUNDS[id].voices) return;
  run.cues.push({ id, n: n ? copy(vec3(), n) : null, rate, at });
}

function addEffect(run: Run, effect: Effect) {
  if (run.effects.length < MAX_EFFECTS) run.effects.push(effect);
}

function banner(run: Run, title: string, detail: string, tone: Banner['tone']) {
  run.banner = { title, detail, tone, age: 0 };
}

function damage(
  run: Run,
  enemy: Enemy,
  amount: number,
  source: WeaponId | null,
  knock = 0,
  from?: Vec3
) {
  if (enemy.dead) return;
  const crit = run.random() < 0.06;
  const dealt = Math.max(1, Math.round(amount * (crit ? 2 : 1)));
  enemy.hp -= dealt;
  // Weapons with their own impact sound only add the shared crit.
  if (crit) cue(run, 'crit', enemy.n);
  else if (source === 'blade' || source === 'bolts') cue(run, 'hit', enemy.n);
  enemy.flash = 0.08;
  if (knock > 0 && !enemy.straight && !enemy.spec.boss) {
    enemy.knock = Math.max(enemy.knock, knock / enemy.spec.mass);
    copy(enemy.knockFrom, from ?? run.player.n);
  }
  if (source) run.damageBy[source] = (run.damageBy[source] ?? 0) + dealt;
  addText(run, enemy.n, dealt, crit);
  if (enemy.hp <= 0) kill(run, enemy, tossOrigin(run, source, from));
}

function hitCircle(
  run: Run,
  n: Vec3,
  radius: number,
  amount: number,
  source: WeaponId | null,
  knock = 0
) {
  for (const enemy of nearby(run, n, radius + 0.3)) {
    if (enemy.dead) continue;
    if (distance(run, enemy.n, n) <= radius + enemy.spec.radius)
      damage(run, enemy, amount, source, knock, n);
  }
}

function cooledDown(
  run: Run,
  enemy: Enemy,
  weapon: WeaponId,
  interval: number
) {
  if ((enemy.hitAt[weapon] ?? 0) > run.time) return false;
  enemy.hitAt[weapon] = run.time + interval;
  return true;
}

/** `blast` is where a tossing hit came from: a strike impact or the saber's wielder. */
/** Orbital Strikes throw bodies off their impact; saber cuts, away from the trooper. */
function tossOrigin(run: Run, source: WeaponId | null, from?: Vec3) {
  if (source === 'strike') return from;
  if (source === 'blade') return from ?? run.player.n;
  return undefined;
}

/** Throw a body away from the impact; it lands where it will settle. */
function toss(run: Run, body: DefeatedEnemy, blast: Vec3) {
  const away = tangentToward(vec3(), body.n, blast, body.heading);
  set(away, -away.x, -away.y, -away.z);
  // Struck dead center: any direction will do.
  if (chord(body.n, blast) * run.groundRadius < 0.02)
    rotateAbout(away, body.n, run.random() * TAU);
  const spread = (limit: number) => (run.random() - 0.5) * 2 * limit;
  rotateAbout(away, body.n, spread(STRIKE_TOSS.jitter));
  const from = copy(vec3(), body.n);
  const height = STRIKE_TOSS.height * (0.6 + 0.8 * run.random());
  const onBack = body.spec.model === 'mite';
  const spin = (run.random() < 0.5 ? -1 : 1) * (onBack ? Math.PI : TAU);
  stepAlong(
    body.n,
    away,
    (STRIKE_TOSS.distance + STRIKE_TOSS.spread * run.random()) /
      run.groundRadius
  );
  const land = copy(vec3(), body.n);
  rotateAbout(away, body.n, spread(STRIKE_TOSS.slideTurn));
  stepAlong(
    body.n,
    away,
    (STRIKE_TOSS.slide + STRIKE_TOSS.slideSpread * run.random()) /
      run.groundRadius
  );
  body.toss = {
    from,
    land,
    height,
    spin,
    tilt: onBack
      ? STRIKE_TOSS.minTilt +
        (STRIKE_TOSS.tilt - STRIKE_TOSS.minTilt) * run.random()
      : 0,
    lean: run.random() * TAU,
    twist: spread(STRIKE_TOSS.twist),
  };
}

function kill(run: Run, enemy: Enemy, blast?: Vec3) {
  if (enemy.dead) return;
  enemy.dead = true;
  const heavy = enemy.spec.mass > 1 || enemy.spec.elite || enemy.spec.boss;
  cue(run, heavy ? 'death-heavy' : 'death', enemy.n);
  enemy.slam = undefined;
  enemy.leap = undefined;
  run.effects = run.effects.filter(
    (e) => e.kind !== 'cone' || e.enemyId !== enemy.id
  );
  if (
    enemy.spec.model === 'mite' ||
    enemy.spec.model === 'lancer' ||
    enemy.spec.model === 'bulwark' ||
    enemy.spec.model === 'warden' ||
    enemy.spec.model === 'seeker'
  ) {
    if (run.defeatedEnemies.length >= ENEMY_DEFEAT.capacity)
      run.defeatedEnemies.shift();
    const body: DefeatedEnemy = {
      id: enemy.id,
      kind: enemy.kind,
      spec: enemy.spec,
      n: copy(vec3(), enemy.n),
      heading: copy(vec3(), enemy.heading),
      speed: enemy.speed,
      diedAt: run.time,
      age: 0,
      previousAge: 0,
    };
    const spec = enemy.spec;
    // The Seeker uses its grounded side-collapse instead of a thrown-body pose.
    if (
      blast &&
      spec.model !== 'seeker' &&
      spec.mass <= STRIKE_TOSS.maxMass &&
      !spec.boss &&
      !spec.elite
    )
      toss(run, body, blast);
    run.defeatedEnemies.push(body);
  }
  run.kills++;
  dropGem(run, enemy.n, enemy.spec.xp);
  if (enemy.spec.boss) {
    run.bosses = run.bosses.filter((boss) => boss !== enemy);
    dropItem(run, 'drop', enemy.n, true);
    banner(
      run,
      `${enemy.spec.label} is destroyed`,
      'A large Supply Drop has landed.',
      'good'
    );
    run.shake = 0.6;
  } else if (enemy.spec.elite) {
    dropItem(run, 'drop', enemy.n, false);
  } else {
    const roll = run.random();
    if (roll < 0.008) {
      if (run.time >= run.nextRepairAt) {
        dropItem(run, 'repair', enemy.n);
        run.nextRepairAt = run.time + REPAIR_COOLDOWN;
      }
    } else if (roll < 0.011) dropItem(run, 'tractor', enemy.n);
    else if (roll < 0.013) dropItem(run, 'emp', enemy.n);
  }
}

function dropGem(run: Run, n: Vec3, value: number) {
  if (run.gems.length >= MAX_GEMS) {
    run.gems[Math.floor(run.random() * run.gems.length)].value += value;
    return;
  }
  run.gems.push({
    n: copy(vec3(), n),
    prev: copy(vec3(), n),
    value,
    pulled: false,
    speed: 0.6,
    dead: false,
  });
}

function dropItem(run: Run, kind: ItemKind, n: Vec3, big = false) {
  run.items.push({
    kind,
    n: copy(vec3(), n),
    prev: copy(vec3(), n),
    big,
    age: 0,
    dead: false,
  });
}

const damageScale = (run: Run) => 1 + 0.08 * (run.time / 60);

function hurt(run: Run, amount: number, by: EnemyKind) {
  const player = run.player;
  if (player.invulnerable > 0 || run.status !== 'playing') return false;
  const dealt = Math.max(1, Math.round(amount - player.armor));
  player.hp -= dealt;
  player.invulnerable = 0.6;
  run.shake = Math.max(run.shake, 0.22);
  run.hurtFlash = 0.25;
  run.hurtBy[by] = (run.hurtBy[by] ?? 0) + dealt;
  run.lastHitBy = by;
  addText(run, player.n, dealt, false, true);
  cue(run, player.hp <= 0 ? 'fallen' : 'hurt');
  if (player.hp <= 0) {
    player.hp = 0;
    run.status = 'fallen';
    run.deathAge = 0;
    player.saberAttack = undefined;
    player.moving = false;
    copy(player.prev, player.n);
    copy(player.prevForward, player.forward);
    run.timers.length = 0;
  }
  return true;
}

export type HealSource = 'regen' | 'bastion' | 'repair' | 'offer';

function heal(run: Run, amount: number, source: HealSource) {
  const before = run.player.hp;
  run.player.hp = Math.min(run.player.maxHp, run.player.hp + amount);
  run.healedBy[source] = (run.healedBy[source] ?? 0) + run.player.hp - before;
}

// ---------- Weapons ----------

const offset = vec3();
const direction = vec3();

/**
 * Seconds ahead of a swing that its sound is queued: enough for each take to
 * build to its peak and for the device's audio output delay, so the peak is
 * heard with the cut rather than after it.
 */
const SWING_LEAD = 0.35;

/** The next swing for the blade as it stands: cuts, their length, cooldown. */
function bladeSwing(run: Run, weapon: Weapon) {
  const evolved = weapon.evolved;
  const cooldown =
    (evolved ? 1.15 : weapon.level >= 5 ? 1 : 1.3) * run.player.cooldownScale;
  const count = !evolved && weapon.level >= 2 ? 2 : 1;
  return {
    evolved,
    cooldown,
    count,
    duration: Math.min(SABER.duration, cooldown / count),
  };
}

/**
 * Queue every cut of the swing starting in `startsIn` s, timed to what the
 * player sees: a cut's sweep, or Eclipse's full-circle burst at the impact.
 */
function cueSwing(run: Run, weapon: Weapon, startsIn: number) {
  const { evolved, count, duration } = bladeSwing(run, weapon);
  // Swings shorter than the clip play it faster, up to the impact frame.
  const sweep =
    ((evolved ? SABER.impact : SABER.sweep) / SABER.duration) * duration;
  for (let i = 0; i < count; i++)
    cue(
      run,
      evolved ? 'eclipse' : 'blade',
      run.player.n,
      1,
      startsIn + i * duration + sweep
    );
  weapon.swingCued = true;
}

function updateBlade(run: Run, weapon: Weapon, dt: number) {
  weapon.cooldown -= dt;
  const player = run.player;
  if (
    player.saberAttack &&
    run.time >= player.saberAttack.startedAt + player.saberAttack.duration
  )
    player.saberAttack = undefined;
  if (weapon.cooldown > 0) {
    // The swing starts on the first tick the cooldown runs out.
    if (!weapon.swingCued && weapon.cooldown <= SWING_LEAD)
      cueSwing(run, weapon, Math.ceil(weapon.cooldown / dt) * dt);
    return;
  }
  // A swing that came sooner than the lead, like the first, is cued as it starts.
  if (!weapon.swingCued) cueSwing(run, weapon, 0);
  weapon.swingCued = false;
  const scale = might(run),
    level = weapon.level;
  const { reach, width, arc } = saberReach(level, player.area);
  const eclipseRadius = 1.18 * player.area;
  const { evolved, cooldown, count, duration } = bladeSwing(run, weapon);
  const amount = evolved
    ? 42 * scale
    : 14 * (1 + (level >= 3 ? 0.3 : 0) + (level >= 5 ? 0.3 : 0)) * scale;
  weapon.cooldown = cooldown;
  const target = nearestEnemy(run, player.n, reach + 0.5);
  const aim = saberAim(player.n, player.heading, target?.n);
  const start = (side: number, forward: Vec3) => {
    if (run.status === 'fallen') return;
    const attack: SaberAttack = {
      id: run.nextId++,
      startedAt: run.time,
      duration,
      side,
      forward: copy(vec3(), forward),
    };
    player.saberAttack = attack;
    run.timers.push({
      at: run.time + (SABER.impact / SABER.duration) * duration,
      run: () => {
        if (run.status === 'fallen') return;
        const n = copy(vec3(), player.n),
          dir = copy(vec3(), attack.forward);
        if (evolved) {
          hitCircle(run, n, eclipseRadius, amount, 'blade', 2.4);
          addEffect(run, {
            kind: 'eclipse',
            n,
            dir,
            radius: eclipseRadius,
            age: 0,
            life: 0.3,
          });
          return;
        }
        addEffect(run, {
          kind: 'sweep',
          n,
          dir,
          side,
          reach,
          width,
          arc,
          age: 0,
          life: SABER.effectLife,
        });
        const right = cross(vec3(), dir, n);
        for (const enemy of nearby(run, n, reach + 0.4)) {
          if (enemy.dead) continue;
          set(offset, enemy.n.x - n.x, enemy.n.y - n.y, enemy.n.z - n.z);
          const x = dot(offset, right) * run.groundRadius * side;
          const y = dot(offset, dir) * run.groundRadius;
          if (saberHits(x, y, reach, width, arc, enemy.spec.radius))
            damage(run, enemy, amount, 'blade', 1.12);
        }
      },
    });
  };
  start(aim.side, aim.forward);
  const first = player.saberAttack!;
  // Until the dual-wield model arrives, the upgrade performs two sequential cuts.
  if (count === 2)
    run.timers.push({
      at: run.time + duration,
      run: () => start(-first.side, first.forward),
    });
}

function fireBolt(
  run: Run,
  dir: Vec3,
  amount: number,
  pierce: number,
  speed: number
) {
  const n = copy(vec3(), run.player.n);
  run.projectiles.push({
    n,
    prev: copy(vec3(), n),
    dir: copy(vec3(), dir),
    speed,
    life: 1.3,
    damage: amount,
    pierce,
    hit: new Set(),
    from: null,
  });
}

function updateBolts(run: Run, weapon: Weapon, dt: number) {
  weapon.cooldown -= dt;
  if (weapon.cooldown > 0) return;
  const player = run.player;
  const scale = might(run);
  const target = nearestEnemy(run, player.n, 4.2);
  if (target) tangentToward(direction, player.n, target.n, player.heading);
  else copy(direction, player.heading);
  if (weapon.evolved) {
    weapon.cooldown = 0.085 * player.cooldownScale;
    rotateAbout(direction, player.n, (run.random() - 0.5) * 0.25);
    player.boltShot = { firedAt: run.time, forward: copy(vec3(), direction) };
    fireBolt(run, direction, 12 * scale, 3, 3.5);
    cue(run, 'railstorm', player.n);
    return;
  }
  const level = weapon.level;
  const count = 1 + (level >= 2 ? 1 : 0) + (level >= 4 ? 1 : 0);
  const amount = 10 * (level >= 3 ? 1.4 : 1) * scale;
  const pierce = (level >= 3 ? 1 : 0) + (level >= 5 ? 2 : 0);
  weapon.cooldown = (level >= 5 ? 0.72 : 1) * player.cooldownScale;
  const base = copy(vec3(), direction);
  player.boltShot = { firedAt: run.time, forward: copy(vec3(), base) };
  cue(run, 'bolt', player.n);
  for (let i = 0; i < count; i++) {
    copy(direction, base);
    rotateAbout(direction, player.n, (i - (count - 1) / 2) * 0.14);
    fireBolt(run, direction, amount, pierce, 3);
  }
}

const shard = vec3();

function updateShards(run: Run, weapon: Weapon, dt: number) {
  const player = run.player;
  const scale = might(run);
  let count: number;
  let amount: number;
  let radius: number;
  let spin: number;
  if (weapon.evolved) {
    count = 6;
    amount = 16 * scale;
    spin = 4.2;
    radius = (0.74 + 0.26 * Math.sin(run.time * 2.2)) * player.area;
  } else {
    const level = weapon.level;
    count =
      2 + (level >= 2 ? 1 : 0) + (level >= 4 ? 1 : 0) + (level >= 5 ? 1 : 0);
    amount = 9 * (level >= 3 ? 1.3 : 1) * scale;
    radius = 0.55 * (level >= 3 ? 1.2 : 1) * player.area;
    spin = 3.2 * (level >= 5 ? 1.35 : 1);
  }
  weapon.prevAngle = weapon.angle;
  weapon.angle += spin * dt;
  weapon.radius = radius;
  weapon.count = count;
  const reach = 0.08 * player.area;
  for (let i = 0; i < count; i++) {
    shardDirection(
      direction,
      run.right,
      player.n,
      weapon.angle + (i * TAU) / count
    );
    pointAt(shard, player.n, direction, radius / run.groundRadius);
    for (const enemy of nearby(run, shard, 0.35)) {
      if (enemy.dead) continue;
      if (
        distance(run, enemy.n, shard) < enemy.spec.radius + reach &&
        cooledDown(run, enemy, 'shards', 0.4)
      ) {
        cue(run, 'shard-hit', enemy.n);
        damage(run, enemy, amount, 'shards', 0.64);
      }
    }
  }
}

/** The tangent direction of a shard at `angle`, measured from screen-right. */
export function shardDirection(
  out: Vec3,
  right: Vec3,
  normal: Vec3,
  angle: number
) {
  copy(out, right);
  return rotateAbout(out, normal, angle);
}

function strikeAt(run: Run, n: Vec3, amount: number, radius: number) {
  cue(run, 'strike', n);
  hitCircle(run, n, radius, amount, 'strike');
  addEffect(run, {
    kind: 'strike',
    n: copy(vec3(), n),
    radius,
    age: 0,
    life: 0.25,
  });
  if (run.ripples.length >= MAX_RIPPLES) run.ripples.shift();
  run.ripples.push({
    n: copy(vec3(), n),
    strength: radius / RIPPLE.baseRadius,
    age: 0,
  });
}

function updateStrike(run: Run, weapon: Weapon, dt: number) {
  weapon.cooldown -= dt;
  if (weapon.cooldown > 0) return;
  const player = run.player;
  const scale = might(run);
  const level = weapon.level;
  let count: number;
  let amount: number;
  let radius: number;
  let chain = 0;
  if (weapon.evolved) {
    count = 3;
    amount = 30 * scale;
    radius = 0.35 * player.area;
    chain = 4;
    weapon.cooldown = 0.9 * player.cooldownScale;
  } else {
    count = 1 + (level >= 2 ? 1 : 0) + (level >= 4 ? 1 : 0);
    amount = 20 * (level >= 3 ? 1.4 : 1) * scale;
    radius = (level >= 4 ? 0.32 : 0.22) * player.area;
    weapon.cooldown = (level >= 5 ? 1 : 1.5) * player.cooldownScale;
  }
  const candidates = visibleEnemies(run);
  if (!candidates.length) {
    weapon.cooldown = 0.3;
    return;
  }
  for (let i = 0; i < count && candidates.length; i++) {
    const target = candidates.splice(
      Math.floor(run.random() * candidates.length),
      1
    )[0];
    const at = copy(vec3(), target.n);
    strikeAt(run, at, amount, radius);
    let current = at;
    const seen = new Set<Enemy>([target]);
    for (let c = 0; c < chain; c++) {
      const next = nearestEnemy(run, current, 1.1, seen);
      if (!next) break;
      seen.add(next);
      const to = copy(vec3(), next.n);
      addEffect(run, { kind: 'chain', a: current, b: to, age: 0, life: 0.22 });
      cue(run, 'chain', to);
      strikeAt(run, to, amount * 0.8, radius * 0.8);
      current = to;
    }
  }
}

function updateCharge(run: Run, weapon: Weapon, dt: number) {
  weapon.cooldown -= dt;
  if (weapon.cooldown > 0) return;
  const player = run.player;
  const scale = might(run);
  const level = weapon.level;
  let count: number;
  let amount: number;
  let radius: number;
  let burn: number;
  if (weapon.evolved) {
    count = 3;
    amount = 11 * scale;
    radius = 0.55 * player.area;
    burn = 5;
  } else {
    count = 1 + (level >= 2 ? 1 : 0) + (level >= 5 ? 1 : 0);
    amount = 6 * (level >= 4 ? 1.4 : 1) * scale;
    radius = 0.29 * (level >= 4 ? 1.3 : 1) * player.area;
    burn = level >= 3 ? 3.2 : 2.2;
  }
  weapon.cooldown = 2.4 * player.cooldownScale;
  const visible = visibleEnemies(run);
  for (let i = 0; i < count; i++) {
    const to = vec3();
    if (visible.length)
      copy(to, visible[Math.floor(run.random() * visible.length)].n);
    else {
      shardDirection(direction, run.right, player.n, run.random() * TAU);
      pointAt(to, player.n, direction, 1 / run.groundRadius);
    }
    run.lobs.push({
      from: copy(vec3(), player.n),
      to,
      age: 0,
      life: 0.5,
      damage: amount,
      radius,
      burn,
    });
  }
  cue(run, 'lob', player.n);
}

function updatePulse(run: Run, weapon: Weapon, dt: number) {
  const player = run.player;
  const scale = might(run);
  const level = weapon.level;
  let radius: number;
  let amount: number;
  let slow: number;
  if (weapon.evolved) {
    radius = 1 * player.area;
    amount = 10 * scale;
    slow = 0.45;
  } else {
    radius =
      0.48 *
      (1 + (level >= 2 ? 0.2 : 0) + (level >= 4 ? 0.2 : 0)) *
      player.area;
    amount = 5 * (1 + (level >= 3 ? 0.4 : 0) + (level >= 5 ? 0.4 : 0)) * scale;
    slow = level >= 5 ? 0.4 : 0.25;
  }
  weapon.radius = radius;
  weapon.cooldown -= dt;
  const pulse = weapon.cooldown <= 0;
  if (pulse) weapon.cooldown = 0.45;
  let repaired = 0;
  let struck = false;
  for (const enemy of nearby(run, player.n, radius + 0.3)) {
    if (
      enemy.dead ||
      distance(run, enemy.n, player.n) >= radius + enemy.spec.radius
    )
      continue;
    enemy.slow = slow;
    enemy.slowTime = 0.3;
    if (pulse) {
      struck = true;
      damage(run, enemy, amount, 'pulse');
      if (weapon.evolved && repaired < BASTION_REPAIR) {
        const amount = Math.min(0.35, BASTION_REPAIR - repaired);
        heal(run, amount, 'bastion');
        repaired += amount;
      }
    }
  }
  if (struck) cue(run, weapon.evolved ? 'bastion' : 'pulse', player.n);
}

const WEAPON_UPDATES: Record<
  WeaponId,
  (run: Run, weapon: Weapon, dt: number) => void
> = {
  blade: updateBlade,
  bolts: updateBolts,
  shards: updateShards,
  strike: updateStrike,
  charge: updateCharge,
  pulse: updatePulse,
};

// ---------- Enemies ----------

function spawnDirection(run: Run, heading?: Vec3, spread = 1.6) {
  const player = run.player;
  const dir = vec3();
  if (heading) {
    copy(dir, heading);
    rotateAbout(dir, player.n, (run.random() - 0.5) * spread);
  } else shardDirection(dir, run.right, player.n, run.random() * TAU);
  return normalize(projectTangent(dir, player.n));
}

function spawnPoint(
  run: Run,
  out: Vec3,
  at: number,
  heading?: Vec3,
  spread = 1.6
) {
  const dir = spawnDirection(run, heading, spread);
  return pointAt(out, run.player.n, dir, at / run.groundRadius);
}

/** Ground distance from the player, along tangent `dir`, that stays on screen. */
function onScreen(run: Run, dir: Vec3, inset = 0) {
  const x = dot(dir, run.right);
  const y = dot(dir, run.player.forward);
  const { view } = run;
  let edge = Infinity;
  if (x > 1e-6) edge = Math.min(edge, view.right / x);
  if (x < -1e-6) edge = Math.min(edge, -view.left / x);
  if (y > 1e-6) edge = Math.min(edge, view.up / y);
  if (y < -1e-6) edge = Math.min(edge, -view.down / y);
  return Math.max(SPAWN_MIN, edge - SPAWN_MARGIN - inset);
}

/** A point just inside the screen edge, so its breach is seen. */
function edgePoint(
  run: Run,
  out: Vec3,
  heading?: Vec3,
  spread = 1.6,
  inset = 0
) {
  const dir = spawnDirection(run, heading, spread);
  return pointAt(
    out,
    run.player.n,
    dir,
    onScreen(run, dir, inset) / run.groundRadius
  );
}

/** Spawn by breaching the Sector under `n`, by default just inside the screen edge. */
function breachEnemy(run: Run, kind: EnemyKind, n?: Vec3): Enemy {
  const enemy = spawnEnemy(run, kind, n ?? edgePoint(run, vec3()));
  emergeFrom(run, enemy);
  return enemy;
}

/** Center the enemy on the Sector under it, flip that Sector and hold the enemy below until it rises. */
function emergeFrom(run: Run, enemy: Enemy) {
  const sector = sectorAt(enemy.n);
  sectorCenter(enemy.n, sector);
  copy(enemy.prev, enemy.n);
  copy(
    enemy.heading,
    tangentToward(vec3(), enemy.n, run.player.n, enemy.heading)
  );
  const open = run.breaches.find((breach) => breach.sector === sector);
  // Join a Sector that is still open; the enemy still rises before it closes.
  if (open && open.age < BREACH.flip + BREACH.hold) {
    enemy.emerge = Math.max(BREACH.rise, BREACH_EMERGE - open.age);
    return;
  }
  if (open) run.breaches.splice(run.breaches.indexOf(open), 1);
  if (run.breaches.length < MAX_BREACHES) run.breaches.push({ sector, age: 0 });
  enemy.emerge = BREACH_EMERGE;
}

export function spawnEnemy(run: Run, kind: EnemyKind, n?: Vec3): Enemy {
  const spec = ENEMIES[kind];
  const position = n
    ? copy(vec3(), n)
    : spawnPoint(run, vec3(), SPAWN_DISTANCE);
  const scale = spec.boss
    ? (1 + 0.35 * run.wardens) * (1 + (0.1 * run.time) / 60)
    : run.healthScale;
  const hp = spec.hp * scale;
  const enemy: Enemy = {
    id: run.nextId++,
    kind,
    spec,
    n: position,
    prev: copy(vec3(), position),
    heading: tangentToward(vec3(), position, run.player.n, vec3(0, 1, 0)),
    hp,
    maxHp: hp,
    speed: spec.speed * (1 + Math.min(0.35, (run.time / 60) * 0.03)),
    knock: 0,
    knockFrom: vec3(),
    slow: 0,
    slowTime: 0,
    flash: 0,
    age: run.random() * 10,
    mode: 'walk',
    modeTime: 0,
    aim: vec3(),
    cooldown: 1 + run.random() * 2,
    cooldown2: 5,
    cooldown3: 8,
    strafe: run.random() < 0.5 ? 1 : -1,
    straight: false,
    travel: 0,
    maxTravel: 0,
    hitAt: {},
    emerge: 0,
    dead: false,
  };
  if (kind === 'volt') enemy.cooldown = 0;
  run.enemies.push(enemy);
  if (spec.boss) run.bosses.push(enemy);
  return enemy;
}

function pickKind(run: Run, minutes: number): EnemyKind {
  const weights: [EnemyKind, number][] = [['mite', 1]];
  if (minutes >= 0.75) weights.push(['skitter', 0.5]);
  if (minutes >= 1.75) weights.push(['lancer', 0.32]);
  if (minutes >= 2.5) weights.push(['bulwark', 0.16 + 0.02 * minutes]);
  if (minutes >= 4.25) weights.push(['volt', 0.28]);
  if (minutes >= 5.25) weights.push(['seeker', 0.3]);
  let total = 0;
  for (const [, weight] of weights) total += weight;
  let roll = run.random() * total;
  for (const [kind, weight] of weights) if ((roll -= weight) <= 0) return kind;
  return 'mite';
}

function director(run: Run, dt: number) {
  const minutes = run.time / 60;
  // Enemy health compounds from mid-run, so every run meets a wall; starting
  // early and gently makes it a climb rather than a cliff.
  run.healthScale =
    (1 + 0.32 * minutes + 0.045 * minutes * minutes) *
    Math.pow(HEALTH_RAMP.rate, Math.max(0, minutes - HEALTH_RAMP.from));
  let alive = 0;
  for (const enemy of run.enemies) if (!enemy.dead && !enemy.straight) alive++;
  const target =
    Math.min(380, Math.floor(8 + 16 * minutes + 2.2 * minutes * minutes)) *
    (run.bosses.length ? 0.6 : 1);
  run.spawnCredit += dt * (2.5 + 3.2 * minutes);
  while (run.spawnCredit >= 1) {
    run.spawnCredit -= 1;
    if (alive < target) {
      breachEnemy(run, pickKind(run, minutes));
      alive++;
    }
  }
  while (run.time >= scriptedEvent(run.eventIndex)[0])
    runEvent(run, scriptedEvent(run.eventIndex++)[1]);
}

/** A tangent direction at the player, `angle` from screen-right. */
function around(run: Run, angle: number) {
  return shardDirection(vec3(), run.right, run.player.n, angle);
}

/** Place a point by a flat offset (along, across) from the player in the direction `dir`. */
function offsetPoint(run: Run, dir: Vec3, along: number, across: number) {
  const n = run.player.n;
  const perp = cross(vec3(), n, dir);
  const v = vec3(
    dir.x * along + perp.x * across,
    dir.y * along + perp.y * across,
    dir.z * along + perp.z * across
  );
  const length = Math.hypot(v.x, v.y, v.z);
  return pointAt(vec3(), n, normalize(v), length / run.groundRadius);
}

function march(enemy: Enemy, dir: Vec3, speed: number, maxTravel: number) {
  copy(enemy.aim, dir);
  projectTangent(enemy.aim, enemy.n);
  normalize(enemy.aim);
  copy(enemy.heading, enemy.aim);
  enemy.straight = true;
  enemy.speed = speed;
  enemy.maxTravel = maxTravel;
}

function bulwarkLine(run: Run, dir: Vec3) {
  const span = 7.4;
  // Leave room for the authored shield and the spherical formation curve.
  const spacing = 0.6;
  const columns = Math.ceil(span / spacing);
  for (let row = 0; row < 3; row++)
    for (let column = 0; column < columns; column++) {
      const across = -span / 2 + column * spacing + (row % 2) * spacing * 0.5;
      const n = offsetPoint(run, dir, -(4.4 + row * 0.36), across);
      const enemy = spawnEnemy(run, 'bulwark', n);
      enemy.hp = enemy.maxHp = 30 * run.healthScale;
      march(enemy, dir, 0.35, 9.5);
    }
}

function seekerPack(run: Run, dir: Vec3, across: number) {
  for (let i = 0; i < 5; i++) {
    const n = offsetPoint(
      run,
      dir,
      -(4.8 + i * 0.32),
      across + (i % 2 ? 0.12 : -0.12)
    );
    const enemy = spawnEnemy(run, 'seeker', n);
    march(enemy, dir, 0, 11);
    enemy.mode = 'aim';
    enemy.modeTime = SEEKER_ATTACK.packWindup;
    if (i === 0)
      addEffect(run, {
        kind: 'aim',
        n: copy(vec3(), n),
        dir: copy(vec3(), enemy.aim),
        length: 10,
        age: 0,
        life: SEEKER_ATTACK.packWindup,
      });
  }
}

function encircle(run: Run, count: number, heavy: number) {
  const total = count + heavy;
  const every = heavy ? Math.ceil(total / heavy) : 0;
  // The ring traces the screen edge, so every breach is in view.
  for (let i = 0; i < total; i++) {
    const dir = around(run, (i / total) * TAU);
    const n = pointAt(
      vec3(),
      run.player.n,
      dir,
      onScreen(run, dir) / run.groundRadius
    );
    breachEnemy(run, heavy && i % every === 0 ? 'bulwark' : 'mite', n);
  }
}

export function runEvent(run: Run, id: EventId) {
  const [title, detail] = EVENT_BANNERS[id];
  banner(
    run,
    title,
    detail,
    id === 'warden' ? 'boss' : id.startsWith('captain') ? 'good' : 'danger'
  );
  switch (id) {
    case 'swarm': {
      const dir = around(run, run.random() * TAU);
      for (let i = 0; i < 20; i++)
        breachEnemy(
          run,
          'skitter',
          edgePoint(run, vec3(), dir, 0.9, run.random() * 0.5)
        );
      break;
    }
    case 'line':
    case 'lines': {
      const dir = around(run, Math.floor(run.random() * 4) * (Math.PI / 2));
      bulwarkLine(run, dir);
      if (id === 'lines') bulwarkLine(run, vec3(-dir.x, -dir.y, -dir.z));
      break;
    }
    case 'captain':
    case 'captains':
      for (let i = 0; i < (id === 'captains' ? 2 : 1); i++)
        breachEnemy(run, 'captain');
      break;
    case 'seekers':
    case 'seekerPacks': {
      const packs = id === 'seekers' ? 1 : 3;
      const base = around(run, run.random() * TAU);
      for (let p = 0; p < packs; p++) {
        const dir =
          p % 2 ? vec3(-base.x, -base.y, -base.z) : copy(vec3(), base);
        seekerPack(
          run,
          dir,
          packs === 1 ? (run.random() - 0.5) * 0.6 : (p - 1) * 1.6
        );
      }
      break;
    }
    case 'encircle':
      encircle(run, 40, 0);
      break;
    case 'encircleHeavy':
      encircle(run, 32, 8);
      break;
    case 'warden': {
      const n = edgePoint(run, vec3(), run.player.forward, 0);
      const warden = breachEnemy(run, 'warden', n);
      warden.cooldown = 3;
      warden.cooldown2 = 5;
      run.wardens++;
      break;
    }
  }
}

function fireHostile(
  run: Run,
  from: Enemy,
  dir: Vec3,
  speed: number,
  amount: number
) {
  const n = copy(vec3(), from.n);
  run.projectiles.push({
    n,
    prev: copy(vec3(), n),
    dir: copy(vec3(), dir),
    speed,
    life: 4,
    damage: amount,
    pierce: 0,
    hit: new Set(),
    from: from.kind,
  });
}

const toward = vec3();

/** Resolve motion and damage from the same authored attack clock. */
function updateBulwarkThrust(run: Run, enemy: Enemy, dt: number) {
  const attack = enemy.thrust!;
  const config = BULWARK_ATTACK;
  const from = attack.elapsed;
  attack.previousElapsed = from;
  attack.elapsed = Math.min(config.duration, from + dt);
  const travel = sampleBulwarkAttack(attack.elapsed)[0] * enemy.spec.scale;
  copy(enemy.n, attack.origin);
  copy(enemy.aim, attack.direction);
  stepAlong(enemy.n, enemy.aim, travel / run.groundRadius);
  copy(enemy.heading, enemy.aim);
  // A locked attack resists crowd separation/knockback until recovery ends.
  enemy.knock = 0;
  const start = Math.max(from, config.activeStart);
  const end = Math.min(attack.elapsed, config.activeEnd);
  if (!attack.hit && start < end) {
    const right = cross(vec3(), attack.origin, attack.direction);
    const local = (n: Vec3) => [
      Math.atan2(dot(n, right), dot(n, attack.origin)) * run.groundRadius,
      Math.atan2(dot(n, attack.direction), dot(n, attack.origin)) *
        run.groundRadius,
    ];
    const a = local(run.player.prev),
      b = local(run.player.n);
    const playerAt = (t: number) =>
      a.map((v, i) => v + ((b[i] - v) * (t - from)) / dt);
    // Split at authored keyframes, so even a long simulation step cannot tunnel.
    for (let t = start; t < end - 1e-9; ) {
      const next = Math.min(
        end,
        (Math.floor(t * config.fps + 1e-7) + 1) / config.fps
      );
      if (
        sweptShieldHit(
          sampleBulwarkAttack(t),
          sampleBulwarkAttack(next),
          playerAt(t),
          playerAt(next),
          enemy.spec.scale,
          PLAYER_RADIUS
        )
      ) {
        attack.hit = true;
        if (hurt(run, enemy.spec.damage * damageScale(run), 'bulwark'))
          // Thrown the way the charge was going, starting next tick.
          run.player.shove = {
            dir: normalize(
              projectTangent(copy(vec3(), enemy.aim), run.player.n)
            ),
            speed: config.knockback * config.knockbackDecay,
          };
        break;
      }
      t = next;
    }
  }
  if (attack.elapsed >= config.duration) {
    enemy.thrust = undefined;
    enemy.mode = 'walk';
    enemy.cooldown = config.cooldown + run.random() * 0.5;
  }
}

/** A moving Bulwark clears a path after every enemy has taken its movement step. */
function displaceBulwarkCrowds(run: Run, dt: number) {
  let displaced = false;
  for (const charger of run.enemies) {
    const attack = charger.thrust;
    if (charger.dead || !attack) continue;
    const start = Math.max(attack.previousElapsed, BULWARK_ATTACK.driveStart);
    const end = Math.min(attack.elapsed, BULWARK_ATTACK.driveEnd);
    if (start >= end) continue;
    const right = cross(vec3(), attack.origin, attack.direction);
    const local = (n: Vec3) => [
      Math.atan2(dot(n, right), dot(n, attack.origin)) * run.groundRadius,
      Math.atan2(dot(n, attack.direction), dot(n, attack.origin)) *
        run.groundRadius,
    ];
    const boundsAt = (time: number) => {
      const bounds = sampleBulwarkAttack(time).map(
        (v) => v * charger.spec.scale
      );
      // Sweep both the shield and torso so units on either side are displaced.
      bounds[1] = Math.min(bounds[1], -charger.spec.radius);
      bounds[2] = Math.max(bounds[2], charger.spec.radius);
      bounds[3] = Math.min(bounds[3], bounds[0] - charger.spec.radius);
      bounds[4] = Math.max(bounds[4], bounds[0] + charger.spec.radius);
      return bounds;
    };
    for (const other of run.enemies) {
      if (
        other === charger ||
        other.dead ||
        other.emerge > 0 ||
        other.spec.boss ||
        other.thrust ||
        other.leap
      )
        continue;
      const a = local(other.prev),
        b = local(other.n);
      const positionAt = (time: number) =>
        a.map(
          (v, i) =>
            v +
            (b[i] - v) *
              Math.min(1, Math.max(0, (time - attack.previousElapsed) / dt))
        );
      for (let time = start; time < end - 1e-9; ) {
        const next = Math.min(
          end,
          (Math.floor(time * BULWARK_ATTACK.fps + 1e-7) + 1) /
            BULWARK_ATTACK.fps
        );
        const before = boundsAt(time),
          after = boundsAt(next);
        if (
          sweptShieldHit(
            before,
            after,
            positionAt(time),
            positionAt(next),
            1,
            other.spec.radius
          )
        ) {
          const left = Math.min(before[1], after[1]);
          const rightEdge = Math.max(before[2], after[2]);
          const center = (left + rightEdge) / 2;
          const side =
            b[0] === center
              ? other.id % 2
                ? 1
                : -1
              : Math.sign(b[0] - center);
          const edge =
            side < 0
              ? left - other.spec.radius - 0.025
              : rightEdge + other.spec.radius + 0.025;
          const travel =
            Math.max(0, side * (edge - b[0])) / Math.sqrt(other.spec.mass);
          if (travel > 0) {
            const push = normalize(
              projectTangent(copy(vec3(), right), other.n)
            );
            const axis = normalize(cross(vec3(), other.n, push));
            const arc = (side * travel) / run.groundRadius;
            for (const v of [other.n, other.heading, other.aim])
              rotateAbout(v, axis, arc);
            displaced = true;
          }
          break;
        }
        time = next;
      }
    }
  }
  // Separation and projectile queries must see the displaced positions this tick.
  if (displaced) buildGrid(run);
}

/** Returns the enemy's walking velocity along `toward` (world units per second). */
function behave(run: Run, enemy: Enemy, dt: number, gap: number): number {
  const player = run.player;
  const pace =
    enemy.speed *
    (enemy.slowTime > 0 ? 1 - enemy.slow * (enemy.spec.boss ? 0.5 : 1) : 1);
  switch (enemy.kind) {
    case 'bulwark': {
      if (enemy.thrust) {
        updateBulwarkThrust(run, enemy, dt);
        return 0;
      }
      enemy.cooldown -= dt;
      if (enemy.cooldown <= 0 && gap <= BULWARK_ATTACK.triggerRange) {
        const bounds = bulwarkWarningBounds(enemy.spec.scale);
        copy(enemy.aim, toward);
        if (dot(enemy.aim, enemy.aim) < 0.5) copy(enemy.aim, enemy.heading);
        // Aim the shield, which is carried left of center, at the player.
        rotateAbout(
          enemy.aim,
          enemy.n,
          -Math.atan2((bounds.left + bounds.right) / 2, Math.max(gap, 0.2))
        );
        enemy.mode = 'thrust';
        enemy.thrust = {
          origin: copy(vec3(), enemy.n),
          direction: copy(vec3(), enemy.aim),
          elapsed: 0,
          previousElapsed: 0,
          hit: false,
        };
        enemy.knock = 0;
        copy(enemy.heading, enemy.aim);
        return 0;
      }
      enemy.mode = 'walk';
      return pace;
    }
    case 'lancer':
    case 'captain': {
      if (enemy.kind === 'lancer') enemy.mode = 'walk';
      if (enemy.mode === 'aim') {
        enemy.modeTime -= dt;
        if (enemy.modeTime <= 0) {
          enemy.mode = 'walk';
          const shots = enemy.kind === 'captain' ? 3 : 1;
          for (let i = 0; i < shots; i++) {
            copy(direction, enemy.aim);
            rotateAbout(direction, enemy.n, (i - (shots - 1) / 2) * 0.16);
            fireHostile(run, enemy, direction, 1.36, 4 * damageScale(run));
          }
        }
        return 0;
      }
      enemy.cooldown -= dt;
      if (enemy.cooldown <= 0 && gap < 2.1) {
        if (enemy.kind === 'lancer') {
          // Fold the old windup into cooldown to preserve the firing cadence.
          enemy.cooldown = 3.2 + run.random();
          fireHostile(run, enemy, toward, 1.36, 4 * damageScale(run));
          return 0;
        }
        enemy.cooldown = 2.2 + run.random();
        enemy.mode = 'aim';
        enemy.modeTime = 0.5;
        copy(enemy.aim, toward);
        addEffect(run, {
          kind: 'aim',
          n: copy(vec3(), enemy.n),
          dir: copy(vec3(), toward),
          length: Math.min(gap, 2.2),
          age: 0,
          life: enemy.modeTime,
        });
        return 0;
      }
      if (gap > 1.5) return pace;
      if (gap < 1) return -pace;
      // Strafe: turn the heading sideways for this step.
      rotateAbout(toward, enemy.n, (Math.PI / 2) * enemy.strafe);
      return pace * 0.6;
    }
    case 'seeker': {
      if (enemy.mode === 'aim') {
        enemy.modeTime -= dt;
        if (enemy.modeTime <= 0) {
          enemy.mode = 'charge';
          enemy.modeTime = enemy.straight
            ? SEEKER_ATTACK.packDrive
            : SEEKER_ATTACK.drive;
        }
        copy(toward, enemy.aim);
        return 0;
      }
      if (enemy.mode === 'charge') {
        enemy.modeTime -= dt;
        stepAlong(
          enemy.n,
          enemy.aim,
          (SEEKER_ATTACK.speed * dt) / run.groundRadius
        );
        copy(enemy.heading, enemy.aim);
        enemy.travel += SEEKER_ATTACK.speed * dt;
        if (enemy.modeTime <= 0) {
          enemy.mode = 'recover';
          enemy.modeTime = SEEKER_ATTACK.recover;
        }
        copy(toward, enemy.aim);
        return 0;
      }
      if (enemy.mode === 'recover') {
        enemy.modeTime -= dt;
        if (enemy.modeTime <= 0) enemy.mode = 'walk';
        return 0;
      }
      enemy.cooldown -= dt;
      if (gap < SEEKER_ATTACK.trigger && enemy.cooldown <= 0) {
        enemy.cooldown = SEEKER_ATTACK.cooldown;
        enemy.mode = 'aim';
        enemy.modeTime = SEEKER_ATTACK.windup;
        copy(enemy.aim, toward);
        copy(enemy.heading, enemy.aim);
        addEffect(run, {
          kind: 'aim',
          n: copy(vec3(), enemy.n),
          dir: copy(vec3(), toward),
          length: 3.2,
          age: 0,
          life: SEEKER_ATTACK.windup,
        });
        return 0;
      }
      return pace;
    }
    case 'volt': {
      if (enemy.leap) {
        const attack = enemy.leap;
        attack.previousElapsed = attack.elapsed;
        attack.elapsed = Math.min(VOLT_END_TIME, attack.elapsed + dt);
        const travel =
          sampleVoltLeap(voltLeapClipTime(attack.elapsed)).progress *
          attack.distance;
        copy(enemy.n, attack.origin);
        copy(enemy.aim, attack.direction);
        stepAlong(enemy.n, enemy.aim, travel / run.groundRadius);
        copy(enemy.heading, enemy.aim);
        enemy.knock = 0;
        if (!attack.impacted && attack.elapsed >= VOLT_IMPACT_TIME) {
          attack.impacted = true;
          if (
            distance(run, run.player.n, enemy.n) <
            enemy.spec.radius + PLAYER_RADIUS + VOLT_LEAP.hitReach
          )
            hurt(run, VOLT_LEAP.damage * damageScale(run), 'volt');
        }
        if (attack.elapsed >= VOLT_END_TIME) {
          enemy.leap = undefined;
          enemy.mode = 'walk';
          enemy.cooldown = VOLT_LEAP.cooldown;
        }
        return 0;
      }
      enemy.cooldown -= dt;
      if (gap < VOLT_LEAP.trigger && enemy.cooldown <= 0) {
        enemy.mode = 'leap';
        copy(enemy.aim, toward);
        copy(enemy.heading, toward);
        enemy.knock = 0;
        enemy.leap = {
          origin: copy(vec3(), enemy.n),
          direction: copy(vec3(), toward),
          // Convert chord distance to surface travel so the landing meets the target.
          distance: Math.min(
            VOLT_LEAP.maxDistance,
            2 *
              run.groundRadius *
              Math.asin(Math.min(1, gap / (2 * run.groundRadius)))
          ),
          impacted: false,
          elapsed: VOLT_LEAP.start,
          previousElapsed: VOLT_LEAP.start,
        };
        return 0;
      }
      return pace;
    }
    case 'warden': {
      enemy.cooldown -= dt;
      enemy.cooldown2 -= dt;
      enemy.cooldown3 -= dt;
      if (enemy.slam) {
        const attack = enemy.slam;
        attack.previousElapsed = attack.elapsed;
        attack.elapsed = Math.min(WARDEN_SLAM.duration, attack.elapsed + dt);
        copy(toward, enemy.aim);
        if (!attack.impacted && attack.elapsed >= WARDEN_SLAM.impact) {
          attack.impacted = true;
          addEffect(run, {
            kind: 'blast',
            n: copy(vec3(), attack.origin),
            radius: WARDEN_SLAM.radius,
            tone: 'warden',
            age: 0,
            life: 0.3,
          });
          set(
            offset,
            player.n.x - attack.origin.x,
            player.n.y - attack.origin.y,
            player.n.z - attack.origin.z
          );
          const reach = distance(run, player.n, attack.origin);
          const facing =
            reach > 0.001
              ? dot(
                  normalize(projectTangent(offset, attack.origin)),
                  attack.direction
                )
              : 1;
          if (
            reach < WARDEN_SLAM.radius + PLAYER_RADIUS &&
            facing > Math.cos(WARDEN_SLAM.halfAngle)
          )
            hurt(run, WARDEN_SLAM.damage * damageScale(run), 'warden');
        }
        if (attack.elapsed >= WARDEN_SLAM.duration) {
          enemy.slam = undefined;
          enemy.mode = 'walk';
        }
        return 0;
      }
      if (enemy.cooldown <= 0 && gap < WARDEN_SLAM.triggerRange) {
        enemy.cooldown = WARDEN_SLAM.cooldown;
        enemy.mode = 'slam';
        copy(enemy.aim, toward);
        copy(enemy.heading, toward);
        const origin = wardenSlamOrigin(
          vec3(),
          enemy.n,
          enemy.aim,
          enemy.spec.scale,
          run.groundRadius
        );
        const direction = normalize(
          projectTangent(copy(vec3(), enemy.aim), origin)
        );
        enemy.slam = {
          origin,
          direction,
          elapsed: 0,
          previousElapsed: 0,
          impacted: false,
        };
        addEffect(run, {
          kind: 'cone',
          enemyId: enemy.id,
          n: copy(vec3(), origin),
          dir: copy(vec3(), direction),
          radius: WARDEN_SLAM.radius,
          spread: WARDEN_SLAM.halfAngle,
          age: 0,
          life: WARDEN_SLAM.impact,
        });
        return 0;
      }
      if (enemy.cooldown2 <= 0) {
        enemy.cooldown2 = 2.8;
        const start = run.random() * TAU;
        for (let i = 0; i < 14; i++) {
          copy(direction, toward);
          rotateAbout(direction, enemy.n, start + (i / 14) * TAU);
          fireHostile(run, enemy, direction, 1.1, 8 * damageScale(run));
        }
      }
      if (enemy.cooldown3 <= 0) {
        enemy.cooldown3 = 8;
        for (let i = 0; i < 6; i++) {
          copy(direction, toward);
          rotateAbout(direction, enemy.n, (i / 6) * TAU);
          breachEnemy(
            run,
            'mite',
            pointAt(vec3(), enemy.n, direction, 0.42 / run.groundRadius)
          );
        }
      }
      return gap > WARDEN_GAIT.runDistance
        ? pace
        : Math.min(
            pace,
            WARDEN_GAIT.walkSpeed *
              enemy.spec.scale *
              (enemy.slowTime > 0 ? 1 - enemy.slow * 0.5 : 1)
          );
    }
    default:
      return pace;
  }
}

function updateEnemies(run: Run, dt: number) {
  const player = run.player;
  const radius = run.groundRadius;
  const scale = damageScale(run);
  for (const enemy of run.enemies) {
    if (enemy.dead) continue;
    copy(enemy.prev, enemy.n);
    enemy.age += dt;
    if (enemy.emerge > 0) {
      enemy.emerge = Math.max(0, enemy.emerge - dt);
      continue;
    }
    if (enemy.flash > 0) enemy.flash -= dt;
    if (enemy.slowTime > 0) enemy.slowTime -= dt;
    if (enemy.straight && enemy.kind !== 'seeker') {
      const step = enemy.speed * dt;
      stepAlong(enemy.n, enemy.aim, step / radius);
      copy(enemy.heading, enemy.aim);
      enemy.travel += step;
    } else {
      tangentToward(toward, enemy.n, player.n, enemy.heading);
      const gap = distance(run, enemy.n, player.n);
      const velocity = enemy.dead ? 0 : behave(run, enemy, dt, gap);
      if (enemy.dead) continue;
      if (velocity !== 0) {
        if (velocity < 0) set(toward, -toward.x, -toward.y, -toward.z);
        stepAlong(enemy.n, toward, (Math.abs(velocity) * dt) / radius);
        if (velocity > 0) copy(enemy.heading, toward);
      } else if (
        enemy.mode !== 'charge' &&
        enemy.mode !== 'thrust' &&
        enemy.mode !== 'leap' &&
        enemy.mode !== 'slam'
      )
        copy(enemy.heading, toward);
      if (enemy.knock > 0.01 && !enemy.thrust && !enemy.slam && !enemy.leap) {
        tangentToward(toward, enemy.n, enemy.knockFrom, enemy.heading);
        set(toward, -toward.x, -toward.y, -toward.z);
        stepAlong(enemy.n, toward, (enemy.knock * dt) / radius);
        enemy.knock *= Math.exp(-8 * dt);
      }
    }
    if (enemy.straight && enemy.travel > enemy.maxTravel) {
      enemy.dead = true;
      continue;
    }
    const gap = distance(run, enemy.n, player.n);
    if (!enemy.straight && !enemy.spec.boss && gap > RECYCLE_DISTANCE) {
      edgePoint(run, enemy.n, player.moving ? player.heading : undefined);
      enemy.mode = 'walk';
      enemy.thrust = undefined;
      enemy.leap = undefined;
      emergeFrom(run, enemy);
      continue;
    }
    if (
      enemy.spec.damage > 0 &&
      (!enemy.leap || enemy.leap.impacted) &&
      gap < enemy.spec.radius + PLAYER_RADIUS
    )
      hurt(run, enemy.spec.damage * scale, enemy.kind);
  }
  displaceBulwarkCrowds(run, dt);
  // Soft separation, so a crowd reads as a crowd.
  for (const enemy of run.enemies) {
    if (
      enemy.dead ||
      enemy.emerge > 0 ||
      enemy.straight ||
      enemy.spec.boss ||
      enemy.thrust ||
      enemy.leap
    )
      continue;
    let pushes = 0;
    for (const other of nearby(run, enemy.n, 0.45)) {
      if (other === enemy || other.dead || other.leap) continue;
      const overlap =
        (enemy.spec.radius + other.spec.radius) / radius -
        chord(enemy.n, other.n);
      if (overlap <= 0) continue;
      tangentToward(toward, other.n, enemy.n);
      if (toward.x === 0 && toward.y === 0 && toward.z === 0) continue;
      stepAlong(
        enemy.n,
        toward,
        overlap * (other.spec.mass > enemy.spec.mass ? 0.7 : 0.4)
      );
      if (++pushes > 6) break;
    }
  }
}

// ---------- Projectiles, burns and pickups ----------

function updateProjectiles(run: Run, dt: number) {
  const radius = run.groundRadius;
  const player = run.player;
  for (const shot of run.projectiles) {
    copy(shot.prev, shot.n);
    stepAlong(shot.n, shot.dir, (shot.speed * dt) / radius);
    shot.life -= dt;
    if (shot.life <= 0) continue;
    if (shot.from) {
      if (distance(run, shot.n, player.n) < PLAYER_RADIUS + 0.04) {
        hurt(run, shot.damage, shot.from);
        shot.life = 0;
      }
      continue;
    }
    for (const enemy of nearby(run, shot.n, 0.35)) {
      if (enemy.dead || shot.hit.has(enemy.id)) continue;
      if (distance(run, enemy.n, shot.n) < enemy.spec.radius + 0.05) {
        shot.hit.add(enemy.id);
        damage(run, enemy, shot.damage, 'bolts', 0.5, player.n);
        if (shot.pierce-- <= 0) {
          shot.life = 0;
          break;
        }
      }
    }
  }
  run.projectiles = run.projectiles.filter((shot) => shot.life > 0);
  for (const lob of run.lobs) {
    lob.age += dt;
    if (lob.age >= lob.life) {
      run.zones.push({
        n: copy(vec3(), lob.to),
        radius: lob.radius,
        age: 0,
        life: lob.burn,
        damage: lob.damage,
        tick: 0,
      });
      cue(run, 'ignite', lob.to);
      addEffect(run, {
        kind: 'blast',
        n: copy(vec3(), lob.to),
        radius: lob.radius,
        tone: 'fire',
        age: 0,
        life: 0.25,
      });
    }
  }
  run.lobs = run.lobs.filter((lob) => lob.age < lob.life);
  for (const zone of run.zones) {
    zone.age += dt;
    zone.tick -= dt;
    if (zone.tick > 0) continue;
    zone.tick = 0.3;
    for (const enemy of nearby(run, zone.n, zone.radius + 0.3))
      if (
        !enemy.dead &&
        distance(run, enemy.n, zone.n) < zone.radius + enemy.spec.radius * 0.5
      )
        damage(run, enemy, zone.damage, 'charge');
  }
  run.zones = run.zones.filter((zone) => zone.age < zone.life);
}

function updatePickups(run: Run, dt: number) {
  const player = run.player;
  const radius = run.groundRadius;
  for (const gem of run.gems) {
    copy(gem.prev, gem.n);
    const gap = distance(run, gem.n, player.n);
    if (!gem.pulled) {
      if (gap > player.magnet) continue;
      gem.pulled = true;
    }
    gem.speed += 8 * dt;
    stepToward(gem.n, player.n, (gem.speed * dt) / radius);
    if (distance(run, gem.n, player.n) < 0.1) {
      gem.dead = true;
      player.xp += gem.value;
      cue(run, 'shard');
    }
  }
  run.gems = run.gems.filter((gem) => !gem.dead);
  while (player.xp >= player.xpNext) {
    player.xp -= player.xpNext;
    player.level++;
    player.xpNext = xpForLevel(player.level);
    run.pendingLevels++;
  }
  for (const item of run.items) {
    copy(item.prev, item.n);
    item.age += dt;
    const gap = distance(run, item.n, player.n);
    if (item.kind !== 'drop' && gap < player.magnet * 0.8)
      stepToward(item.n, player.n, (1.9 * dt) / radius);
    if (distance(run, item.n, player.n) < 0.18) {
      item.dead = true;
      collect(run, item);
    }
  }
  run.items = run.items.filter((item) => !item.dead);
}

function collect(run: Run, item: Item) {
  if (item.kind === 'repair') {
    heal(run, 30, 'repair');
    addText(run, run.player.n, 30, false);
  } else if (item.kind === 'tractor') {
    for (const gem of run.gems) gem.pulled = true;
    banner(run, 'Tractor pulse', 'Every shard is on its way to you.', 'good');
  } else if (item.kind === 'emp') {
    for (const enemy of visibleEnemies(run))
      damage(run, enemy, 200 * run.healthScale * 0.5, null);
    addEffect(run, { kind: 'emp', age: 0, life: 0.35 });
    run.shake = 0.5;
  } else run.pendingDrops.push(item.big ? 3 : 1);
}

// ---------- Level-ups and Supply Drops ----------

function evolvable(run: Run) {
  return run.weapons.find(
    (w) =>
      !w.evolved && w.level >= 5 && (run.systems[WEAPONS[w.id].pair] ?? 0) > 0
  );
}

export function makeOffers(run: Run, count: number): Offer[] {
  const pool: { offer: Offer; weight: number }[] = [];
  for (const w of run.weapons) {
    if (!w.evolved && w.level >= 5 && run.systems[WEAPONS[w.id].pair])
      pool.push({ offer: { kind: 'evolution', id: w.id }, weight: 6 });
    if (!w.evolved && w.level < 5)
      pool.push({
        offer: { kind: 'weapon', id: w.id, isNew: false },
        weight: 1.3,
      });
  }
  if (run.weapons.length < 6)
    for (const id of Object.keys(WEAPONS) as WeaponId[])
      if (!run.weapons.some((w) => w.id === id))
        pool.push({ offer: { kind: 'weapon', id, isNew: true }, weight: 0.9 });
  const owned = Object.keys(run.systems).length;
  for (const id of Object.keys(SYSTEMS) as SystemId[]) {
    const level = run.systems[id] ?? 0;
    if (level > 0 && level < 5)
      pool.push({ offer: { kind: 'system', id, isNew: false }, weight: 1 });
    else if (!level && owned < 6)
      pool.push({ offer: { kind: 'system', id, isNew: true }, weight: 0.8 });
  }
  const offers: Offer[] = [];
  while (offers.length < count && pool.length) {
    let total = 0;
    for (const entry of pool) total += entry.weight;
    let roll = run.random() * total;
    let index = 0;
    for (; index < pool.length - 1; index++)
      if ((roll -= pool[index].weight) <= 0) break;
    offers.push(pool.splice(index, 1)[0].offer);
  }
  if (!offers.length) offers.push({ kind: 'repair' }, { kind: 'sharpen' });
  return offers;
}

export function applyOffer(run: Run, offer: Offer) {
  switch (offer.kind) {
    case 'weapon': {
      const weapon = run.weapons.find((w) => w.id === offer.id);
      if (weapon) weapon.level++;
      else run.weapons.push(newWeapon(offer.id));
      break;
    }
    case 'system':
      run.systems[offer.id] = (run.systems[offer.id] ?? 0) + 1;
      recalc(run);
      break;
    case 'evolution': {
      const weapon = run.weapons.find((w) => w.id === offer.id);
      if (weapon) weapon.evolved = true;
      banner(run, WEAPONS[offer.id].evolution, 'Weapon evolved.', 'good');
      break;
    }
    case 'repair':
      heal(run, 40, 'offer');
      break;
    case 'sharpen':
      run.player.bonusMight += 0.04;
      break;
  }
}

/** Open the next Supply Drop or level-up, if any; the run waits on the player. */
function resumeFlow(run: Run) {
  if (run.status !== 'playing') return;
  const drop = run.pendingDrops.shift();
  if (drop !== undefined) {
    run.supply = [];
    for (let i = 0; i < drop; i++) {
      const ready = evolvable(run);
      const offer: Offer = ready
        ? { kind: 'evolution', id: ready.id }
        : makeOffers(run, 1)[0];
      applyOffer(run, offer);
      run.supply.push(offer);
    }
    run.status = 'supply';
    return;
  }
  if (run.pendingLevels > 0) {
    run.pendingLevels--;
    run.offers = makeOffers(run, 3);
    run.status = 'choosing';
    cue(run, 'levelup');
  }
}

export function chooseOffer(run: Run, index: number) {
  if (run.status !== 'choosing' || !run.offers[index]) return;
  applyOffer(run, run.offers[index]);
  run.offers = [];
  run.status = 'playing';
  resumeFlow(run);
}

export function rerollOffers(run: Run) {
  if (run.status !== 'choosing' || run.rerolls <= 0) return;
  run.rerolls--;
  run.offers = makeOffers(run, 3);
}

export function closeSupply(run: Run) {
  if (run.status !== 'supply') return;
  run.supply = [];
  run.status = 'playing';
  resumeFlow(run);
}

// ---------- Player ----------

const travel = vec3();
const axis = vec3();

/** Turn the player, and everything that travels in its frame, about `axis`. */
function carryPlayer(player: Player, axis: Vec3, arc: number) {
  rotateAbout(player.n, axis, arc);
  rotateAbout(player.forward, axis, arc);
  rotateAbout(player.heading, axis, arc);
  if (player.saberAttack) rotateAbout(player.saberAttack.forward, axis, arc);
  if (player.boltShot) rotateAbout(player.boltShot.forward, axis, arc);
  normalize(player.n);
  normalize(projectTangent(player.forward, player.n));
  normalize(projectTangent(player.heading, player.n));
}

function updatePlayer(run: Run, dt: number, input: MoveInput) {
  const player = run.player;
  copy(player.prev, player.n);
  copy(player.prevForward, player.forward);
  let x = input.x;
  let y = input.y;
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }
  player.moving = length > 0.1;
  if (player.moving) {
    const right = run.right;
    set(
      travel,
      right.x * x + player.forward.x * y,
      right.y * x + player.forward.y * y,
      right.z * x + player.forward.z * y
    );
    const strength = Math.hypot(travel.x, travel.y, travel.z);
    normalize(travel);
    copy(player.heading, travel);
    // Rotating about normal × travel moves the player along `travel` and
    // carries screen-up with it, so the view never spins.
    normalize(cross(axis, player.n, travel));
    const arc =
      (PLAYER_SPEED * player.speedScale * strength * dt) / run.groundRadius;
    carryPlayer(player, axis, arc);
  }
  const shove = player.shove;
  if (shove) {
    // Thrown along a great circle, carrying the shove's direction with it.
    // Travel exactly as far as the decaying speed covers this step, so the
    // whole throw is the same length at any frame rate.
    const decay = Math.exp(-BULWARK_ATTACK.knockbackDecay * dt);
    const distance =
      (shove.speed * (1 - decay)) / BULWARK_ATTACK.knockbackDecay;
    normalize(cross(axis, player.n, shove.dir));
    const arc = distance / run.groundRadius;
    carryPlayer(player, axis, arc);
    rotateAbout(shove.dir, axis, arc);
    normalize(projectTangent(shove.dir, player.n));
    shove.speed *= decay;
    if (shove.speed < 0.05) player.shove = undefined;
  }
  playerRight(run.right, player);
  if (player.invulnerable > 0) player.invulnerable -= dt;
  if (player.regen > 0) heal(run, player.regen * dt, 'regen');
}

// ---------- Tick ----------

export function tick(run: Run, dt: number, input: MoveInput) {
  if (run.status !== 'playing') return;
  run.time += dt;
  for (const body of run.defeatedEnemies) {
    body.previousAge = body.age;
    body.age += dt;
  }
  run.defeatedEnemies = run.defeatedEnemies.filter(
    (body) => body.age < enemyDefeatTiming(body.spec.model).lifetime
  );
  updatePlayer(run, dt, input);
  director(run, dt);
  for (let i = run.timers.length - 1; i >= 0; i--) {
    const timer = run.timers[i];
    if (timer.at > run.time) continue;
    run.timers.splice(i, 1);
    buildGrid(run);
    timer.run();
  }
  buildGrid(run);
  for (const weapon of run.weapons) WEAPON_UPDATES[weapon.id](run, weapon, dt);
  updateProjectiles(run, dt);
  if (run.player.hp <= 0) return;
  updateEnemies(run, dt);
  if (run.player.hp <= 0) return;
  updatePickups(run, dt);
  run.enemies = run.enemies.filter((enemy) => !enemy.dead);
  for (const effect of run.effects) {
    effect.age =
      effect.kind === 'cone'
        ? (run.enemies.find(
            (enemy) => enemy.id === effect.enemyId && !enemy.dead
          )?.slam?.elapsed ?? effect.life)
        : effect.age + dt;
  }
  run.effects = run.effects.filter((effect) => effect.age < effect.life);
  for (const breach of run.breaches) breach.age += dt;
  run.breaches = run.breaches.filter((breach) => breach.age < BREACH_LIFE);
  for (const ripple of run.ripples) ripple.age += dt;
  run.ripples = run.ripples.filter(
    (ripple) => ripple.age < rippleLife(ripple.strength)
  );
  for (const text of run.texts) text.age += dt;
  run.texts = run.texts.filter((text) => text.age < 0.7);
  if (run.banner && (run.banner.age += dt) > 2.8) run.banner = null;
  if (run.shake > 0) run.shake -= dt;
  if (run.hurtFlash > 0) run.hurtFlash -= dt;
  resumeFlow(run);
}
