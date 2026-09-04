import { describe, expect, it } from 'vitest';
import type { IndexedSector } from '../types';
import {
  occupiedSectorCacheKey,
  readOccupiedSectorCache,
  writeOccupiedSectorCache,
} from './occupiedSectorCache';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

function sector(overrides: Partial<IndexedSector> = {}): IndexedSector {
  return {
    id: 42,
    controller: '0xabc',
    controllerGeneration: 3n,
    captureForce: 25n,
    ownershipGeneration: 2n,
    controlledSince: 1_725_000_000,
    activeChallengeId: 7n,
    ...overrides,
  };
}

describe('occupied Sector cache', () => {
  it('round-trips occupied Sector state without artwork data', () => {
    const storage = memoryStorage();
    const key = 'test-cache';

    writeOccupiedSectorCache(
      [sector(), sector({ id: 7, controller: '0x0' })],
      storage,
      key
    );

    expect(readOccupiedSectorCache(storage, key)).toEqual([sector()]);
    expect(storage.values.get(key)).not.toContain('image');
  });

  it('clears malformed cache entries instead of hydrating them', () => {
    const storage = memoryStorage();
    const key = 'test-cache';
    storage.setItem(
      key,
      JSON.stringify({
        version: 1,
        sectors: [
          {
            id: 42,
            controller: '0xabc',
            controllerGeneration: '3',
            captureForce: 'not-a-number',
            ownershipGeneration: '2',
            controlledSince: 1_725_000_000,
            activeChallengeId: '7',
          },
        ],
      })
    );

    expect(readOccupiedSectorCache(storage, key)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it('scopes cached occupancy to the chain and World', () => {
    expect(
      occupiedSectorCacheKey('SN_SEPOLIA', '0x123', 'https://ignored.test')
    ).not.toBe(
      occupiedSectorCacheKey('SN_MAIN', '0x123', 'https://ignored.test')
    );
    expect(
      occupiedSectorCacheKey('SN_SEPOLIA', '0x123', 'https://ignored.test')
    ).not.toBe(
      occupiedSectorCacheKey('SN_SEPOLIA', '0x456', 'https://ignored.test')
    );
  });

  it('ignores browser storage write failures', () => {
    const storage = {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error('storage disabled');
      },
    };

    expect(() => writeOccupiedSectorCache([sector()], storage)).not.toThrow();
  });
});
