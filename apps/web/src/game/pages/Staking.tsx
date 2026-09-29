import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { WalletButton } from '../components/ui/WalletButton';
import { ForceBreakdown } from '../components/ui/ForceBreakdown';
import { useSectors } from '../contexts/SectorContext';
import { useWallet } from '../contexts/WalletContext';
import { useYield } from '../contexts/useYield';
import { getStrkBalance } from '../services/starknet';
import { formatStrk, parseStrk } from '../utils/format';
import {
  stakeAmountFromSearch,
  stakeReturnsToCore,
} from '../utils/stakingRequest';
import { calculateYieldMetrics } from '../utils/yield';
import {
  Button,
  Callout,
  Eyebrow,
  PageTitle,
  Panel,
  PanelSection,
  Stat,
  StatGrid,
  panelStyles,
} from '../../ui';

const MAX_U128 = (1n << 128n) - 1n;
const VOYAGER_VALIDATOR_URL =
  'https://voyager.online/staking?validator=0x026232d459668b7183dd54e7cddccd27e168882b597743e233645cefa61eb1eb';
const VOYAGER_LOGO_URL = '/voyager-logo.svg';

function ValidatorLink() {
  return (
    <a
      href={VOYAGER_VALIDATOR_URL}
      target="_blank"
      rel="noreferrer"
      className={panelStyles(
        'accent',
        'group flex w-full items-stretch text-left transition-colors hover:border-accent hover:bg-accent/[0.1] sm:w-auto'
      )}
      aria-label="View the Stake Wars validator on Voyager (opens in a new tab)"
    >
      <div className="flex shrink-0 items-center justify-center border-r border-accent/40 px-4">
        <img
          src={VOYAGER_LOGO_URL}
          alt=""
          aria-hidden="true"
          className="h-9 w-auto"
        />
      </div>
      <div className="px-5 py-4">
        <Eyebrow tone="accent">OFFICIAL STARKNET VALIDATOR</Eyebrow>
        <div className="mt-1 text-label text-fg">
          VIEW &amp; STAKE ON VOYAGER{' '}
          <span
            aria-hidden="true"
            className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
          >
            ↗
          </span>
        </div>
      </div>
    </a>
  );
}

