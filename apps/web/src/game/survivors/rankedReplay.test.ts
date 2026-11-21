import { describe, expect, it } from 'vitest';
import { SIM_HZ, WEAPONS, offerName, type EarnedUpgrade } from './sim';
import {
  RankedReplay,
  rankedRun,
  scoreReplay,
  rerollAction,
  supplyAction,
  MAX_RANKED_TICKS,
} from './rankedReplay';

describe('ranked Survivor replays', () => {
  it('reproduces the destroyed count, active duration and upgrades earned in order', () => {
    const seed = 343;
    const run = rankedRun(seed);
    const replay = new RankedReplay();
    const names: string[] = [];
    while (run.status !== 'fallen' && replay.ticks < MAX_RANKED_TICKS) {
      if (run.status === 'choosing') {
        if (run.rerolls > 0) replay.choose(run, rerollAction);
        names.push(offerName(run.offers[0]));
        replay.choose(run, 0);
      } else if (run.status === 'supply') {
        names.push(...run.supply.map(offerName));
        replay.choose(run, supplyAction);
      } else {
        const x = replay.ticks < 500 ? 0.37 : 0;
        replay.advance(run, { x, y: 0 });
      }
    }
    expect(run.kills).toBeGreaterThan(0);
    const result = scoreReplay(seed, replay.data());
    expect(result.destroyed).toBe(run.kills);
    expect(result.durationSeconds).toBe(Math.floor(replay.ticks / SIM_HZ));
    expect(names.length).toBeGreaterThan(0);
    expect(result.upgrades.map((upgrade) => upgrade.name)).toEqual(names);
    expect(() => scoreReplay(seed, replay.data().slice(0, -2))).toThrow();
  });
  it('records the resulting weapon level and each Supply Drop award, including evolutions', () => {
    const run = rankedRun(34);
    const replay = new RankedReplay();
    const history: EarnedUpgrade[] = [];
    run.upgradeHistory = history;
    const weapon = run.weapons[0];
    weapon.level = 4;
    run.systems[WEAPONS[weapon.id].pair] = 1;
    run.offers = [{ kind: 'weapon', id: weapon.id, isNew: false }];
    run.status = 'choosing';
    run.pendingDrops.push(3);
    replay.choose(run, 0);
    expect(run.status).toBe('supply');
    expect(history[0]).toEqual({
      kind: 'weapon',
      name: WEAPONS[weapon.id].name,
      level: 5,
    });
    expect(history[1]).toMatchObject({
      kind: 'evolution',
      name: WEAPONS[weapon.id].evolution,
    });
    expect(history.slice(1).map((award) => award.name)).toEqual(
      run.supply.map(offerName)
    );
    replay.choose(run, supplyAction);
    expect(history).toHaveLength(4);
  });
  it('rejects impossible choices and incomplete input', () => {
    expect(() => scoreReplay(1, Uint8Array.of(255, 0))).toThrow();
    expect(() => scoreReplay(1, Uint8Array.of(127))).toThrow();
    expect(() => scoreReplay(1, Uint8Array.of(127, 255))).toThrow();
    expect(() => scoreReplay(1, new Uint8Array())).toThrow();
  });
});
