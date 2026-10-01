// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SurvivorsSession } from './session';
import { createRun, spawnEnemy, tick, SIM_HZ } from './sim';
import { DEATH_CAMERA, DEATH_RESULTS_DELAY } from './deathCamera';

describe('player defeat presentation', () => {
  it('stops combat at the fatal hit and delays results without adding survival time', () => {
    const session = new SurvivorsSession();
    const run = createRun(43, 5);
    session.run = run;
    run.player.hp = 1;
    run.spawnCredit = -1e6;
    run.eventIndex = 1000;
    run.weapons[0].cooldown = 10;
    const enemy = spawnEnemy(run, 'mite', { ...run.player.n });
    let timerFired = false;
    run.timers.push({
      at: 10,
      run: () => {
        timerFired = true;
      },
    });
    tick(run, 1 / SIM_HZ, { x: 0, y: 0 });
    expect(run.status).toBe('fallen');
    expect(run.deathAge).toBe(0);
    expect(run.player.hp).toBe(0);
    expect(run.player.saberAttack).toBeUndefined();
    expect(run.timers).toHaveLength(0);
    const time = run.time,
      position = { ...run.player.n },
      enemyPosition = { ...enemy.n };
    let notifications = 0;
    const unsubscribe = session.subscribe(() => notifications++);
    session.keys.add('KeyW');
    for (let i = 0; i < DEATH_CAMERA.duration * 100; i++) session.advance(0.01);
    expect(notifications).toBe(0);
    for (let i = 0; i < DEATH_CAMERA.hold * 100 - 1; i++) session.advance(0.01);
    expect(run.deathAge).toBeLessThan(DEATH_RESULTS_DELAY);
    expect(notifications).toBe(0);
    session.advance(0.02);
    expect(run.deathAge).toBe(DEATH_RESULTS_DELAY);
    expect(notifications).toBe(1);
    session.advance(0.25);
    expect(notifications).toBe(1);
    expect(run.time).toBe(time);
    expect(run.player.n).toEqual(position);
    expect(enemy.n).toEqual(enemyPosition);
    expect(timerFired).toBe(false);
    expect(run.shake).toBe(0);
    expect(run.hurtFlash).toBe(0);
    unsubscribe();
  });
});
