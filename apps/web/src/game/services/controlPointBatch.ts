import type { ControlPointStatus } from '../types';
import { addressesMatch, isZeroAddress } from '../utils/format';

export interface BatchControlPointGroups {
  neutral: ControlPointStatus[];
  owned: ControlPointStatus[];
  individualOnly: ControlPointStatus[];
}

export function groupBatchControlPoints(
  controlPoints: readonly ControlPointStatus[],
  operatorAddress: string | null
): BatchControlPointGroups {
  const groups: BatchControlPointGroups = {
    neutral: [],
    owned: [],
    individualOnly: [],
  };

  for (const controlPoint of controlPoints) {
    const actionable =
      !controlPoint.stale &&
      !controlPoint.needsSync &&
      controlPoint.activeChallengeId === 0n;

    if (actionable && isZeroAddress(controlPoint.controller)) {
      groups.neutral.push(controlPoint);
    } else if (
      actionable &&
      operatorAddress &&
      addressesMatch(controlPoint.controller, operatorAddress)
    ) {
      groups.owned.push(controlPoint);
    } else {
      groups.individualOnly.push(controlPoint);
    }
  }

  return groups;
}
