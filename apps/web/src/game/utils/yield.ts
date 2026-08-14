const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const PERCENT_DECIMALS = 4;
const PERCENT_SCALE = 10n ** BigInt(PERCENT_DECIMALS);

export interface YieldMetrics {
  effectivePercent: number | null;
  projectedAnnualRewards: bigint | null;
  projectedAnnualPercent: number | null;
  observationDays: number | null;
}

function percentage(numerator: bigint, denominator: bigint): number | null {
  if (denominator <= 0n) return null;

  const scaled = (numerator * 100n * PERCENT_SCALE) / denominator;
  return Number(scaled) / Number(PERCENT_SCALE);
}

export function calculateYieldMetrics(
  stakedAmount: bigint,
  lifetimeRewards: bigint | null,
  currentPeriodRewards: bigint,
  currentPeriodSince: string | null,
  now = Date.now()
): YieldMetrics {
  if (lifetimeRewards === null || stakedAmount <= 0n) {
    return {
      effectivePercent: null,
      projectedAnnualRewards: null,
      projectedAnnualPercent: null,
      observationDays: null,
    };
  }

  const effectivePercent = percentage(lifetimeRewards, stakedAmount);
  const startedAt =
    currentPeriodSince === null ? Number.NaN : Date.parse(currentPeriodSince);
  const elapsedMs = now - startedAt;

  if (!Number.isFinite(startedAt) || elapsedMs <= 0) {
    return {
      effectivePercent,
      projectedAnnualRewards: null,
      projectedAnnualPercent: null,
      observationDays: null,
    };
  }

  const projectedAnnualRewards =
    (currentPeriodRewards * BigInt(Math.round(YEAR_MS))) /
    BigInt(Math.round(elapsedMs));

  return {
    effectivePercent,
    projectedAnnualRewards,
    projectedAnnualPercent: percentage(projectedAnnualRewards, stakedAmount),
    observationDays: elapsedMs / (24 * 60 * 60 * 1000),
  };
}
