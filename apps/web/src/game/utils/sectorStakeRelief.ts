export const STAKE_RELIEF_CAP_STRK = 100_000;
export const MAX_STAKE_RELIEF_HEIGHT = 0.9;

const STRK_BASE_UNIT = 10n ** 18n;
const STAKE_RELIEF_CAP_BASE_UNITS =
  BigInt(STAKE_RELIEF_CAP_STRK) * STRK_BASE_UNIT;

function scaledStakeReliefHeight(
  stakedStrk: number,
  logarithmic: boolean
): number {
  if (!Number.isFinite(stakedStrk) || stakedStrk <= 0) return 0;
  const cappedStake = Math.min(stakedStrk, STAKE_RELIEF_CAP_STRK);

  if (!logarithmic) {
    return MAX_STAKE_RELIEF_HEIGHT * (cappedStake / STAKE_RELIEF_CAP_STRK);
  }

  return (
    (MAX_STAKE_RELIEF_HEIGHT * Math.log1p(cappedStake)) /
    Math.log1p(STAKE_RELIEF_CAP_STRK)
  );
}

export function stakeReliefHeight(
  stakedStrk: number,
  logarithmic = true
): number {
  return scaledStakeReliefHeight(stakedStrk, logarithmic);
}

export function stakeReliefHeightFromBaseUnits(
  stakedStrk: bigint,
  logarithmic = true
): number {
  if (stakedStrk <= 0n) return 0;
  const cappedStake =
    stakedStrk > STAKE_RELIEF_CAP_BASE_UNITS
      ? STAKE_RELIEF_CAP_BASE_UNITS
      : stakedStrk;
  const wholeStrk = Number(cappedStake) / Number(STRK_BASE_UNIT);
  return scaledStakeReliefHeight(wholeStrk, logarithmic);
}

export function sectorStakeHeights(
  enabled: boolean,
  sectorIds: readonly number[],
  captureForceBySector: ReadonlyMap<number, bigint>,
  logarithmic = true
): Map<number, number> {
  const heights = new Map<number, number>();
  sectorIds.forEach((sectorId) => {
    heights.set(
      sectorId,
      enabled
        ? stakeReliefHeightFromBaseUnits(
            captureForceBySector.get(sectorId) ?? 0n,
            logarithmic
          )
        : 0
    );
  });
  return heights;
}
