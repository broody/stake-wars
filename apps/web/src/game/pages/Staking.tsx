import { useEffect, useMemo, useState } from 'react';
import { WalletButton } from '../components/ui/WalletButton';
import { useSectors } from '../contexts/SectorContext';
import { useWallet } from '../contexts/WalletContext';
import { useYield } from '../contexts/useYield';
import { getStrkBalance } from '../services/starknet';
import { formatStrk, parseStrk } from '../utils/format';
import { calculateYieldMetrics, calculateYieldPercent } from '../utils/yield';

const MAX_U128 = (1n << 128n) - 1n;

function Metric({
  label,
  value,
  unit,
  emphasis = false,
}: {
  label: string;
  value: bigint | null;
  unit: 'STRK' | 'FORCE';
  emphasis?: boolean;
}) {
  return (
    <div className="border-b border-r border-grid px-4 py-4">
      <div className="text-[9px] tracking-[0.2em] text-neutral-500">
        {label}
      </div>
      <div
        className={`mt-2 text-lg tabular-nums ${emphasis ? 'text-white' : 'text-neutral-300'}`}
      >
        {value === null ? '—' : formatStrk(value, 6)} {unit}
      </div>
    </div>
  );
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

function percentValue(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(4)}%`;
}

export function Staking() {
  const { address, isConnected } = useWallet();
  const { operatorStatus, isOperatorLoading, operatorError, refreshOperator } =
    useSectors();
  const {
    summary,
    isLoading,
    error,
    historyError,
    stakePhase,
    stakeError,
    claimPhase,
    claimError,
    unstakePhase,
    withdrawPhase,
    stakingError,
    stake,
    claimYield,
    unstakeAll,
    withdrawUnstaked,
  } = useYield();
  const [amount, setAmount] = useState('');
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [balanceRevision, setBalanceRevision] = useState(0);
  const [exitArmed, setExitArmed] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1_000));

  const hasPendingExit = (summary?.unpoolAmount ?? 0n) > 0n;
  const isBusy =
    stakePhase !== 'idle' ||
    claimPhase !== 'idle' ||
    unstakePhase !== 'idle' ||
    withdrawPhase !== 'idle';

  useEffect(() => {
    const controller = new AbortController();
    if (!address) {
      setWalletBalance(null);
      setWalletError(null);
      return () => controller.abort();
    }

    setWalletError(null);
    getStrkBalance(address, controller.signal)
      .then(setWalletBalance)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setWalletError(
            reason instanceof Error
              ? reason.message
              : 'Unable to read wallet STRK balance.'
          );
        }
      });
    return () => controller.abort();
  }, [address, balanceRevision]);

  useEffect(() => {
    if (!hasPendingExit) return;
    const updateClock = () => setNow(Math.floor(Date.now() / 1_000));
    updateClock();
    const interval = window.setInterval(updateClock, 1_000);
    return () => window.clearInterval(interval);
  }, [hasPendingExit]);

  useEffect(() => {
    if (hasPendingExit) setExitArmed(false);
  }, [hasPendingExit]);

  const parsedAmount = useMemo(() => {
    if (!amount.trim()) return { value: 0n, error: null };
    try {
      const value = parseStrk(amount, 'STRK');
      return value > MAX_U128
        ? { value: null, error: 'Amount is too large.' }
        : { value, error: null };
    } catch (reason) {
      return {
        value: null,
        error:
          reason instanceof Error ? reason.message : 'Enter a valid amount.',
      };
    }
  }, [amount]);

  const stakeDisabledReason = useMemo(() => {
    if (!operatorStatus || isOperatorLoading) return 'READING OPERATOR STATE';
    if (operatorStatus.retired) return 'ADDRESS PERMANENTLY RETIRED';
    if (operatorStatus.exiting || hasPendingExit)
      return 'EXIT ALREADY IN PROGRESS';
    if (walletBalance === null) return 'READING WALLET STRK';
    if (parsedAmount.error) return 'ENTER A VALID STRK AMOUNT';
    if (!parsedAmount.value) return 'ENTER STRK AMOUNT';
    if (parsedAmount.value > walletBalance) return 'INSUFFICIENT WALLET STRK';
    return null;
  }, [
    hasPendingExit,
    isOperatorLoading,
    operatorStatus,
    parsedAmount,
    walletBalance,
  ]);

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
  const projectedPercent =
    metrics.projectedAnnualRewards === null
      ? null
      : calculateYieldPercent(
          metrics.projectedAnnualRewards,
          summary?.stakedAmount ?? 0n
        );
  const unlockTimestamp = summary?.unpoolTime ?? null;
  const withdrawalUnlocked =
    hasPendingExit && unlockTimestamp !== null && now >= unlockTimestamp;
  const withdrawalRemaining =
    unlockTimestamp === null ? null : Math.max(0, unlockTimestamp - now);
  const exitWindow = summary?.exitWaitWindowSeconds ?? null;
  const withdrawalProgress = withdrawalUnlocked
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

  const submitStake = async () => {
    if (stakeDisabledReason || parsedAmount.value === null) return;
    await stake(parsedAmount.value);
    setBalanceRevision((current) => current + 1);
  };

  if (!isConnected) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg px-4">
        <div className="w-full max-w-md border border-grid p-8 text-center font-mono">
          <div className="text-xs tracking-[0.24em] text-dim">
            FORCE GENERATION
          </div>
          <h1 className="mb-4 mt-3 text-2xl tracking-wider text-white">
            CONNECT YOUR WALLET
          </h1>
          <p className="mb-6 text-sm leading-relaxed text-neutral-500">
            Stake STRK with the Stake Wars validator and turn it into deployable
            FORCE.
          </p>
          <div className="inline-block">
            <WalletButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-bg font-mono">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-24">
        <header className="border-b border-grid pb-8">
          <div>
            <div className="text-[10px] tracking-[0.28em] text-neutral-500">
              OFFICIAL STARKNET STAKING
            </div>
            <h1 className="mt-3 text-4xl tracking-[-0.04em] text-white sm:text-6xl">
              GENERATE FORCE
            </h1>
          </div>
        </header>

        <section className="mt-8 grid border-l border-t border-grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="border-b border-r border-grid p-5 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg tracking-[0.12em] text-white">
                  STAKE STRK NOW
                </h2>
              </div>
              <div className="text-right text-[9px] tracking-[0.14em] text-neutral-500">
                WALLET BALANCE
                <div className="mt-1 text-xs text-neutral-300">
                  {walletBalance === null
                    ? 'READING…'
                    : `${formatStrk(walletBalance, 6)} STRK`}
                </div>
              </div>
            </div>

            <label
              htmlFor="stake-amount"
              className="mt-8 block text-[9px] tracking-[0.2em] text-neutral-500"
            >
              AMOUNT TO STAKE
            </label>
            <div className="mt-2 flex border border-neutral-600 focus-within:border-white">
              <input
                id="stake-amount"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.0"
                aria-describedby="stake-conversion"
                disabled={isBusy || operatorStatus?.retired}
                className="min-w-0 flex-1 bg-black px-4 py-4 text-xl text-white outline-none placeholder:text-neutral-700 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() =>
                  setAmount(
                    walletBalance === null ? '' : formatStrk(walletBalance, 18)
                  )
                }
                disabled={walletBalance === null || isBusy}
                className="border-l border-neutral-700 px-4 text-[9px] tracking-[0.18em] text-neutral-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-white disabled:text-neutral-700"
              >
                MAX
              </button>
            </div>

            <div
              id="stake-conversion"
              className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center border-y border-grid py-3 text-center"
            >
              <div>
                <div className="text-[8px] tracking-[0.18em] text-neutral-600">
                  STAKE
                </div>
                <div className="mt-1 text-xs text-white">1 STRK</div>
              </div>
              <div className="px-4 text-neutral-600" aria-hidden="true">
                ───▶
              </div>
              <div>
                <div className="text-[8px] tracking-[0.18em] text-neutral-600">
                  GENERATE
                </div>
                <div className="mt-1 text-xs text-white">1 FORCE</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void submitStake()}
              disabled={Boolean(stakeDisabledReason) || isBusy}
              className="mt-5 w-full border border-white bg-white px-4 py-4 text-[10px] font-semibold tracking-[0.22em] text-black transition-colors hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-500"
            >
              {stakePhase === 'submitting'
                ? 'AUTHORIZE STAKE…'
                : stakePhase === 'confirming'
                  ? 'CONFIRMING ON SEPOLIA…'
                  : stakeDisabledReason ||
                    `STAKE ${formatStrk(parsedAmount.value ?? 0n, 18)} STRK`}
            </button>

            {parsedAmount.error || walletError || stakeError ? (
              <p className="mt-3 text-[10px] leading-relaxed text-amber-400">
                {parsedAmount.error || walletError || stakeError}
              </p>
            ) : null}
          </div>

          <div className="border-b border-r border-grid">
            <div className="border-b border-grid px-5 py-4">
              <div className="text-[9px] tracking-[0.22em] text-neutral-500">
                LIVE POSITION
              </div>
            </div>
            <div className="grid grid-cols-2 border-l border-t border-grid">
              <Metric
                label="ACTIVE STAKE"
                value={summary?.stakedAmount ?? null}
                unit="STRK"
                emphasis
              />
              <Metric
                label="AVAILABLE"
                value={operatorStatus?.availableForce ?? null}
                unit="FORCE"
                emphasis
              />
              <Metric
                label="COMMITTED"
                value={
                  operatorStatus
                    ? operatorStatus.sectorForce + operatorStatus.challengeForce
                    : null
                }
                unit="FORCE"
              />
              <Metric
                label="SPENT"
                value={operatorStatus?.spentForce ?? null}
                unit="FORCE"
              />
            </div>
            <div className="p-5 text-[10px] leading-5 text-neutral-500">
              FORCE is allocation accounting, not a separate token. Uncommitted
              FORCE stays ready for captures, reinforcements, and challenges.
            </div>
          </div>
        </section>

        <section className="mt-8 border border-grid p-5 sm:p-7">
          <div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[9px] tracking-[0.22em] text-neutral-500">
                  VALIDATOR YIELD
                </div>
                <div className="mt-2 text-2xl text-white">
                  {isLoading && !summary
                    ? 'READING…'
                    : `${formatStrk(summary?.lifetimeRewards ?? 0n, 6)} STRK`}
                </div>
              </div>
              <div className="text-right text-[9px] leading-5 text-neutral-500">
                <div>EFFECTIVE {percentValue(metrics.effectivePercent)}</div>
                <div>PROJECTED {percentValue(projectedPercent)} / YR</div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 border-l border-t border-grid">
              <Metric
                label="CLAIMED"
                value={summary?.claimedRewards ?? null}
                unit="STRK"
              />
              <Metric
                label="UNCLAIMED"
                value={summary?.unclaimedRewards ?? null}
                unit="STRK"
                emphasis
              />
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
              className="mt-4 w-full border border-neutral-500 px-4 py-3 text-[9px] tracking-[0.2em] text-white transition-colors hover:border-white hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-700"
            >
              {claimPhase === 'submitting'
                ? 'AUTHORIZE CLAIM…'
                : claimPhase === 'confirming'
                  ? 'CONFIRMING CLAIM…'
                  : summary?.unclaimedRewards
                    ? `CLAIM ${formatStrk(summary.unclaimedRewards, 6)} STRK`
                    : 'NO YIELD TO CLAIM'}
            </button>
          </div>
        </section>

        <section className="mt-8 border border-grid p-5 sm:p-7">
          <div className="text-[9px] tracking-[0.22em] text-neutral-500">
            WITHDRAWAL CONTROL
          </div>

          {hasPendingExit ? (
            <div className="mt-4 border border-amber-500/60 bg-amber-500/[0.04] p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-[9px] tracking-[0.18em] text-amber-400">
                    {withdrawalUnlocked
                      ? 'WITHDRAWAL UNLOCKED'
                      : 'OFFICIAL EXIT WINDOW'}
                  </div>
                  <div className="mt-2 text-xl text-white">
                    {formatStrk(summary?.unpoolAmount ?? 0n, 6)} STRK
                  </div>
                </div>
                <div className="text-right text-sm tabular-nums text-white">
                  {withdrawalRemaining === null
                    ? 'SYNCING…'
                    : withdrawalUnlocked
                      ? 'READY'
                      : durationValue(withdrawalRemaining)}
                </div>
              </div>
              <div
                className="mt-4 h-2 overflow-hidden border border-amber-500/40"
                role="progressbar"
                aria-label="Official staking withdrawal progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(withdrawalProgress)}
              >
                <div
                  className="h-full bg-amber-400 transition-[width] duration-1000 motion-reduce:transition-none"
                  style={{ width: `${withdrawalProgress}%` }}
                />
              </div>
              <button
                type="button"
                onClick={() => void withdrawUnstaked()}
                disabled={!withdrawalUnlocked || isBusy}
                className="mt-4 w-full border border-amber-400 px-4 py-3 text-[9px] tracking-[0.18em] text-amber-300 transition-colors hover:bg-amber-400 hover:text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:text-neutral-600"
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
            <div className="mt-4 grid gap-5 border border-neutral-800 p-5 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <div className="text-[10px] tracking-[0.16em] text-white">
                  LEAVE STAKE WARS
                </div>
                <p className="mt-2 max-w-3xl text-[10px] leading-5 text-neutral-500">
                  Unstaking permanently retires this address from the game,
                  relinquishes its Sectors, and starts the official Starknet
                  exit window. Restaking later will not reactivate the address.
                </p>
              </div>
              {exitArmed ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void unstakeAll()}
                    disabled={isBusy || !summary?.stakedAmount}
                    className="border border-amber-400 bg-amber-400 px-4 py-3 text-[9px] font-semibold tracking-[0.16em] text-black transition-colors hover:bg-black hover:text-amber-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-600"
                  >
                    {unstakePhase === 'submitting'
                      ? 'AUTHORIZE EXIT…'
                      : unstakePhase === 'confirming'
                        ? 'CONFIRMING EXIT…'
                        : 'CONFIRM PERMANENT EXIT'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExitArmed(false)}
                    disabled={isBusy}
                    className="border border-neutral-700 px-4 py-3 text-[9px] tracking-[0.16em] text-neutral-400 hover:border-white hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
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
                    !summary?.stakedAmount ||
                    operatorStatus?.retired
                  }
                  className="border border-neutral-700 px-4 py-3 text-[9px] tracking-[0.16em] text-neutral-400 transition-colors hover:border-amber-400 hover:text-amber-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-700"
                >
                  {operatorStatus?.retired
                    ? 'ADDRESS RETIRED'
                    : summary?.stakedAmount
                      ? 'UNSTAKE & PERMANENTLY RETIRE'
                      : 'NO ACTIVE STAKE'}
                </button>
              )}
            </div>
          )}
        </section>

        {operatorError ||
        error ||
        historyError ||
        claimError ||
        stakingError ? (
          <div className="mt-6 border-l-2 border-amber-400 pl-4 text-[10px] leading-5 text-amber-400">
            {operatorError ? (
              <button type="button" onClick={refreshOperator}>
                OPERATOR READ FAILED · RETRY
              </button>
            ) : null}
            {error ? <div>STAKING READ FAILED · {error}</div> : null}
            {historyError ? (
              <div>CLAIM HISTORY UNAVAILABLE · {historyError}</div>
            ) : null}
            {claimError ? <div>CLAIM FAILED · {claimError}</div> : null}
            {stakingError ? (
              <div>STAKING ACTION FAILED · {stakingError}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
