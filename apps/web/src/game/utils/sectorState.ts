import type { IndexedSector, SectorStatus } from '../types';
import { addressesMatch, isZeroAddress } from './format';

const MAX_U128 = (1n << 128n) - 1n;

export interface EffectiveSectorState {
  controller: string;
  captureForce: bigint;
  ownershipGeneration: bigint;
  controlledSince: number | null;
}

function effectiveIndexedSectorState(
  sector: IndexedSector | undefined
): EffectiveSectorState | null {
  if (!sector || isZeroAddress(sector.controller)) return null;
  return {
    controller: sector.controller,
    captureForce: sector.captureForce,
    ownershipGeneration: sector.ownershipGeneration,
    controlledSince: sector.controlledSince,
  };
}

function effectiveSectorStatusState(
  status: SectorStatus,
  indexed: IndexedSector | undefined
): EffectiveSectorState | null {
  if (isZeroAddress(status.controller) || status.stale || status.needsSync) {
    return null;
  }

  return {
    controller: status.controller,
    captureForce: status.captureForce,
    ownershipGeneration: status.ownershipGeneration,
    controlledSince:
      status.controlledSince ??
      (indexed && addressesMatch(indexed.controller, status.controller)
        ? indexed.controlledSince
        : null),
  };
}

function effectiveSectorStatesMatch(
  left: EffectiveSectorState | null,
  right: EffectiveSectorState | null
): boolean {
  if (left === null || right === null) return left === right;
  return (
    addressesMatch(left.controller, right.controller) &&
    left.captureForce === right.captureForce &&
    left.ownershipGeneration === right.ownershipGeneration &&
    left.controlledSince === right.controlledSince
  );
}

export function sectorStatusMatchesIndexedState(
  status: SectorStatus,
  indexed: IndexedSector | undefined
): boolean {
  return effectiveSectorStatesMatch(
    effectiveSectorStatusState(status, indexed),
    effectiveIndexedSectorState(indexed)
  );
}

export function sectorStatusesHaveSameEffectiveState(
  left: SectorStatus,
  right: SectorStatus,
  indexed: IndexedSector | undefined
): boolean {
  return effectiveSectorStatesMatch(
    effectiveSectorStatusState(left, indexed),
    effectiveSectorStatusState(right, indexed)
  );
}

/**
 * Mirrors the Control System's minimum takeover: 10% more than the garrison,
 * rounded up to the next base unit (at least one), never below the minimum
 * stake.
 */
export function minimumTakeoverForce(
  minimumStake: bigint,
  captureForce: bigint
): bigint {
  let raised = captureForce;
  if (captureForce !== MAX_U128) {
    const tenth = (captureForce + 9n) / 10n;
    const increment = tenth > 0n ? tenth : 1n;
    raised =
      increment > MAX_U128 - captureForce ? MAX_U128 : captureForce + increment;
  }
  return raised > minimumStake ? raised : minimumStake;
}

/**
 * A Sector's status from indexed state, matching `get_sector_status` except
 * that only a chain read can see an owner who unpooled outside the game and
 * has not been synced yet (`needsSync`).
 */
export function sectorStatusFromIndex(
  id: number,
  active: EffectiveSectorState | undefined,
  indexed: IndexedSector | undefined,
  known: SectorStatus | undefined,
  minimumStake: bigint
): SectorStatus {
  if (active) {
    return {
      id,
      ...active,
      requiredStake: minimumTakeoverForce(minimumStake, active.captureForce),
      stale: false,
      needsSync: false,
    };
  }
  return {
    id,
    controller: '0x0',
    captureForce: 0n,
    ownershipGeneration:
      known?.ownershipGeneration ?? indexed?.ownershipGeneration ?? 0n,
    controlledSince: null,
    requiredStake: minimumStake,
    stale: known ? known.stale : (indexed?.stale ?? false),
    needsSync: known?.needsSync ?? false,
  };
}

/**
 * Drops chain-read overrides once the index has caught up with them or moved
 * past them, so a later change by another Operator is not masked.
 */
export function pruneKnownSectors(
  known: Map<number, SectorStatus>,
  indexed: ReadonlyMap<number, IndexedSector>
): Map<number, SectorStatus> {
  let next: Map<number, SectorStatus> | null = null;
  for (const [id, status] of known) {
    const sector = indexed.get(id);
    if (!sector) continue;
    const superseded =
      sector.ownershipGeneration > status.ownershipGeneration ||
      (sector.ownershipGeneration === status.ownershipGeneration &&
        (sector.stale === true ||
          sectorStatusMatchesIndexedState(status, sector)));
    if (!superseded) continue;
    next ??= new Map(known);
    next.delete(id);
  }
  return next ?? known;
}
