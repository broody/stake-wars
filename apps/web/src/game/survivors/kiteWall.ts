import type { Run } from './sim';
import { chord, copy, dot, tangentToward, vec3, type Vec3 } from './sphere';

export interface KiteWall {
  previous: Vec3 | null;
  nextSample: number;
  retreatSeconds: number;
  count: number;
  borrowedLine: boolean;
}

export const newKiteWall = (): KiteWall => ({
  previous: null,
  nextSample: 240,
  retreatSeconds: 0,
  count: 0,
  borrowedLine: false,
});

/** Sample actual travel on the sphere once per combat second. */
export function interceptDirection(run: Run, wall: KiteWall): Vec3 | null {
  if (wall.borrowedLine || run.time < wall.nextSample) return null;
  wall.nextSample = run.time + 1;
  const n = run.player.n;
  if (!wall.previous) {
    wall.previous = copy(vec3(), n);
    return null;
  }
  const travelled = chord(n, wall.previous) * run.groundRadius;
  const behind = tangentToward(vec3(), n, wall.previous);
  copy(wall.previous, n);
  let nearby = 0;
  let trailing = 0;
  if (
    run.player.moving &&
    travelled >= 0.35 &&
    run.player.hp >= 0.8 * run.player.maxHp
  ) {
    for (const enemy of run.enemies) {
      if (enemy.dead || enemy.emerge > 0 || enemy.straight) continue;
      const gap = chord(n, enemy.n);
      if (gap * run.groundRadius > 2.4) continue;
      nearby++;
      if (dot(enemy.n, behind) > 0.25 * gap) trailing++;
    }
  }
  if (trailing < 4 || trailing * 3 < nearby * 2) {
    wall.retreatSeconds = Math.max(0, wall.retreatSeconds - 2);
    return null;
  }
  wall.retreatSeconds = Math.min(20, wall.retreatSeconds + 1);
  if (wall.retreatSeconds < 20) return null;
  if (run.enemies.some((e) => !e.dead && e.straight && e.kind === 'bulwark'))
    return null;
  wall.count++;
  wall.retreatSeconds = 0;
  wall.previous = null;
  wall.nextSample = run.time + 90;
  wall.borrowedLine = true;
  // Bulwarks spawn opposite their march direction, ahead of the fleeing player.
  return behind;
}
