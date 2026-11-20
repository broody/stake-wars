import type { EnemyModel } from './content';
import { ENEMY_DEFEAT } from './enemyDefeat';
import type { DefeatedEnemy } from './sim';
import { set, type Vec3 } from './sphere';

/**
 * Electrical arcs that crawl over an enemy as it dies. Each arc is a short
 * jagged line that grows a few steps across the body, then jumps elsewhere.
 * Arcs follow from the enemy's id and its time since death, so they keep no
 * state.
 */
export const DEATH_ARCS = {
  /** Seconds the body crackles. */
  life: 0.7,
  /** Arcs alive at once on a body; Bulwarks, Captains and Wardens carry more. */
  arcs: 3,
  heavyArcs: 6,
  /** Segments an arc grows before it jumps. */
  steps: 5,
  /** Seconds one arc takes to grow, varied 0.75×–1.25× per arc. */
  cycle: 0.12,
  /** Step length as a fraction of the body's largest half-extent. */
  stride: 0.45,
  /** Arcs ride just outside the body's bounds, 1×–1.2× their size. */
  skin: 1,
  skinSpread: 0.2,
  /**
   * Longest step and furthest ride off the body, in world units, so big
   * bodies crackle at the scale of a Mite instead of growing with the body.
   */
  maxStride: 0.07,
  maxLift: 0.03,
  /** Segments drawn at once; the newest deaths win beyond it. */
  capacity: 1024,
};

/**
 * Standing bounds of each authored model in model units: half width (X),
 * height (Y, from the soles) and half depth (Z), from each asset's stats.
 */
const BODY: Record<
  EnemyModel,
  { halfWidth: number; height: number; halfDepth: number }
> = {
  mite: { halfWidth: 0.46, height: 0.62, halfDepth: 0.44 },
  lancer: { halfWidth: 0.47, height: 1.92, halfDepth: 0.25 },
  bulwark: { halfWidth: 1.84, height: 2.22, halfDepth: 0.42 },
  seeker: { halfWidth: 0.93, height: 1.93, halfDepth: 1.65 },
  warden: { halfWidth: 0.7, height: 3.6, halfDepth: 0.5 },
};

export function arcCount(body: DefeatedEnemy) {
  return body.spec.mass > 1 ? DEATH_ARCS.heavyArcs : DEATH_ARCS.arcs;
}

/** A repeatable value in [0, 1). */
function hash(seed: number) {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Put `p` on a skin around the body, along the direction it already points
 * from the body's middle. The skin sinks as the body collapses.
 */
function onSkin(p: Vec3, model: EnemyModel, sag: number, depth: number) {
  const box = BODY[model];
  const middle = (box.height * sag) / 2;
  const x = p.x / box.halfWidth;
  const y = (p.y - middle) / middle;
  const z = p.z / box.halfDepth;
  const scale = depth / (Math.hypot(x, y, z) || 1);
  return set(
    p,
    x * scale * box.halfWidth,
    Math.max(0.02 * box.height, middle + y * scale * middle),
    z * scale * box.halfDepth
  );
}

/**
 * Model-space points of arc `slot` on a body `age` seconds after death,
 * written into `out` (which needs `steps + 1` entries). Returns how many
 * points are lit, from the arc's start to its growing head, or 0 once the
 * body has stopped crackling.
 */
export function traceArc(
  out: Vec3[],
  body: DefeatedEnemy,
  slot: number,
  age: number
) {
  if (age < 0 || age >= DEATH_ARCS.life) return 0;
  const model = body.spec.model;
  const box = BODY[model];
  const base = Math.imul(body.id, 977) + slot * 131;
  const period = DEATH_ARCS.cycle * (0.75 + 0.5 * hash(base));
  const time = age + hash(base + 1) * period;
  const cycle = Math.floor(time / period);
  const phase = time / period - cycle;
  const segments = Math.min(
    DEATH_ARCS.steps,
    1 + Math.floor(phase * DEATH_ARCS.steps)
  );
  const sag = 1 - 0.4 * Math.min(1, age / ENEMY_DEFEAT.duration);
  const extent = Math.max(box.halfWidth, box.height / 2, box.halfDepth);
  const scale = body.spec.scale;
  const stride = Math.min(
    DEATH_ARCS.stride * extent,
    DEATH_ARCS.maxStride / scale
  );
  const lift = Math.min(
    DEATH_ARCS.skinSpread,
    DEATH_ARCS.maxLift / (scale * extent)
  );
  let seed = Math.imul(base, 7919) + Math.imul(cycle, 104729);
  const random = () => hash(seed++);
  // Start anywhere on the skin, then walk across it in jagged steps.
  set(
    out[0],
    (random() * 2 - 1) * box.halfWidth,
    random() * box.height * sag,
    (random() * 2 - 1) * box.halfDepth
  );
  onSkin(out[0], model, sag, DEATH_ARCS.skin + random() * lift);
  for (let i = 1; i <= segments; i++)
    onSkin(
      set(
        out[i],
        out[i - 1].x + (random() * 2 - 1) * stride,
        out[i - 1].y + (random() * 2 - 1) * stride,
        out[i - 1].z + (random() * 2 - 1) * stride
      ),
      model,
      sag,
      DEATH_ARCS.skin + random() * lift
    );
  return segments + 1;
}

/** How brightly a body's arcs burn: a hard flash that crackles and dies. */
export function arcGlow(body: DefeatedEnemy, slot: number, age: number) {
  if (age < 0 || age >= DEATH_ARCS.life) return 0;
  const k = age / DEATH_ARCS.life;
  const flicker = hash(
    Math.imul(body.id, 31) + slot * 7 + Math.floor(age * 40)
  );
  return (1 - k * k) * (0.55 + 0.45 * flicker);
}
