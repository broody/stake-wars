import { describe, expect, it } from 'vitest';
import {
  AEGIS,
  AEGIS_RANKS,
  aegisAtRank,
  hitAegis,
  newAegis,
  rankAegis,
  rechargeAegis,
  restoreAegis,
} from './aegis';

const drain = (
  dt: number,
  seconds: number,
  aegis: ReturnType<typeof newAegis>
) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) rechargeAegis(aegis, dt, t + dt);
  return aegis;
};

describe('Aegis gauge', () => {
  it('can block on the same instant it is equipped', () => {
    const aegis = newAegis({ segments: 2 }, 42);
    expect(aegis.raisedAt).toBe(42);
    expect(aegis.delay).toBe(0);
    expect(aegis.segments).toBe(2);
    expect(hitAegis(aegis, false, 42)).toBe('blocked');
    expect(hitAegis(aegis, false, 42)).toBe('broke');
    expect(hitAegis(aegis, false, 42)).toBe('open');
  });

  it('raises the field again only when the first whole segment is restored', () => {
    const aegis = newAegis({ segments: 2 });
    hitAegis(aegis, true, 10);
    rechargeAegis(aegis, AEGIS.brokenDelay + 0.25, 15.25);
    expect(aegis.segments).toBe(0.5);
    expect(aegis.raisedAt).toBe(0);
    rechargeAegis(aegis, 0.25, 15.5);
    rechargeAegis(aegis, 0.5, 16);
    expect(aegis.raisedAt).toBe(15.5);
    expect(aegis.segments).toBe(2);
  });

  it('blocks one ordinary hit a segment, then lets the next one through', () => {
    const aegis = newAegis();
    const full = AEGIS.segments;
    const outcomes = Array.from({ length: full + 1 }, (_, i) =>
      hitAegis(aegis, false, i)
    );
    expect(outcomes.slice(0, full - 1)).toEqual(
      Array(full - 1).fill('blocked')
    );
    expect(outcomes[full - 1]).toBe('broke');
    expect(outcomes[full]).toBe('open');
    expect(aegis.brokeAt).toBe(full - 1);
  });

  it('charges heavy attacks three segments and breaks on a hit it cannot cover', () => {
    const aegis = newAegis();
    expect(hitAegis(aegis, true, 0)).toBe('blocked');
    expect(aegis.segments).toBe(AEGIS.segments - AEGIS.heavyCost);
    aegis.segments = 2;
    // Two segments left still absorb the whole slam, and the gauge breaks.
    expect(hitAegis(aegis, true, 1)).toBe('broke');
    expect(aegis.segments).toBe(0);
  });

  it('waits out the delay after a hit, then refills at the set rate', () => {
    const aegis = newAegis();
    hitAegis(aegis, false, 0);
    hitAegis(aegis, false, 0);
    const dt = 1 / 30;
    const left = AEGIS.segments - 2;
    drain(dt, AEGIS.rechargeDelay, aegis);
    expect(aegis.segments).toBeCloseTo(left, 5);
    drain(dt, 0.5, aegis);
    expect(aegis.segments).toBeCloseTo(left + AEGIS.rechargeRate * 0.5, 5);
    drain(dt, 5, aegis);
    expect(aegis.segments).toBe(AEGIS.segments);
  });

  it('takes longer to come back once broken, and any hit restarts the wait', () => {
    const aegis = newAegis({ segments: 1 });
    expect(hitAegis(aegis, false, 0)).toBe('broke');
    expect(aegis.delay).toBe(AEGIS.brokenDelay);
    const dt = 1 / 30;
    drain(dt, AEGIS.brokenDelay - 1, aegis);
    expect(hitAegis(aegis, false, 4)).toBe('open');
    expect(aegis.delay).toBeCloseTo(AEGIS.rechargeDelay, 5);
    drain(dt, AEGIS.rechargeDelay, aegis);
    expect(aegis.segments).toBeCloseTo(0, 5);
    drain(dt, 1, aegis);
    expect(aegis.segments).toBeGreaterThan(0);
  });

  it('only whole segments block', () => {
    const aegis = newAegis();
    aegis.segments = 0.9;
    expect(hitAegis(aegis, false, 0)).toBe('open');
  });

  it('charges more per hit as the run goes on when it grows', () => {
    const aegis = newAegis({ growth: 0.08 });
    hitAegis(aegis, false, 600);
    // Ten minutes in, a hit costs what 1.8 did at the start.
    expect(aegis.segments).toBeCloseTo(AEGIS.segments - 1.8, 5);
  });

  it('lets the part of a hit a breaking shield cannot cover through, with spill', () => {
    const held = newAegis({ segments: 2 });
    expect(hitAegis(held, true, 0)).toBe('broke');
    expect(held.through).toBe(0);
    const spilling = newAegis({ segments: 2, spill: 1 });
    hitAegis(spilling, true, 0);
    // Two segments of a three-segment slam: a third gets through.
    expect(spilling.through).toBeCloseTo(1 / 3, 5);
  });

  it('restores segments without resetting the wait', () => {
    const aegis = newAegis();
    aegis.segments = 0;
    aegis.delay = AEGIS.brokenDelay;
    restoreAegis(aegis, 2, 11);
    expect(aegis.raisedAt).toBe(11);
    expect(aegis.segments).toBe(2);
    expect(aegis.delay).toBe(AEGIS.brokenDelay);
    restoreAegis(aegis, 20, 12);
    expect(aegis.raisedAt).toBe(11);
    expect(aegis.segments).toBe(AEGIS.segments);
  });

  it('opens at rank 1 with two slow segments and ranks up to the full gauge', () => {
    const aegis = rankAegis(undefined, 1);
    expect(aegis.max).toBe(2);
    expect(aegis.segments).toBe(2);
    expect(aegis.delay).toBe(0);
    expect(aegis.tuning.rechargeDelay).toBe(AEGIS.rechargeDelay + 1);
    expect(aegis.tuning.brokenDelay).toBe(AEGIS.brokenDelay + 1);
    // A new segment comes full; rank 3 only quickens the refill.
    rankAegis(aegis, 2);
    expect(aegis.max).toBe(3);
    expect(aegis.segments).toBe(3);
    rankAegis(aegis, 3);
    expect(aegis.max).toBe(3);
    expect(aegis.tuning.rechargeDelay).toBe(AEGIS.rechargeDelay);
    expect(aegis.tuning.brokenDelay).toBe(AEGIS.brokenDelay);
    rankAegis(aegis, 4);
    rankAegis(aegis, AEGIS_RANKS);
    expect(aegis.tuning).toEqual(AEGIS);
    expect(aegis.max).toBe(AEGIS.segments);
    expect(aegis.segments).toBe(AEGIS.segments);
  });

  it('shifts every rank with a tuning override, never below one segment', () => {
    expect(aegisAtRank(1, { segments: 6 }).segments).toBe(3);
    expect(aegisAtRank(5, { segments: 6 }).segments).toBe(6);
    expect(aegisAtRank(1, { segments: 2 }).segments).toBe(1);
    expect(aegisAtRank(2, { rechargeDelay: 2 }).rechargeDelay).toBe(3);
  });
});
