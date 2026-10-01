import { describe, expect, it } from 'vitest';
import { SECTOR_COUNT } from '../utils/sectorGeometry';
import {
  BREACH,
  BREACH_EMERGE,
  BREACH_LIFE,
  breachAngle,
  emergeLift,
} from './breach';
import { sectorAt, sectorCenter } from './sectors';
import {
  createRun,
  playerRight,
  runEvent,
  SIM_HZ,
  tick,
  type Enemy,
  type Run,
} from './sim';
import { chord, copy, dot, vec3, type Vec3 } from './sphere';

const DT = 1 / SIM_HZ;
const RADIUS = 5.006;
const still = { x: 0, y: 0 };

function screen(run: Run, n: Vec3) {
  const p = run.player.n;
  const right = playerRight(vec3(), run.player);
  const d = vec3(n.x - p.x, n.y - p.y, n.z - p.z);
  return {
    x: dot(d, right) * run.groundRadius,
    y: dot(d, run.player.forward) * run.groundRadius,
  };
}

function onScreen(run: Run, n: Vec3) {
  const { x, y } = screen(run, n);
  return (
    x < run.view.right &&
    -x < run.view.left &&
    y < run.view.up &&
    -y < run.view.down
  );
}

function firstSpawn(run: Run): Enemy {
  for (let i = 0; i < SIM_HZ * 5 && !run.enemies.length; i++)
    tick(run, DT, still);
  expect(run.enemies.length).toBeGreaterThan(0);
  return run.enemies[0];
}

describe('Sector lookup', () => {
  it('finds every Sector from its own center', () => {
    for (let id = 0; id < SECTOR_COUNT; id += 7)
      expect(sectorAt(sectorCenter(vec3(), id))).toBe(id);
  });
});

describe('breach timing', () => {
  it('flips open, holds while the enemy rises, then flips back', () => {
    expect(breachAngle(0)).toBe(0);
    expect(breachAngle(BREACH.flip / 2)).toBeCloseTo(Math.PI / 2, 6);
    expect(breachAngle(BREACH_EMERGE)).toBe(Math.PI);
    expect(breachAngle(BREACH_LIFE)).toBeCloseTo(0, 6);
  });

  it('hides the enemy until the flip is done, then raises it to the ground', () => {
    expect(emergeLift(BREACH_EMERGE, 1, DT, 0.35)).toBeNull();
    expect(emergeLift(BREACH.rise, 1, DT, 0.35)).toBeNull();
    expect(emergeLift(BREACH.rise / 2, 1, DT, 0.35)).toBeLessThan(0);
    expect(emergeLift(0, 0, DT, 0.35)).toBe(0);
  });
});

describe('breach spawns', () => {
  it('spawns on screen, centered on a Sector that flips open', () => {
    const run = createRun(11, RADIUS);
    const enemy = firstSpawn(run);
    expect(enemy.emerge).toBeGreaterThan(0);
    const sector = sectorAt(enemy.n);
    expect(chord(enemy.n, sectorCenter(vec3(), sector))).toBeLessThan(1e-9);
    expect(run.breaches.some((breach) => breach.sector === sector)).toBe(true);
    expect(onScreen(run, enemy.n)).toBe(true);
  });

  it('follows the view the renderer reports', () => {
    const run = createRun(11, RADIUS);
    run.view = { right: 3, left: 3, up: 3, down: 3 };
    const enemy = firstSpawn(run);
    const { x, y } = screen(run, enemy.n);
    // 0.7 inside the reported square edge along the spawn direction, give or
    // take the snap to the Sector's center.
    const along = Math.atan2(y, x);
    const expected =
      3 / Math.max(Math.abs(Math.cos(along)), Math.abs(Math.sin(along))) - 0.7;
    const arc = Math.acos(dot(enemy.n, run.player.n)) * run.groundRadius;
    expect(Math.abs(arc - expected)).toBeLessThan(0.3);
  });

  it('keeps an emerging enemy still, harmless and untargetable', () => {
    const run = createRun(11, RADIUS);
    runEvent(run, 'encircle');
    const ring = [...run.enemies];
    const placed = ring.map((enemy) => copy(vec3(), enemy.n));
    // Drop one right on the player: it must not hurt or be cut down yet.
    const onPlayer = ring[0];
    // Too tough for the saber, so only inertness keeps it from hurting.
    onPlayer.hp = onPlayer.maxHp = 1e6;
    copy(onPlayer.n, run.player.n);
    copy(placed[0], run.player.n);
    const hp = onPlayer.hp;
    for (let t = 0; t < BREACH.flip; t += DT) tick(run, DT, still);
    expect(run.player.hp).toBe(run.player.maxHp);
    expect(onPlayer.hp).toBe(hp);
    ring.forEach((enemy, i) => {
      expect(enemy.emerge).toBeGreaterThan(0);
      expect(chord(enemy.n, placed[i])).toBe(0);
    });
    for (let t = 0; t < BREACH_EMERGE; t += DT) tick(run, DT, still);
    expect(ring.every((enemy) => enemy.emerge === 0)).toBe(true);
    expect(run.player.hp).toBeLessThan(run.player.maxHp);
  });

  it('rings the screen edge for an encircle', () => {
    const run = createRun(5, RADIUS);
    runEvent(run, 'encircle');
    expect(run.enemies).toHaveLength(40);
    for (const enemy of run.enemies) {
      expect(enemy.emerge).toBeGreaterThan(0);
      expect(onScreen(run, enemy.n)).toBe(true);
    }
  });

  it('breaches a recycled straggler back onto the screen', () => {
    const run = createRun(11, RADIUS);
    const enemy = firstSpawn(run);
    for (let t = 0; t <= BREACH_EMERGE; t += DT) tick(run, DT, still);
    expect(enemy.emerge).toBe(0);
    // Send it far around the Core.
    enemy.n = vec3(-run.player.n.x, -run.player.n.y, -run.player.n.z);
    tick(run, DT, still);
    expect(enemy.emerge).toBeGreaterThan(0);
    expect(onScreen(run, enemy.n)).toBe(true);
    expect(run.breaches.some((b) => b.sector === sectorAt(enemy.n))).toBe(true);
  });

  it('closes every breach after its lifetime', () => {
    const run = createRun(11, RADIUS);
    runEvent(run, 'encircle');
    expect(run.breaches.length).toBeGreaterThan(0);
    const opened = new Set(run.breaches);
    for (let t = 0; t <= BREACH_LIFE + DT; t += DT) tick(run, DT, still);
    expect(run.breaches.some((breach) => opened.has(breach))).toBe(false);
  });
});
