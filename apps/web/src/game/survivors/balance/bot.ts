/**
 * A scripted player for balance runs. It is not meant to play like a person,
 * only to play the same way every time, so changes to the game show up as
 * changes in how long it lasts. It kites away from contact and hostile fire,
 * steps off marked paths, and collects shards and pickups while it is safe.
 */
import {
  chooseOffer,
  closeSupply,
  playerRight,
  type MoveInput,
  type Offer,
  type Run,
} from '../sim';
import { PAIRED_WEAPON, WEAPONS } from '../content';
import { vec3, type Vec3 } from '../sphere';

export type OfferPolicy = 'greedy' | 'random' | 'first';

const right = vec3();

function local(run: Run, n: Vec3): [number, number] {
  const p = run.player.n;
  const dx = n.x - p.x,
    dy = n.y - p.y,
    dz = n.z - p.z;
  const r = run.groundRadius;
  return [
    (dx * right.x + dy * right.y + dz * right.z) * r,
    (dx * run.player.forward.x +
      dy * run.player.forward.y +
      dz * run.player.forward.z) *
      r,
  ];
}

/**
 * One frame of movement. `hurt` is how much health is missing, 0–1; balance
 * runs pass their own virtual health rather than the run's.
 */
export function pilot(
  run: Run,
  hurt = 1 - run.player.hp / run.player.maxHp
): MoveInput {
  playerRight(right, run.player);
  // A slow wander keeps it from parking while nothing is near.
  let x = Math.cos(run.time * 0.31) * 0.25;
  let y = Math.sin(run.time * 0.47) * 0.25;
  let danger = 0;

  for (const enemy of run.enemies) {
    if (enemy.emerge > 0.3) continue;
    const [ex, ey] = local(run, enemy.n);
    const distance = Math.hypot(ex, ey);
    const reach = 1.1 + enemy.spec.radius + (enemy.spec.boss ? 1.2 : 0);
    if (distance >= reach || distance < 1e-4) continue;
    const push = ((reach - distance) / reach) ** 2 * 3;
    danger += push;
    x -= (ex / distance) * push;
    y -= (ey / distance) * push;
  }

  // A marching Bulwark wall can't be outrun backwards: head for its nearer
  // end, away from the middle of whatever is about to pass through.
  let wallX = 0,
    wallY = 0,
    wall = 0;
  for (const enemy of run.enemies) {
    if (!enemy.straight || enemy.kind !== 'bulwark' || enemy.emerge > 0.3)
      continue;
    const [ex, ey] = local(run, enemy.n);
    const [ax, ay] = local(run, {
      x: enemy.n.x + enemy.aim.x * 0.01,
      y: enemy.n.y + enemy.aim.y * 0.01,
      z: enemy.n.z + enemy.aim.z * 0.01,
    });
    const mx = ax - ex,
      my = ay - ey;
    const m = Math.hypot(mx, my) || 1;
    // How far the wall still has to march to reach the player.
    const ahead = (-ex * mx + -ey * my) / m;
    if (ahead < -0.4 || ahead > 6) continue;
    const lx = -my / m,
      ly = mx / m;
    const across = -ex * lx + -ey * ly;
    wallX += across * lx;
    wallY += across * ly;
    wall++;
  }
  if (wall >= 4) {
    const length = Math.hypot(wallX, wallY);
    const [ux, uy] = length > 1e-3 ? [wallX / length, wallY / length] : [1, 0];
    x += ux * 4;
    y += uy * 4;
    danger += 4;
  }

  // Sidestep hostile bolts heading this way.
  for (const shot of run.projectiles) {
    if (shot.from === null) continue;
    const [sx, sy] = local(run, shot.n);
    const distance = Math.hypot(sx, sy);
    if (distance > 1.4 || distance < 1e-4) continue;
    const [ax, ay] = local(run, {
      x: shot.n.x + shot.dir.x * 0.01,
      y: shot.n.y + shot.dir.y * 0.01,
      z: shot.n.z + shot.dir.z * 0.01,
    });
    const vx = ax - sx,
      vy = ay - sy;
    const speed = Math.hypot(vx, vy) || 1;
    // Closing in: move across its line, away from the side it passes.
    if (-(sx * vx + sy * vy) <= 0) continue;
    const side = Math.sign(sx * vy - sy * vx) || 1;
    const weight = ((1.4 - distance) / 1.4) * 2.5;
    x += (-vy / speed) * side * weight;
    y += (vx / speed) * side * weight;
    danger += weight;
  }

  // Step off aimed paths, slam cones and blast marks.
  for (const effect of run.effects) {
    if (effect.kind === 'aim') {
      const [ox, oy] = local(run, effect.n);
      const [tx, ty] = local(run, {
        x: effect.n.x + effect.dir.x * 0.01,
        y: effect.n.y + effect.dir.y * 0.01,
        z: effect.n.z + effect.dir.z * 0.01,
      });
      const dx = tx - ox,
        dy = ty - oy;
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length,
        uy = dy / length;
      const along = -ox * ux + -oy * uy;
      if (along < 0 || along > effect.length) continue;
      const across = -ox * -uy + -oy * ux;
      if (Math.abs(across) > 0.45) continue;
      const side = Math.sign(across) || 1;
      x += -uy * side * 2;
      y += ux * side * 2;
      danger += 2;
    } else if (effect.kind === 'cone') {
      const [cx, cy] = local(run, effect.n);
      const distance = Math.hypot(cx, cy);
      if (distance < effect.radius + 0.4 && distance > 1e-4) {
        x -= (cx / distance) * 2.5;
        y -= (cy / distance) * 2.5;
        danger += 2.5;
      }
    }
  }

  // Collect while it is safe enough, and go for repairs when hurt.
  const greed = Math.max(0, 1 - danger / 2);
  if (greed > 0) {
    let best: [number, number] | null = null;
    let bestScore = 0;
    for (const gem of run.gems) {
      const [gx, gy] = local(run, gem.n);
      const distance = Math.hypot(gx, gy);
      if (distance > 3 || distance < 1e-4) continue;
      const score = (1 + gem.value * 0.1) / (0.4 + distance);
      if (score > bestScore) {
        bestScore = score;
        best = [gx / distance, gy / distance];
      }
    }
    for (const item of run.items) {
      const [ix, iy] = local(run, item.n);
      const distance = Math.hypot(ix, iy);
      if (distance > 4 || distance < 1e-4) continue;
      const want =
        item.kind === 'repair' ? 1 + hurt * 6 : item.kind === 'drop' ? 4 : 2;
      const score = want / (0.4 + distance);
      if (score > bestScore) {
        bestScore = score;
        best = [ix / distance, iy / distance];
      }
    }
    if (best) {
      x += best[0] * greed;
      y += best[1] * greed;
    }
  }
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

/**
 * Builds toward evolutions the way a practiced player does: evolve when it
 * can, drive owned weapons to level 5, take each one's paired system, pick
 * up defense early, and keep to three or four weapons.
 */
function offerScore(run: Run, offer: Offer, hurt: number) {
  switch (offer.kind) {
    case 'evolution':
      return 100;
    case 'weapon': {
      if (!offer.isNew) {
        const level = run.weapons.find((w) => w.id === offer.id)?.level ?? 0;
        const paired = (run.systems[WEAPONS[offer.id].pair] ?? 0) > 0;
        return 20 + level + (paired ? 4 : 0);
      }
      return run.weapons.length < 3 ? 18 : run.weapons.length < 4 ? 9 : 2;
    }
    case 'system': {
      const level = run.systems[offer.id] ?? 0;
      const weapon = PAIRED_WEAPON[offer.id];
      const owned = run.weapons.find((w) => w.id === weapon && !w.evolved);
      let score = owned ? 17 + (owned.level >= 3 ? 5 : 0) : 8;
      if (offer.id === 'plating' || offer.id === 'nanorepair')
        score = Math.max(score, 16 - level);
      return score + (level > 0 ? 1 : 0);
    }
    case 'repair':
      return 1 + hurt * 30;
    case 'sharpen':
      return 3;
  }
}

function greedy(run: Run, offers: Offer[], hurt: number) {
  let best = 0;
  let bestScore = -Infinity;
  offers.forEach((offer, index) => {
    const score = offerScore(run, offer, hurt);
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

/**
 * Answer whatever the run is waiting on; `random` is the bot's own dice, so
 * its picks never shift the run's. Returns false once the run is over.
 */
export function decide(
  run: Run,
  policy: OfferPolicy,
  random: () => number,
  hurt = 1 - run.player.hp / run.player.maxHp
): boolean {
  if (run.status === 'fallen') return false;
  if (run.status === 'supply') closeSupply(run);
  else if (run.status === 'choosing') {
    const index =
      policy === 'first'
        ? 0
        : policy === 'random'
          ? Math.floor(random() * run.offers.length)
          : greedy(run, run.offers, hurt);
    chooseOffer(run, index);
  }
  return true;
}
