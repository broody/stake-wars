import type { SectorStatus } from '../types';
import { addressesMatch, isZeroAddress } from '../utils/format';

export interface BatchSectorGroups {
  neutral: SectorStatus[];
  owned: SectorStatus[];
  individualOnly: SectorStatus[];
}

export function groupBatchSectors(
  sectors: readonly SectorStatus[],
  operatorAddress: string | null
): BatchSectorGroups {
  const groups: BatchSectorGroups = {
    neutral: [],
    owned: [],
    individualOnly: [],
  };

  for (const sector of sectors) {
    const actionable =
      !sector.stale && !sector.needsSync && sector.activeChallengeId === 0n;

    if (actionable && isZeroAddress(sector.controller)) {
      groups.neutral.push(sector);
    } else if (
      actionable &&
      operatorAddress &&
      addressesMatch(sector.controller, operatorAddress)
    ) {
      groups.owned.push(sector);
    } else {
      groups.individualOnly.push(sector);
    }
  }

  return groups;
}