function strkValue(value: bigint | null): string {
  return value === null ? '—' : formatStrk(value, 6);
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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
  const [amount, setAmount] = useState(() =>
    stakeAmountFromSearch(searchParams)
  );
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
    const staked = await stake(parsedAmount.value);
    setBalanceRevision((current) => current + 1);
    // A stake started from a Sector action returns there to finish it.
    if (staked && stakeReturnsToCore(searchParams)) navigate('/');
  };

  if (!isConnected) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface px-4">
        <Panel as="div" className="w-full max-w-md p-8 text-center font-mono">
          <Eyebrow>OFFICIAL STARKNET STAKING</Eyebrow>
          <PageTitle className="mb-4 mt-3">CONNECT TO STAKE</PageTitle>
          <p className="mb-6 text-body leading-relaxed text-fg-subtle">
            Stake STRK with the Stake Wars validator and turn it into deployable
            FORCE.
          </p>
          <div className="inline-block">
            <WalletButton />
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-surface font-mono">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-24">
        <header className="flex flex-col gap-6 border-b border-line pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>OFFICIAL STARKNET STAKING · GENERATE FORCE</Eyebrow>
            <PageTitle className="mt-3">STAKE STRK</PageTitle>
          </div>
          <ValidatorLink />
        </header>

        <Panel className="mt-8 grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="border-b border-line p-5 sm:p-8 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-heading text-fg">STAKE STRK NOW</h2>
              </div>
              <div className="text-right text-label text-fg-subtle">
                WALLET BALANCE
                <div className="mt-1 text-caption text-fg-secondary">
                  {walletBalance === null
                    ? 'READING…'
                    : `${formatStrk(walletBalance, 6)} STRK`}
                </div>
              </div>
            </div>

            <label
              htmlFor="stake-amount"
              className="mt-8 block text-label text-fg-subtle"
            >
              AMOUNT TO STAKE
            </label>
            <div className="mt-2 flex border border-line-strong focus-within:border-fg">
              <input
                id="stake-amount"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.0"
                aria-describedby="stake-conversion"
                disabled={isBusy || operatorStatus?.retired}
                className="min-w-0 flex-1 bg-surface px-4 py-4 text-figure-sm text-fg outline-none placeholder:text-fg-disabled disabled:cursor-not-allowed"
              />
              <Button
                variant="ghost"
                onClick={() =>
                  setAmount(
                    walletBalance === null ? '' : formatStrk(walletBalance, 18)
                  )
                }
                disabled={walletBalance === null || isBusy}
                className="border-0 border-l border-line-strong"
              >
                MAX
              </Button>
            </div>

            <div
              id="stake-conversion"
              className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center border-y border-line py-3 text-center"
            >
              <div>
                <div className="text-tag text-fg-subtle">STAKE</div>
                <div className="mt-1 text-caption text-fg">1 STRK</div>
              </div>
              <div className="px-4 text-fg-subtle" aria-hidden="true">
                ───▶
              </div>
              <div>
                <div className="text-tag text-fg-subtle">GENERATE</div>
                <div className="mt-1 text-caption text-fg">1 FORCE</div>
              </div>
            </div>

            {/* Disabled, this button explains why, so it stays legible. */}
            <Button
              variant="solid"
              size="lg"
              fullWidth
              onClick={() => void submitStake()}
              disabled={Boolean(stakeDisabledReason) || isBusy}
              busy={stakePhase !== 'idle'}
              className="mt-5"
            >
              {stakePhase === 'submitting'
                ? 'AUTHORIZE STAKE…'
                : stakePhase === 'confirming'
                  ? 'CONFIRMING…'
                  : stakeDisabledReason ||
                    `STAKE ${formatStrk(parsedAmount.value ?? 0n, 18)} STRK`}
            </Button>

            {parsedAmount.error || walletError || stakeError ? (
              <p className="mt-3 text-caption leading-relaxed text-warning">
                {parsedAmount.error || walletError || stakeError}
              </p>
            ) : null}
          </div>

          <div>
            <Stat
              label="AVAILABLE FORCE"
              value={strkValue(operatorStatus?.availableForce ?? null)}
              unit="FORCE"
              emphasis
              className="border-b border-line"
            />
            {operatorStatus ? (
              <div className="border-b border-line px-4 py-3 text-label text-fg-subtle">
                <ForceBreakdown status={operatorStatus} />
              </div>
            ) : null}
            <div className="space-y-3 p-5 text-caption text-fg-subtle">
              <p>
                Your STRK is delegated directly to the Stake Wars validator
                through Starknet&rsquo;s official staking contract. Stake Wars
                never takes custody of your tokens. You can begin unstaking at
                any time and withdraw your STRK after the official exit window.
              </p>
              <p>
                Every 1 STRK delegated generates 1 FORCE. FORCE is allocation
                accounting, not a separate token, and can be assigned to
                captures, takeovers, and reinforcements.
              </p>
            </div>
          </div>
        </Panel>

        <Panel className="mt-8">
          <PanelSection>
            <div className="flex items-end justify-between gap-4">
              <div>
                <Eyebrow>ACTIVE STAKE</Eyebrow>
                <div className="mt-2 text-figure tabular-nums text-fg">
                  {isLoading && !summary
                    ? 'READING…'
                    : `${formatStrk(summary?.stakedAmount ?? 0n, 6)} STRK`}
                </div>
              </div>
              <div className="text-right text-label leading-5 text-fg-subtle">
                <div>
                  EFFECTIVE YIELD {percentValue(metrics.effectivePercent)}
                </div>
              </div>
            </div>
            <StatGrid className="mt-5 border border-line sm:grid-cols-2">
              <Stat
                label="CLAIMED"
                value={strkValue(summary?.claimedRewards ?? null)}
                unit="STRK"
              />
              <Stat
                label="UNCLAIMED"
                value={strkValue(summary?.unclaimedRewards ?? null)}
                unit="STRK"
                emphasis
              />
            </StatGrid>
            <Button
              variant="outline"
              fullWidth
              onClick={() => void claimYield()}
              disabled={
                isLoading ||
                isBusy ||
                !summary ||
                summary.unclaimedRewards === 0n
              }
              busy={claimPhase !== 'idle'}
              className="mt-4"
            >
              {claimPhase === 'submitting'
                ? 'AUTHORIZE CLAIM…'
                : claimPhase === 'confirming'
                  ? 'CONFIRMING CLAIM…'
                  : summary?.unclaimedRewards
                    ? `CLAIM ${formatStrk(summary.unclaimedRewards, 6)} STRK`
                    : 'NO YIELD TO CLAIM'}
            </Button>
          </PanelSection>
        </Panel>

        <Panel className="mt-8">
          <PanelSection>
            <Eyebrow>WITHDRAWAL CONTROL</Eyebrow>

            {hasPendingExit ? (
              <Panel as="div" tone="warning" className="mt-4 p-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <Eyebrow tone="warning">
                      {withdrawalUnlocked
                        ? 'WITHDRAWAL UNLOCKED'
                        : 'OFFICIAL EXIT WINDOW'}
                    </Eyebrow>
                    <div className="mt-2 text-figure-sm tabular-nums text-fg">
                      {formatStrk(summary?.unpoolAmount ?? 0n, 6)} STRK
                    </div>
                  </div>
                  <div className="text-right text-figure-sm tabular-nums text-fg">
                    {withdrawalRemaining === null
                      ? 'SYNCING…'
                      : withdrawalUnlocked
                        ? 'READY'
                        : durationValue(withdrawalRemaining)}
                  </div>
                </div>
                <div
                  className="mt-4 h-2 overflow-hidden border border-warning-strong/40"
                  role="progressbar"
                  aria-label="Official staking withdrawal progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(withdrawalProgress)}
                >
                  <div
                    className="h-full bg-warning transition-[width] duration-1000 motion-reduce:transition-none"
                    style={{ width: `${withdrawalProgress}%` }}
                  />
                </div>
                <Button
                  variant="outline"
                  tone="warning"
                  fullWidth
                  onClick={() => void withdrawUnstaked()}
                  disabled={!withdrawalUnlocked || isBusy}
                  busy={withdrawPhase !== 'idle'}
                  className="mt-4"
                >
                  {withdrawPhase === 'submitting'
                    ? 'AUTHORIZE WITHDRAWAL…'
                    : withdrawPhase === 'confirming'
                      ? 'CONFIRMING WITHDRAWAL…'
                      : withdrawalUnlocked
                        ? `WITHDRAW ${formatStrk(summary?.unpoolAmount ?? 0n, 6)} STRK`
                        : 'WITHDRAWAL LOCKED'}
                </Button>
              </Panel>
            ) : (
              <Panel
                as="div"
                className="mt-4 grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-end"
              >
                <div>
                  <div className="text-label text-fg">LEAVE STAKE WARS</div>
                  <p className="mt-2 max-w-3xl text-caption text-fg-subtle">
                    Unstaking permanently retires this address from the game,
                    relinquishes its Sectors, and starts the official Starknet
                    exit window. Restaking later will not reactivate the
                    address.
                  </p>
                </div>
                {exitArmed ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="solid"
                      tone="warning"
                      onClick={() => void unstakeAll()}
                      disabled={isBusy || !summary?.stakedAmount}
                      busy={unstakePhase !== 'idle'}
                    >
                      {unstakePhase === 'submitting'
                        ? 'AUTHORIZE EXIT…'
                        : unstakePhase === 'confirming'
                          ? 'CONFIRMING EXIT…'
                          : 'CONFIRM PERMANENT EXIT'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setExitArmed(false)}
                      disabled={isBusy}
                    >
                      CANCEL
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    tone="danger"
                    onClick={() => setExitArmed(true)}
                    disabled={
                      isLoading ||
                      isBusy ||
                      !summary?.stakedAmount ||
                      operatorStatus?.retired
                    }
                  >
                    {operatorStatus?.retired
                      ? 'ADDRESS RETIRED'
                      : summary?.stakedAmount
                        ? 'UNSTAKE & PERMANENTLY RETIRE'
                        : 'NO ACTIVE STAKE'}
                  </Button>
                )}
              </Panel>
            )}
          </PanelSection>
        </Panel>

        {operatorError ||
        error ||
        historyError ||
        claimError ||
        stakingError ? (
          <Callout tone="warning" className="mt-6">
            {operatorError ? (
              <Button variant="link" tone="warning" onClick={refreshOperator}>
                OPERATOR READ FAILED · RETRY
              </Button>
            ) : null}
            {error ? <div>STAKING READ FAILED · {error}</div> : null}
            {historyError ? (
              <div>CLAIM HISTORY UNAVAILABLE · {historyError}</div>
            ) : null}
            {claimError ? <div>CLAIM FAILED · {claimError}</div> : null}
            {stakingError ? (
              <div>STAKING ACTION FAILED · {stakingError}</div>
            ) : null}
          </Callout>
        ) : null}
      </div>
    </div>
  );
}
