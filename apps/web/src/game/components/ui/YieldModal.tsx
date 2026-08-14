import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useControlPoints } from '../../contexts/ControlPointContext';
import { useYield } from '../../contexts/useYield';
import { useWallet } from '../../contexts/WalletContext';
import { formatStrk, formatStrkFixed } from '../../utils/format';
import {
  accruedAtAnnualRate,
  annualRateFractionDigits,
  calculateYieldMetrics,
  calculateYieldPercent,
  rebaseAnimatedAnnualYield,
} from '../../utils/yield';

function yieldValue(value: bigint | null, digits = 6): string {
  return value === null ? '—' : `${formatStrk(value, digits)} STRK`;
}

function percentValue(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(4)}%`;
}

function observationValue(days: number | null): string {
  if (days === null) return 'ENTRY DATE UNAVAILABLE';
  if (days < 1) return '<1D WINDOW';
  return `${Math.floor(days)}D WINDOW`;
}

function durationValue(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;

  if (days > 0) return `${days}D ${hours}H ${minutes}M`;
  if (hours > 0) return `${hours}H ${minutes}M ${remainder}S`;
  return `${minutes}M ${remainder}S`;
}

function unlockValue(timestamp: number | null): string {
  if (timestamp === null) return 'READING OFFICIAL EXIT WINDOW…';
  return new Date(timestamp * 1_000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function useCurrentTimestamp(active: boolean): number {
  const [timestamp, setTimestamp] = useState(() =>
    Math.floor(Date.now() / 1_000)
  );

  useEffect(() => {
    if (!active) return;
    setTimestamp(Math.floor(Date.now() / 1_000));
    const interval = window.setInterval(
      () => setTimestamp(Math.floor(Date.now() / 1_000)),
      1_000
    );
    return () => window.clearInterval(interval);
  }, [active]);

  return timestamp;
}

function AnimatedAnnualYield({
  value,
  annualRate,
  periodKey,
  onValueChange,
}: {
  value: bigint | null;
  annualRate: bigint | null;
  periodKey: string | null;
  onValueChange: (periodKey: string | null, value: bigint | null) => void;
}) {
  const [animatedValue, setAnimatedValue] = useState(value);
  const fractionDigits =
    annualRate === null ? 4 : annualRateFractionDigits(annualRate);

  useEffect(() => {
    setAnimatedValue(value);
    onValueChange(periodKey, value);

    if (
      annualRate === null ||
      annualRate <= 0n ||
      value === null ||
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const startedAt = performance.now();
    let animationFrame = 0;
    let lastVisibleValue = formatStrkFixed(value, fractionDigits);

    const tick = (now: number) => {
      const nextValue =
        value + accruedAtAnnualRate(annualRate, now - startedAt);
      const nextVisibleValue = formatStrkFixed(nextValue, fractionDigits);
      if (nextVisibleValue !== lastVisibleValue) {
        lastVisibleValue = nextVisibleValue;
        onValueChange(periodKey, nextValue);
        setAnimatedValue(nextValue);
      }
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [annualRate, fractionDigits, onValueChange, periodKey, value]);

  return (
    <>
      <span aria-hidden="true">
        {animatedValue === null
          ? '—'
          : `${formatStrkFixed(animatedValue, fractionDigits)} STRK`}
      </span>
      <span className="sr-only">{yieldValue(value, 4)}</span>
    </>
  );
}

export function YieldModal() {
  const { address } = useWallet();
  const { operatorStatus } = useControlPoints();
  const {
    summary,
    isLoading,
    error,
    historyError,
    isOpen,
    claimPhase,
    claimError,
    unstakePhase,
    withdrawPhase,
    stakingError,
    closeStaking,
    claimYield,
    unstakeAll,
    withdrawUnstaked,
  } = useYield();
  const [exitArmed, setExitArmed] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const projectedAnnualContinuityRef = useRef<{
    periodKey: string | null;
    value: bigint | null;
  }>({ periodKey: null, value: null });
  const hasPendingExit = (summary?.unpoolAmount ?? 0n) > 0n;
  const now = useCurrentTimestamp(isOpen && hasPendingExit);
  const isBusy =
    claimPhase !== 'idle' ||
    unstakePhase !== 'idle' ||
    withdrawPhase !== 'idle';

  const rememberProjectedAnnualValue = useCallback(
    (periodKey: string | null, value: bigint | null) => {
      const current = projectedAnnualContinuityRef.current;
      if (current.periodKey !== periodKey) return;
      current.value = rebaseAnimatedAnnualYield(current.value, value, false);
    },
    []
  );

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeStaking();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [closeStaking, isOpen]);

  useEffect(() => {
    if (!isOpen || hasPendingExit) setExitArmed(false);
  }, [hasPendingExit, isOpen]);

  const unclaimedPercent = useMemo(() => {
    if (!summary?.lifetimeRewards || summary.lifetimeRewards === 0n) return 0;
    return (
      Number((summary.unclaimedRewards * 10_000n) / summary.lifetimeRewards) /
      100
    );
  }, [summary]);
  const metrics = useMemo(
    () =>
      calculateYieldMetrics(
        summary?.stakedAmount ?? 0n,
        summary?.lifetimeRewards ?? null,
        summary?.unclaimedRewards ?? 0n,
        summary?.claims[0]?.executedAt ?? summary?.memberSince ?? null
      ),
    [summary]
  );
  const rewardPeriodKey = address
    ? `${address}:${summary?.claims[0]?.executedAt ?? summary?.memberSince ?? ''}`
    : null;
  const previousProjection = projectedAnnualContinuityRef.current;
  const projectedAnnualDisplayValue = rebaseAnimatedAnnualYield(
    previousProjection.periodKey === rewardPeriodKey
      ? previousProjection.value
      : null,
    metrics.projectedAnnualRewards,
    previousProjection.periodKey !== rewardPeriodKey ||
      metrics.projectedAnnualRewards === 0n
  );
  projectedAnnualContinuityRef.current = {
    periodKey: rewardPeriodKey,
    value: projectedAnnualDisplayValue,
  };
  const projectedAnnualDisplayPercent =
    projectedAnnualDisplayValue === null
      ? null
      : calculateYieldPercent(
          projectedAnnualDisplayValue,
          summary?.stakedAmount ?? 0n
        );

  if (!isOpen) return null;

  const claimLabel =
    claimPhase === 'submitting'
      ? 'AUTHORIZE CLAIM…'
      : claimPhase === 'confirming'
        ? 'CONFIRMING CLAIM…'
        : summary?.unclaimedRewards
          ? `CLAIM ${formatStrk(summary.unclaimedRewards, 6)} STRK`
          : 'NO YIELD TO CLAIM';
  const unlockTimestamp = summary?.unpoolTime ?? null;
  const withdrawalUnlocked =
    hasPendingExit && unlockTimestamp !== null && now >= unlockTimestamp;
  const withdrawalRemaining =
    unlockTimestamp === null ? null : Math.max(0, unlockTimestamp - now);
  const exitWindow = summary?.exitWaitWindowSeconds ?? null;
  const progress = withdrawalUnlocked
    ? 100
    : unlockTimestamp === null || exitWindow === null || exitWindow <= 0
      ? 0
      : Math.max(
          0,
          Math.min(
            100,
            ((now - (unlockTimestamp - exitWindow)) / exitWindow) * 100
          )
        );
  const pointCount = operatorStatus?.controlledPointCount ?? 0;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 font-mono backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) closeStaking();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="staking-position-title"
        className="max-h-full w-full max-w-2xl overflow-y-auto border border-neutral-500 bg-black shadow-[10px_10px_0_rgba(255,255,255,0.08)]"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-grid bg-black px-5 py-4">
          <div>
            <div className="text-[9px] tracking-[0.24em] text-neutral-500">
              OFFICIAL STARKNET DELEGATION
            </div>
            <h2
              id="staking-position-title"
              className="mt-1 text-sm tracking-[0.18em] text-white"
            >
              STAKING // POSITION
            </h2>
          </div>
          <div className="flex items-center">
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeStaking}
              disabled={isBusy}
              className="px-2 py-1 text-lg leading-none text-neutral-500 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-white disabled:cursor-wait disabled:text-neutral-700"
              aria-label="Close staking position"
            >
              ×
            </button>
          </div>
        </header>

        {!address ? (
          <div className="px-5 py-12 text-center">
            <div className="text-xs tracking-[0.18em] text-white">
              CONNECT AN OPERATOR
            </div>
            <p className="mx-auto mt-3 max-w-sm text-[10px] leading-relaxed tracking-[0.08em] text-neutral-500">
              Connect your wallet to inspect its staking position, validator
              yield, and withdrawal status.
            </p>
          </div>
        ) : (
          <div className="px-5 py-5">
            <div className="grid grid-cols-1 border border-grid sm:grid-cols-3">
              <div className="border-b border-grid px-4 py-3 sm:border-b-0 sm:border-r">
                <div className="text-[9px] tracking-[0.18em] text-neutral-500">
                  ACTIVE STAKE
                </div>
                <div className="mt-1 text-sm text-white">
                  {isLoading && !summary
                    ? 'READING…'
                    : yieldValue(summary?.stakedAmount ?? null, 4)}
                </div>
              </div>
              <div className="border-b border-grid px-4 py-3 sm:border-b-0 sm:border-r">
                <div className="text-[9px] tracking-[0.18em] text-neutral-500">
                  EXIT QUEUE
                </div>
                <div className="mt-1 text-sm text-white">
                  {yieldValue(summary?.unpoolAmount ?? null, 4)}
                </div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[9px] tracking-[0.18em] text-neutral-500">
                  POOL COMMISSION
                </div>
                <div className="mt-1 text-sm text-white">
                  {summary?.commissionBps === null || !summary
                    ? '—'
                    : `${(summary.commissionBps / 100).toFixed(2)}%`}
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-grid pt-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-[9px] tracking-[0.2em] text-neutral-500">
                    LIFETIME YIELD
                  </div>
                  <div className="mt-1 text-2xl tracking-tight text-white">
                    {isLoading && !summary
                      ? 'READING…'
                      : yieldValue(summary?.lifetimeRewards ?? null)}
                  </div>
                </div>
                <div className="text-right text-[8px] tracking-[0.14em] text-neutral-600">
                  VALIDATOR REWARD LEDGER
                </div>
              </div>

              <div
                className="mt-5 flex h-2 overflow-hidden border border-neutral-700"
                title={`${unclaimedPercent.toFixed(2)}% of indexed lifetime yield is currently unclaimed`}
              >
                <div className="h-full flex-1 bg-neutral-800" />
                <div
                  className="h-full bg-white"
                  style={{
                    width: `${Math.max(0, Math.min(100, unclaimedPercent))}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[8px] tracking-[0.16em] text-neutral-600">
                <span>CLAIMED</span>
                <span className="text-neutral-300">AVAILABLE</span>
              </div>

              <div className="mt-5 grid grid-cols-2 border border-grid">
                <div className="border-r border-grid px-4 py-3">
                  <div className="text-[9px] tracking-[0.18em] text-neutral-500">
                    CLAIMED
                  </div>
                  <div className="mt-1 text-sm text-neutral-300">
                    {yieldValue(summary?.claimedRewards ?? null)}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[9px] tracking-[0.18em] text-neutral-500">
                    UNCLAIMED
                  </div>
                  <div className="mt-1 text-sm text-white">
                    {yieldValue(summary ? summary.unclaimedRewards : null)}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 border border-grid sm:grid-cols-2">
                <div
                  className="border-b border-grid px-4 py-3 sm:border-b-0 sm:border-r"
                  title="Lifetime rewards divided by current delegated stake"
                >
                  <div className="text-[9px] tracking-[0.18em] text-neutral-500">
                    EFFECTIVE YIELD
                  </div>
                  <div className="mt-1 text-sm text-white">
                    {percentValue(metrics.effectivePercent)}
                  </div>
                  <div className="mt-1 text-[8px] tracking-[0.1em] text-neutral-600">
                    LIFETIME / CURRENT STAKE
                  </div>
                </div>
                <div
                  className="px-4 py-3"
                  title="Unclaimed rewards projected linearly over one year from the last claim, or pool entry when no claims exist."
                >
                  <div className="text-[9px] tracking-[0.18em] text-neutral-500">
                    PROJECTED ANNUAL
                  </div>
                  <div className="mt-1 text-sm tabular-nums text-white">
                    <AnimatedAnnualYield
                      value={projectedAnnualDisplayValue}
                      annualRate={metrics.projectedAnnualRewards}
                      periodKey={rewardPeriodKey}
                      onValueChange={rememberProjectedAnnualValue}
                    />
                  </div>
                  <div className="mt-1 text-[8px] tracking-[0.1em] text-neutral-600">
                    {projectedAnnualDisplayPercent === null
                      ? 'ENTRY DATE UNAVAILABLE'
                      : `${percentValue(projectedAnnualDisplayPercent)} · ${observationValue(metrics.observationDays)}`}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void claimYield()}
                disabled={
                  isLoading ||
                  isBusy ||
                  !summary ||
                  summary.unclaimedRewards === 0n
                }
                className="mt-5 w-full border border-white bg-white px-4 py-3 text-[10px] font-semibold tracking-[0.2em] text-black transition-colors hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-500"
              >
                {claimLabel}
              </button>
            </div>

            <div className="mt-6 border-t border-grid pt-5">
              <div className="text-[9px] tracking-[0.2em] text-neutral-500">
                WITHDRAWAL CONTROL
              </div>

              {hasPendingExit ? (
                <div className="mt-3 border border-amber-500/60 bg-amber-500/[0.04] p-4">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <div className="text-[9px] tracking-[0.18em] text-amber-400">
                        {withdrawalUnlocked
                          ? 'WITHDRAWAL UNLOCKED'
                          : 'OFFICIAL EXIT WINDOW'}
                      </div>
                      <div className="mt-1 text-lg text-white">
                        {yieldValue(summary?.unpoolAmount ?? null, 6)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm tabular-nums text-white">
                        {withdrawalRemaining === null
                          ? 'SYNCING…'
                          : withdrawalUnlocked
                            ? 'READY'
                            : durationValue(withdrawalRemaining)}
                      </div>
                      <div className="mt-1 text-[8px] tracking-[0.12em] text-neutral-500">
                        {unlockValue(unlockTimestamp)}
                      </div>
                    </div>
                  </div>
                  <div
                    className="mt-4 h-2 overflow-hidden border border-amber-500/40 bg-black"
                    role="progressbar"
                    aria-label="Official staking withdrawal progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress)}
                  >
                    <div
                      className="h-full bg-amber-400 transition-[width] duration-1000 motion-reduce:transition-none"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-[8px] tracking-[0.14em] text-neutral-600">
                    <span>EXIT SUBMITTED</span>
                    <span>FUNDS RELEASED</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void withdrawUnstaked()}
                    disabled={!withdrawalUnlocked || isBusy}
                    className="mt-4 w-full border border-amber-400 px-4 py-3 text-[10px] font-semibold tracking-[0.18em] text-amber-300 transition-colors hover:bg-amber-400 hover:text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:text-neutral-600"
                  >
                    {withdrawPhase === 'submitting'
                      ? 'AUTHORIZE WITHDRAWAL…'
                      : withdrawPhase === 'confirming'
                        ? 'CONFIRMING WITHDRAWAL…'
                        : withdrawalUnlocked
                          ? `WITHDRAW ${formatStrk(summary?.unpoolAmount ?? 0n, 6)} STRK`
                          : 'WITHDRAWAL LOCKED'}
                  </button>
                </div>
              ) : (
                <div className="mt-3 border border-neutral-700 p-4">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 text-sm text-amber-400"
                    >
                      !
                    </span>
                    <div>
                      <div className="text-[10px] tracking-[0.16em] text-white">
                        LEAVE STAKEWARS
                      </div>
                      <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">
                        Relinquishes {pointCount || 'all'} active Control
                        {pointCount === 1 ? ' Point' : ' Points'} immediately
                        and places your full active stake into the official
                        Starknet exit window. This does not withdraw funds
                        immediately.
                      </p>
                    </div>
                  </div>

                  {exitArmed ? (
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                      <button
                        type="button"
                        onClick={() => void unstakeAll()}
                        disabled={isBusy || !summary?.stakedAmount}
                        className="border border-amber-400 bg-amber-400 px-4 py-3 text-[10px] font-semibold tracking-[0.16em] text-black transition-colors hover:bg-black hover:text-amber-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-600"
                      >
                        {unstakePhase === 'submitting'
                          ? 'AUTHORIZE EXIT…'
                          : unstakePhase === 'confirming'
                            ? 'CONFIRMING EXIT…'
                            : `CONFIRM UNSTAKE ${formatStrk(summary?.stakedAmount ?? 0n, 6)} STRK`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExitArmed(false)}
                        disabled={isBusy}
                        className="border border-neutral-700 px-4 py-3 text-[10px] tracking-[0.16em] text-neutral-400 transition-colors hover:border-white hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:text-neutral-700"
                      >
                        CANCEL
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExitArmed(true)}
                      disabled={
                        isLoading ||
                        isBusy ||
                        !summary ||
                        summary.stakedAmount === 0n
                      }
                      className="mt-4 w-full border border-neutral-600 px-4 py-3 text-[10px] font-semibold tracking-[0.18em] text-neutral-300 transition-colors hover:border-amber-400 hover:text-amber-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-700"
                    >
                      {summary?.stakedAmount
                        ? 'UNSTAKE & RELINQUISH ALL'
                        : 'NO ACTIVE STAKE'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {error ? (
              <div className="mt-4 border-l-2 border-amber-400 pl-3 text-[10px] leading-relaxed text-amber-400">
                STAKING READ FAILED · {error}
              </div>
            ) : null}
            {historyError ? (
              <div className="mt-4 border-l-2 border-amber-400 pl-3 text-[10px] leading-relaxed text-amber-400">
                CLAIM HISTORY UNAVAILABLE · Lifetime yield is hidden until Torii
                history is available.
              </div>
            ) : null}
            {claimError ? (
              <div className="mt-4 border-l-2 border-amber-400 pl-3 text-[10px] leading-relaxed text-amber-400">
                CLAIM FAILED · {claimError}
              </div>
            ) : null}
            {stakingError ? (
              <div className="mt-4 border-l-2 border-amber-400 pl-3 text-[10px] leading-relaxed text-amber-400">
                STAKING ACTION FAILED · {stakingError}
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
