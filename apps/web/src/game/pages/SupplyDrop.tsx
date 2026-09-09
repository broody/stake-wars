import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useProvider,
  useSendTransaction,
} from '@starknetfoundation/starknet-start-react';
import { TransactionExecutionStatus } from 'starknet';
import { SupplyDropLogo } from '../components/3d/SupplyDropLogo';
import { WalletButton } from '../components/ui/WalletButton';
import { useTransactionToast } from '../contexts/TransactionToastContext';
import { useWallet } from '../contexts/WalletContext';
import { config } from '../services/config';
import { getSupplyDrops } from '../services/supplyDrop';
import {
  getSupplyDropPolicy,
  type SupplyDropPolicy,
} from '../services/starknet';
import { prepareSupplyDropClaim } from '../services/supplyDropClaims';
import { useSectors } from '../contexts/SectorContext';
import { useYield } from '../contexts/useYield';
import type { SupplyDrop as SupplyDropRecord } from '../types';
import {
  addressesMatch,
  formatStrk,
  isZeroAddress,
  shortAddress,
} from '../utils/format';

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDate(timestamp: number | null): string {
  return timestamp ? DATE_FORMAT.format(new Date(timestamp * 1_000)) : '—';
}

function formatCountdown(endsAt: number, now: number): string {
  let remaining = Math.max(0, endsAt - Math.floor(now / 1_000));
  const days = Math.floor(remaining / 86_400);
  remaining %= 86_400;
  const hours = Math.floor(remaining / 3_600);
  remaining %= 3_600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return [days, hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
}

function prizeLabel(supplyDrop: SupplyDropRecord): string {
  if (supplyDrop.prizeKind === 1) {
    return addressesMatch(supplyDrop.token, config.strkTokenAddress)
      ? `${formatStrk(supplyDrop.amount, 6)} STRK`
      : `${supplyDrop.amount.toLocaleString()} UNITS`;
  }
  if (supplyDrop.prizeKind === 2) return `TOKEN #${supplyDrop.tokenId}`;
  return `${supplyDrop.amount.toLocaleString()} × #${supplyDrop.tokenId}`;
}

function prizeStandard(kind: SupplyDropRecord['prizeKind']): string {
  if (kind === 1) return 'ERC-20';
  if (kind === 2) return 'ERC-721';
  return 'ERC-1155';
}

function liveStatus(supplyDrop: SupplyDropRecord, now: number) {
  if (supplyDrop.status === 1) return 'FUNDING';
  if (supplyDrop.status === 3) return 'DRAW LOCKED';
  if (supplyDrop.endsAt <= Math.floor(now / 1_000)) return 'SELECTION PENDING';
  return 'LIVE';
}

function PrizeToken({ supplyDrop }: { supplyDrop: SupplyDropRecord }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-neutral-500">
      <span className="border border-[#d6a84b]/40 px-2 py-1 text-[#d6a84b]">
        {prizeStandard(supplyDrop.prizeKind)}
      </span>
      <span className="tabular-nums">
        TOKEN {shortAddress(supplyDrop.token)}
      </span>
    </div>
  );
}

function EmptySupplyDrop() {
  return (
    <section className="border border-grid px-6 py-16 sm:px-10">
      <div className="h-px w-16 bg-[#d6a84b]" />
      <h2 className="mt-6 text-3xl tracking-[-0.05em] text-white sm:text-5xl">
        NO ACTIVE SUPPLY DROP
      </h2>
      <p className="mt-4 max-w-xl text-xs leading-6 text-neutral-500">
        The next Supply Drop has not started yet. Keep control of your
        Sectors—the operator recorded when the drop window closes is eligible to
        receive the drop if their Sector is selected.
      </p>
    </section>
  );
}

