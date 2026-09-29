import { describe, expect, it } from 'vitest';
import type { IndexedSector, SectorStatus } from '../types';
import {
  minimumTakeoverForce,
  pruneKnownSectors,
  sectorStatusFromIndex,
  sectorStatusMatchesIndexedState,
  sectorStatusesHaveSameEffectiveState,
} from './sectorState';

const indexed: IndexedSector = {
  id: 1977,
  controller: '0xabc',
  controllerGeneration: 1n,
  captureForce: 100n,
  ownershipGeneration: 2n,
  controlledSince: 123,
};

const status: SectorStatus = {
  id: 1977,
  controller: '0x0abc',
  captureForce: 100n,
  ownershipGeneration: 2n,
  controlledSince: 123,
  requiredStake: 0n,
  stale: false,
  needsSync: false,
};

describe('effective Sector state comparisons', () => {
  it('recognizes an RPC status that does not change indexed rendering state', () => {
    expect(sectorStatusMatchesIndexedState(status, indexed)).toBe(true);
    expect(
      sectorStatusMatchesIndexedState(
        { ...status, controlledSince: null },
        indexed
      )
    ).toBe(true);
  });

  it('detects rendering-relevant changes and invalid statuses', () => {
    expect(
      sectorStatusMatchesIndexedState(
        { ...status, captureForce: 101n },
        indexed
      )
    ).toBe(false);
    expect(
      sectorStatusMatchesIndexedState({ ...status, stale: true }, indexed)
    ).toBe(false);
  });

  it('ignores detail-only changes when comparing remembered statuses', () => {
    expect(
      sectorStatusesHaveSameEffectiveState(
        status,
        { ...status, requiredStake: 999n },
        indexed
      )
    ).toBe(true);
  });
});

const FORCE = 10n ** 18n;
const MAX_U128 = (1n << 128n) - 1n;

describe('minimum takeover force', () => {
  it('matches the Control System rounding', () => {
    expect(minimumTakeoverForce(10n * FORCE, 100n * FORCE)).toBe(110n * FORCE);
    expect(minimumTakeoverForce(0n, 101n)).toBe(112n);
    expect(minimumTakeoverForce(0n, 3n)).toBe(4n);
    expect(minimumTakeoverForce(0n, 0n)).toBe(1n);
  });

  it('never falls below the minimum stake or overflows', () => {
    expect(minimumTakeoverForce(10n * FORCE, 2n * FORCE)).toBe(10n * FORCE);
    expect(minimumTakeoverForce(0n, MAX_U128 - 1n)).toBe(MAX_U128);
    expect(minimumTakeoverForce(0n, MAX_U128)).toBe(MAX_U128);
  });
});

describe('Sector status from the index', () => {
  it('prices an occupied Sector at its takeover minimum', () => {
    expect(
      sectorStatusFromIndex(
        1977,
        {
          controller: '0xabc',
          captureForce: 100n * FORCE,
          ownershipGeneration: 2n,
          controlledSince: 123,
        },
        indexed,
        undefined,
        10n * FORCE
      )
    ).toEqual({
      id: 1977,
      controller: '0xabc',
      captureForce: 100n * FORCE,
      ownershipGeneration: 2n,
      controlledSince: 123,
      requiredStake: 110n * FORCE,
      stale: false,
      needsSync: false,
    });
  });

  it('keeps a neutral Sector generation and stale flag', () => {
    const neutral = sectorStatusFromIndex(
      1977,
      undefined,
      { ...indexed, controller: '0x0', captureForce: 0n, stale: true },
      undefined,
      10n * FORCE
    );
    expect(neutral).toMatchObject({
      controller: '0x0',
      ownershipGeneration: 2n,
      requiredStake: 10n * FORCE,
      stale: true,
    });
  });

  it('prefers a newer chain read for a neutral Sector', () => {
    expect(
      sectorStatusFromIndex(
        1977,
        undefined,
        indexed,
        {
          ...status,
          controller: '0x0',
          ownershipGeneration: 3n,
          stale: true,
          needsSync: true,
        },
        10n * FORCE
      )
    ).toMatchObject({ ownershipGeneration: 3n, stale: true, needsSync: true });
  });
});

describe('pruning chain-read overrides', () => {
  it('keeps overrides the index has not caught up with', () => {
    const known = new Map([[1977, { ...status, ownershipGeneration: 3n }]]);
    expect(pruneKnownSectors(known, new Map([[1977, indexed]]))).toBe(known);
  });

  it('drops overrides the index matches or has moved past', () => {
    const matched = new Map([[1977, status]]);
    expect(pruneKnownSectors(matched, new Map([[1977, indexed]])).size).toBe(0);

    const passed = new Map([[1977, { ...status, ownershipGeneration: 1n }]]);
    expect(pruneKnownSectors(passed, new Map([[1977, indexed]])).size).toBe(0);

    const retired = new Map([[1977, status]]);
    expect(
      pruneKnownSectors(
        retired,
        new Map([[1977, { ...indexed, controller: '0x0', stale: true }]])
      ).size
    ).toBe(0);
  });
});
