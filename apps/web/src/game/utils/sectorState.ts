import type { IndexedSector, SectorStatus } from '../types';
import { addressesMatch, isZeroAddress } from './format';

interface EffectiveSectorState {
  controller: string;
  captureForce: bigint;
  ownershipGeneration: bigint;
  controlledSince: number | null;
  activeChallengeId: bigint;
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
    activeChallengeId: sector.activeChallengeId,
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
    activeChallengeId: status.activeChallengeId,
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
    left.controlledSince === right.controlledSince &&
    left.activeChallengeId === right.activeChallengeId
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