export function SupplyDrop() {
  const { address, isConnected } = useWallet();
  const { provider } = useProvider();
  const { refreshOperator } = useSectors();
  const { refreshStaking } = useYield();
  const transaction = useSendTransaction({});
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const [supplyDrops, setSupplyDrops] = useState<SupplyDropRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [claimingId, setClaimingId] = useState<bigint | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [policies, setPolicies] = useState<Record<string, SupplyDropPolicy>>(
    {}
  );
  const [policyError, setPolicyError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPolicies({});
    setPolicyError(null);
    const relevant = supplyDrops.filter(
      (drop) => drop.status !== 4 || !drop.claimed
    );
    Promise.all(
      relevant.map(
        async (drop) =>
          [
            drop.id.toString(),
            await getSupplyDropPolicy(drop.id, controller.signal),
          ] as const
      )
    )
      .then((entries) => {
        if (!controller.signal.aborted)
          setPolicies(Object.fromEntries(entries));
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setPolicyError(
            reason instanceof Error
              ? reason.message
              : 'Could not verify Supply Drop staking terms.'
          );
      });
    return () => controller.abort();
  }, [supplyDrops]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    getSupplyDrops(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setSupplyDrops(result);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to read supply drop history.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  const current =
    supplyDrops.find((supplyDrop) => supplyDrop.status !== 4) ?? null;
  const past = useMemo(
    () => supplyDrops.filter((supplyDrop) => supplyDrop.status === 4),
    [supplyDrops]
  );
  const currentEndsAt = current?.endsAt ?? 0;
  const currentStatus = current?.status ?? 0;

  useEffect(() => {
    if (
      currentStatus !== 2 ||
      currentEndsAt === 0 ||
      currentEndsAt * 1_000 <= Date.now()
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (currentEndsAt * 1_000 <= timestamp) window.clearInterval(timer);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [currentEndsAt, currentStatus]);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  const claimPrize = useCallback(
    async (supplyDrop: SupplyDropRecord) => {
      if (!address || !addressesMatch(address, supplyDrop.winner)) return;
      let hash: string | null = null;
      setClaimingId(supplyDrop.id);
      setClaimError(null);
      try {
        const calls = await prepareSupplyDropClaim(supplyDrop.id, address);
        const result = await transaction.sendAsync(calls);
        hash = result.transaction_hash;
        notifySubmitting(hash, 'SUPPLY DROP CLAIM');
        await provider.waitForTransaction(hash, {
          errorStates: [TransactionExecutionStatus.REVERTED],
        });
        notifyConfirmed(hash);
        refreshOperator();
        refreshStaking();
        window.dispatchEvent(new Event('supply-drop-updated'));
        setSupplyDrops((records) =>
          records.map((record) =>
            record.id === supplyDrop.id
              ? {
                  ...record,
                  claimed: true,
                  claimedAt: Math.floor(Date.now() / 1_000),
                  claimedBy: address,
                }
              : record
          )
        );
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : 'Prize claim failed.';
        setClaimError(message);
        if (hash) notifyFailed(hash, message);
      } finally {
        setClaimingId(null);
      }
    },
    [
      address,
      notifyConfirmed,
      notifyFailed,
      notifySubmitting,
      provider,
      transaction,
      refreshOperator,
      refreshStaking,
    ]
  );

  return (
    <div className="h-full w-full overflow-y-auto bg-bg font-mono">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(214,168,75,0.06),transparent_26%)]" />
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-24 sm:px-6">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-5 border-b border-grid pb-7">
          <div className="min-w-0">
            <div className="text-[9px] tracking-[0.26em] text-dim">
              SECTOR REWARDS
            </div>
            <h1 className="game-page-title mt-1">SUPPLY DROP</h1>
            <p className="mt-2 max-w-xl text-[11px] leading-5 text-neutral-400">
              A portion of pool commissions funds each drop. One Sector is
              selected at random; its operator at the deadline receives it.
              Received drops are staked automatically.
            </p>
            {current && policies[current.id.toString()]?.stakingRequired ? (
              <p className="mt-3 max-w-2xl text-[11px] leading-5 text-[#d6a84b]">
                Claiming automatically stakes the full drop in the same
                transaction. Until it is staked, Sector actions and image
                changes pause. Your Sectors remain open to challenges.
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3 self-start">
            <div className="hidden text-right text-[7px] tracking-[0.18em] text-neutral-600 md:block">
              <div>LIVE OBJECT</div>
              <div className="mt-1 text-[#d6a84b]">SUPPLY DROP</div>
            </div>
            <div className="h-16 w-16 border border-grid bg-black sm:h-24 sm:w-24">
              <SupplyDropLogo className="pointer-events-none h-full w-full" />
            </div>
          </div>
        </header>

        {policyError ? (
          <p role="alert" className="mt-4 text-xs text-amber-400">
            Staking terms unavailable: {policyError} Claims are disabled until
            verification succeeds.
          </p>
        ) : null}

        {error ? (
          <div className="mt-8 border border-amber-500/40 p-5 text-xs text-amber-400">
            <p>{error}</p>
            <button
              type="button"
              onClick={refresh}
              className="mt-4 border border-amber-500/50 px-4 py-2 text-[9px] tracking-[0.18em] transition-colors hover:bg-amber-400 hover:text-black"
            >
              RETRY
            </button>
          </div>
        ) : null}

        {!error && isLoading && supplyDrops.length === 0 ? (
          <div className="mt-8 flex items-center gap-3 border-y border-grid py-14 text-[10px] tracking-[0.18em] text-neutral-500">
            <span className="h-1.5 w-1.5 animate-pulse bg-[#d6a84b]" />
            READING SUPPLY DROP LEDGER…
          </div>
        ) : null}

        {!error && (!isLoading || supplyDrops.length > 0) ? (
          <div className="mt-8">
            {current ? (
              <section className="grid border border-grid lg:grid-cols-[1.4fr_0.6fr]">
                <div className="relative overflow-hidden p-6 sm:p-10">
                  <div className="absolute bottom-0 right-0 text-[10rem] font-bold leading-none text-white/[0.018] sm:text-[16rem]">
                    {current.id.toString().padStart(2, '0')}
                  </div>
                  <div className="relative">
                    <div className="flex items-center gap-3 text-[9px] tracking-[0.2em] text-[#d6a84b]">
                      <span className="h-1.5 w-1.5 bg-[#d6a84b]" />
                      {liveStatus(current, now)} · ROUND {current.id.toString()}
                    </div>
                    <h2 className="mt-8 break-words text-4xl font-bold tracking-[-0.065em] text-white sm:text-7xl">
                      {prizeLabel(current)}
                    </h2>
                    <div className="mt-7">
                      <PrizeToken supplyDrop={current} />
                    </div>
                    <div className="mt-10 grid max-w-xl grid-cols-2 gap-px bg-grid sm:grid-cols-3">
                      <div className="bg-black py-3 pr-3">
                        <div className="text-[8px] tracking-[0.16em] text-neutral-600">
                          SECTORS IN DRAW
                        </div>
                        <div className="mt-1 text-sm tabular-nums text-neutral-200">
                          {current.sectorLimitSnapshot.toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-black px-3 py-3">
                        <div className="text-[8px] tracking-[0.16em] text-neutral-600">
                          PREVIOUS DRAWS
                        </div>
                        <div className="mt-1 text-sm tabular-nums text-neutral-200">
                          {current.drawCount}
                        </div>
                      </div>
                      <div className="col-span-2 bg-black pt-3 sm:col-span-1 sm:pl-3">
                        <div className="text-[8px] tracking-[0.16em] text-neutral-600">
                          SPONSOR
                        </div>
                        <div className="mt-1 text-sm text-neutral-200">
                          {shortAddress(current.sponsor)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-between border-t border-grid p-6 lg:border-l lg:border-t-0 lg:p-8">
                  <div>
                    <div className="text-[9px] tracking-[0.2em] text-neutral-500">
                      {current.status === 3 || current.endsAt * 1_000 <= now
                        ? 'ROUND EXPIRED'
                        : 'TIME TO DROP'}
                    </div>
                    <div className="mt-4 whitespace-nowrap text-3xl tabular-nums tracking-[-0.06em] text-white sm:text-4xl">
                      {current.status === 3 || current.endsAt * 1_000 <= now
                        ? '00:00:00:00'
                        : formatCountdown(current.endsAt, now)}
                    </div>
                    <div className="mt-2 grid grid-cols-4 text-[7px] tracking-[0.14em] text-neutral-600">
                      <span>DAYS</span>
                      <span>HRS</span>
                      <span>MIN</span>
                      <span>SEC</span>
                    </div>
                  </div>
                  <p className="mt-12 border-l border-[#d6a84b]/60 pl-4 text-[10px] leading-5 text-neutral-500">
                    {current.status === 3
                      ? `The draw is locked to block ${current.randomnessBlock.toString()}. Settlement can complete once randomness is ready.`
                      : current.endsAt * 1_000 <= now
                        ? 'The control snapshot is fixed. The winning Sector is waiting to be drawn and settled.'
                        : `Operator is recorded at ${formatDate(current.endsAt)}.`}
                  </p>
                </div>
              </section>
            ) : (
              <EmptySupplyDrop />
            )}
          </div>
        ) : null}

        <section className="mt-14">
          <div className="flex items-end justify-between border-b border-grid pb-4">
            <div>
              <h2 className="text-xl tracking-[-0.04em] text-white sm:text-2xl">
                PAST SUPPLY DROPS
              </h2>
              <p className="mt-1 text-[9px] tracking-[0.12em] text-neutral-600">
                PRIZES · WINNERS · CLAIM STATUS
              </p>
            </div>
            <span className="text-[10px] tabular-nums text-neutral-600">
              {past.length.toString().padStart(2, '0')}
            </span>
          </div>

          {claimError ? (
            <div className="mt-4 border-l-2 border-amber-400 pl-4 text-[10px] leading-5 text-amber-400">
              {claimError}
            </div>
          ) : null}

          {past.length === 0 ? (
            <div className="border-b border-grid py-12 text-[10px] tracking-[0.16em] text-neutral-600">
              NO COMPLETED SUPPLY DROPS YET
            </div>
          ) : (
            <div>
              {past.map((supplyDrop) => {
                const winnerConnected = Boolean(
                  address && addressesMatch(address, supplyDrop.winner)
                );
                const policy = policies[supplyDrop.id.toString()];
                const canClaim = winnerConnected && !supplyDrop.claimed;
                return (
                  <article
                    key={supplyDrop.id.toString()}
                    className="grid gap-6 border-b border-grid py-6 md:grid-cols-[0.45fr_1.2fr_1fr_0.8fr] md:items-center"
                  >
                    <div>
                      <div className="text-[8px] tracking-[0.16em] text-neutral-600">
                        ROUND
                      </div>
                      <div className="mt-1 text-xl tabular-nums text-white">
                        #{supplyDrop.id.toString().padStart(2, '0')}
                      </div>
                      <div className="mt-1 text-[9px] text-neutral-600">
                        {formatDate(supplyDrop.settledAt)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xl tracking-[-0.035em] text-white">
                        {prizeLabel(supplyDrop)}
                      </div>
                      <div className="mt-2">
                        <PrizeToken supplyDrop={supplyDrop} />
                      </div>
                      {policy?.stakingRequired ? (
                        <p className="mt-2 text-[10px] leading-5 text-[#d6a84b]">
                          Received drops are staked automatically. Claiming
                          alone pauses gameplay until it is staked.
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <div className="text-[8px] tracking-[0.16em] text-neutral-600">
                        WINNER · SECTOR {supplyDrop.lastDrawnSectorId}
                      </div>
                      <div className="mt-2 text-xs text-neutral-200">
                        {isZeroAddress(supplyDrop.winner)
                          ? 'NOT RECORDED'
                          : shortAddress(supplyDrop.winner)}
                      </div>
                      {winnerConnected ? (
                        <div className="mt-1 text-[8px] tracking-[0.14em] text-[#d6a84b]">
                          YOUR WIN
                        </div>
                      ) : null}
                    </div>

                    <div className="md:text-right">
                      {supplyDrop.claimed ? (
                        <div>
                          <div className="text-[9px] tracking-[0.16em] text-neutral-300">
                            CLAIMED ✓
                          </div>
                          <div className="mt-1 text-[8px] text-neutral-600">
                            {formatDate(supplyDrop.claimedAt)}
                          </div>
                          <div className="mt-1 text-[8px] text-neutral-600">
                            TO {shortAddress(supplyDrop.claimedBy)}
                          </div>
                        </div>
                      ) : canClaim ? (
                        <button
                          type="button"
                          onClick={() => void claimPrize(supplyDrop)}
                          disabled={
                            claimingId !== null ||
                            !policy ||
                            Boolean(policyError)
                          }
                          className="border border-[#d6a84b] bg-[#d6a84b] px-4 py-2 text-[9px] tracking-[0.16em] text-black transition-colors hover:bg-black hover:text-[#d6a84b] disabled:cursor-wait disabled:opacity-50"
                        >
                          {claimingId === supplyDrop.id
                            ? 'CLAIMING…'
                            : !policy
                              ? 'VERIFYING…'
                              : policy.stakingRequired
                                ? 'CLAIM & STAKE'
                                : 'CLAIM PRIZE'}
                        </button>
                      ) : (
                        <div className="text-[9px] tracking-[0.14em] text-neutral-600">
                          UNCLAIMED
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!isConnected && past.some((supplyDrop) => !supplyDrop.claimed) ? (
            <div className="mt-6 flex flex-col items-start justify-between gap-4 border border-grid p-5 sm:flex-row sm:items-center">
              <p className="text-[10px] leading-5 text-neutral-500">
                Connect the winning wallet to reveal and claim its prize.
              </p>
              <WalletButton />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
