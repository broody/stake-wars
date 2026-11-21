import { describe, expect, it } from 'vitest';
import { interceptDirection } from './kiteWall';
import { createRun, runEvent, SIM_HZ, spawnEnemy, tick } from './sim';
import { chord, dot, pointAt, vec3 } from './sphere';

const radius = 5;

function chase() {
  const run = createRun(31, radius, 'vanguard', { kiteWall: true });
  run.spawnCredit = -1e6;
  run.eventIndex = 1000;
  run.time = 250;
  run.player.moving = true;
  const behind = (distance: number) =>
    pointAt(vec3(), run.player.n, run.right, -distance / radius);
  for (let i = 0; i < 5; i++) spawnEnemy(run, 'mite', behind(0.9 + i / 10));
  const wall = run.kiteWall!;
  const sample = () => {
    run.time += 1;
    wall.previous = behind(0.6);
    return interceptDirection(run, wall);
  };
  return { run, wall, sample, behind };
}

describe('practice Bulwark interception', () => {
  it('needs a sustained retreat from a trailing crowd while healthy', () => {
    const { run, wall, sample, behind } = chase();
    run.player.hp = run.player.maxHp / 2;
    for (let i = 0; i < 25; i++) expect(sample()).toBeNull();
    expect(wall.retreatSeconds).toBe(0);
    run.player.hp = run.player.maxHp;
    const crowd = run.enemies.map((e) => e.n);
    for (const enemy of run.enemies) enemy.n = behind(-1);
    for (let i = 0; i < 25; i++) expect(sample()).toBeNull();
    run.enemies.forEach((enemy, i) => (enemy.n = crowd[i]));
    for (let i = 0; i < 19; i++) expect(sample()).toBeNull();
    expect(sample()).toBeTruthy();
    expect(wall.count).toBe(1);
  });

  it('intercepts ahead with a passable gap and uses one scheduled line', () => {
    const { run, wall, behind } = chase();
    wall.previous = behind(0.6);
    wall.retreatSeconds = 19;
    tick(run, 1 / SIM_HZ, { x: 1, y: 0 });
    expect(run.banner?.title).toBe('Bulwarks ahead');
    const line = run.enemies.filter((e) => e.straight);
    expect(line).toHaveLength(33);
    expect(line.every((e) => dot(e.n, run.player.heading) > 0)).toBe(true);
    expect(line.every((e) => dot(e.aim, run.player.heading) < 0)).toBe(true);
    const front = line.slice(0, 11);
    const gaps = front.slice(1).map((e, i) => chord(e.n, front[i].n) * radius);
    expect(Math.max(...gaps)).toBeGreaterThan(1.2);
    runEvent(run, 'lines');
    expect(run.enemies.filter((e) => e.straight)).toHaveLength(33 + 39);
    expect(wall.borrowedLine).toBe(false);
    expect(wall.nextSample).toBeGreaterThan(run.time + 89);
    expect(createRun(31, radius, 'vanguard').kiteWall).toBeUndefined();
  });
});
