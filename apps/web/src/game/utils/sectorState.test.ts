import { describe, expect, it } from 'vitest';
import type { IndexedSector, SectorStatus } from '../types';
import {
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
