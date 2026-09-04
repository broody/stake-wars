import type { IndexedSector } from '../types';
import { isZeroAddress } from '../utils/format';
import { isSectorId } from '../utils/sectorGeometry';
import { config } from './config';

const CACHE_VERSION = 1;

interface OccupiedSectorCacheStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface CachedOccupiedSector {
  id: number;
  controller: string;
  controllerGeneration: string;
  captureForce: string;
  ownershipGeneration: string;
  controlledSince: number | null;
  activeChallengeId: string;
}

interface OccupiedSectorCachePayload {
  version: typeof CACHE_VERSION;
  sectors: CachedOccupiedSector[];
}

function browserStorage(): OccupiedSectorCacheStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function cacheScopePart(value: string): string {
  return encodeURIComponent(value.trim().toLowerCase());
}

export function occupiedSectorCacheKey(
  chainId = config.starknetChainId,
  worldAddress = config.dojoWorldAddress,
  toriiUrl = config.toriiGraphqlUrl
): string {
  const worldScope = worldAddress || toriiUrl;
  return `stakewars:occupied-sectors:v${CACHE_VERSION}:${cacheScopePart(chainId)}:${cacheScopePart(worldScope)}`;
}

function parseNonNegativeBigInt(value: unknown): bigint | null {
  if (typeof value !== 'string') return null;

  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
}

function parseCachedSector(value: unknown): IndexedSector | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<CachedOccupiedSector>;
  const id = candidate.id;
  if (
    typeof id !== 'number' ||
    !isSectorId(id) ||
    typeof candidate.controller !== 'string'
  ) {
    return null;
  }

  const controller = parseNonNegativeBigInt(candidate.controller);
  const controllerGeneration = parseNonNegativeBigInt(
    candidate.controllerGeneration
  );
  const captureForce = parseNonNegativeBigInt(candidate.captureForce);
  const ownershipGeneration = parseNonNegativeBigInt(
    candidate.ownershipGeneration
  );
  const activeChallengeId = parseNonNegativeBigInt(candidate.activeChallengeId);
  const controlledSince = candidate.controlledSince;

  if (
    controller === null ||
    controller === 0n ||
    controllerGeneration === null ||
    captureForce === null ||
    ownershipGeneration === null ||
    activeChallengeId === null ||
    (controlledSince !== null &&
      (typeof controlledSince !== 'number' ||
        !Number.isSafeInteger(controlledSince) ||
        controlledSince < 0))
  ) {
    return null;
  }

  return {
    id,
    controller: candidate.controller,
    controllerGeneration,
    captureForce,
    ownershipGeneration,
    controlledSince,
    activeChallengeId,
  };
}

export function readOccupiedSectorCache(
  storage: OccupiedSectorCacheStorage | null = browserStorage(),
  key = occupiedSectorCacheKey()
): IndexedSector[] | null {
  if (!storage) return null;

  try {
    const stored = storage.getItem(key);
    if (stored === null) return null;

    const payload = JSON.parse(stored) as Partial<OccupiedSectorCachePayload>;
    if (payload.version !== CACHE_VERSION || !Array.isArray(payload.sectors)) {
      storage.removeItem(key);
      return null;
    }

    const sectors = payload.sectors.map(parseCachedSector);
    if (sectors.some((sector) => sector === null)) {
      storage.removeItem(key);
      return null;
    }

    const occupiedSectors = sectors as IndexedSector[];
    if (new Set(occupiedSectors.map(({ id }) => id)).size !== sectors.length) {
      storage.removeItem(key);
      return null;
    }

    return occupiedSectors.sort((left, right) => left.id - right.id);
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Browser storage can be disabled even when the API is present.
    }
    return null;
  }
}

export function writeOccupiedSectorCache(
  sectors: Iterable<IndexedSector>,
  storage: OccupiedSectorCacheStorage | null = browserStorage(),
  key = occupiedSectorCacheKey()
): void {
  if (!storage) return;

  const occupied = [...sectors]
    .filter(({ controller }) => !isZeroAddress(controller))
    .sort((left, right) => left.id - right.id);
  const payload: OccupiedSectorCachePayload = {
    version: CACHE_VERSION,
    sectors: occupied.map((sector) => ({
      id: sector.id,
      controller: sector.controller,
      controllerGeneration: sector.controllerGeneration.toString(),
      captureForce: sector.captureForce.toString(),
      ownershipGeneration: sector.ownershipGeneration.toString(),
      controlledSince: sector.controlledSince,
      activeChallengeId: sector.activeChallengeId.toString(),
    })),
  };

  try {
    storage.setItem(key, JSON.stringify(payload));
  } catch {
    // Quota and privacy-mode errors should not prevent live Sector loading.
  }
}
