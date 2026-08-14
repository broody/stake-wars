const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const PERCENT_DECIMALS = 4;
const PERCENT_SCALE = 10n ** BigInt(PERCENT_DECIMALS);
const STRK_DECIMALS = 18;
const LIVE_TICK_TARGET_MS = 250;

export interface YieldMetrics {
  effectivePercent: number | null;
  projectedAnnualRewards: bigint | null;
  projectedAnnualPercent: number | null;
  observationDays: number | null;
}

export function accruedAtAnnualRate(
  annualRewards: bigint,
  elapsedMs: number
): bigint {
  if (annualRewards <= 0n || !Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 0n;
  }

  return (
    (annualRewards * BigInt(Math.floor(elapsedMs))) /
    BigInt(Math.round(YEAR_MS))
  );
}

export function annualRateFractionDigits(
  annualRewards: bigint,
  minimumDigits = 4,
  maximumDigits = 12
): number {
  const minimum = Math.max(
    0,
    Math.min(STRK_DECIMALS, Math.floor(minimumDigits))
  );
  const maximum = Math.max(
    minimum,
    Math.min(STRK_DECIMALS, Math.floor(maximumDigits))
  );
  if (annualRewards <= 0n) return minimum;

  const targetIncrement = accruedAtAnnualRate(
    annualRewards,
    LIVE_TICK_TARGET_MS
  );

  for (let digits = minimum; digits <= maximum; digits += 1) {
    const displayedUnit = 10n ** BigInt(STRK_DECIMALS - digits);
    if (targetIncrement >= displayedUnit) return digits;
  }

  return maximum;
}

export function rebaseAnimatedAnnualYield(
  displayedValue: bigint | null,
  refreshedValue: bigint | null,
  shouldReset: boolean
): bigint | null {
  if (shouldReset || displayedValue === null || refreshedValue === null) {
    return refreshedValue;
  }

  return displayedValue > refreshedValue ? displayedValue : refreshedValue;
}

export function calculateYieldPercent(
  numerator: bigint,
  denominator: bigint
): number | null {
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

  const effectivePercent = calculateYieldPercent(lifetimeRewards, stakedAmount);
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
    projectedAnnualPercent: calculateYieldPercent(
      projectedAnnualRewards,
      stakedAmount
    ),
    observationDays: elapsedMs / (24 * 60 * 60 * 1000),
  };
}
