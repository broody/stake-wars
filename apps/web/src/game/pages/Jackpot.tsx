import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useProvider,
  useSendTransaction,
} from '@starknetfoundation/starknet-start-react';
import { TransactionExecutionStatus } from 'starknet';
import { WalletButton } from '../components/ui/WalletButton';
import { useTransactionToast } from '../contexts/TransactionToastContext';
import { useWallet } from '../contexts/WalletContext';
import { config } from '../services/config';
import { buildClaimJackpotCall, getJackpots } from '../services/jackpot';
import type { Jackpot as JackpotRecord } from '../types';
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

function prizeLabel(jackpot: JackpotRecord): string {
  if (jackpot.prizeKind === 1) {
    return addressesMatch(jackpot.token, config.strkTokenAddress)
      ? `${formatStrk(jackpot.amount, 6)} STRK`
      : `${jackpot.amount.toLocaleString()} UNITS`;
  }
  if (jackpot.prizeKind === 2) return `TOKEN #${jackpot.tokenId}`;
  return `${jackpot.amount.toLocaleString()} × #${jackpot.tokenId}`;
}

function prizeStandard(kind: JackpotRecord['prizeKind']): string {
  if (kind === 1) return 'ERC-20';
  if (kind === 2) return 'ERC-721';
  return 'ERC-1155';
}

function liveStatus(jackpot: JackpotRecord, now: number) {
  if (jackpot.status === 1) return 'FUNDING';
  if (jackpot.status === 3) return 'DRAW LOCKED';
  if (jackpot.endsAt <= Math.floor(now / 1_000)) return 'SELECTION PENDING';
  return 'LIVE';
}

function PrizeToken({ jackpot }: { jackpot: JackpotRecord }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-neutral-500">
      <span className="border border-[#d6a84b]/40 px-2 py-1 text-[#d6a84b]">
        {prizeStandard(jackpot.prizeKind)}
      </span>
      <span className="tabular-nums">TOKEN {shortAddress(jackpot.token)}</span>
    </div>
  );
}

function EmptyJackpot() {
  return (
    <section className="border border-grid px-6 py-16 sm:px-10">
      <div className="h-px w-16 bg-[#d6a84b]" />
      <h2 className="mt-6 text-3xl tracking-[-0.05em] text-white sm:text-5xl">
        NO ACTIVE JACKPOT
      </h2>
      <p className="mt-4 max-w-xl text-xs leading-6 text-neutral-500">
        The next prize round has not been armed yet. Keep control of your
        Sectors—the winning Sector belongs to whoever controlled it when the
        round expired.
      </p>
    </section>
  );
}

export function Jackpot() {
  const { address, isConnected } = useWallet();
  const { provider } = useProvider();
  const transaction = useSendTransaction({});
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const [jackpots, setJackpots] = useState<JackpotRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [claimingId, setClaimingId] = useState<bigint | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    getJackpots(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setJackpots(result);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to read jackpot history.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  const current = jackpots.find((jackpot) => jackpot.status !== 4) ?? null;
  const past = useMemo(
    () => jackpots.filter((jackpot) => jackpot.status === 4),
    [jackpots]
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
    async (jackpot: JackpotRecord) => {
      if (!address || !addressesMatch(address, jackpot.winner)) return;
      let hash: string | null = null;
      setClaimingId(jackpot.id);
      setClaimError(null);
      try {
        const result = await transaction.sendAsync([
          buildClaimJackpotCall({
            jackpotSystemAddress: config.jackpotSystemAddress,
            jackpotId: jackpot.id,
            recipient: address,
          }),
        ]);
        hash = result.transaction_hash;
        notifySubmitting(hash, 'JACKPOT CLAIM');
        await provider.waitForTransaction(hash, {
          errorStates: [TransactionExecutionStatus.REVERTED],
        });
        notifyConfirmed(hash);
        setJackpots((records) =>
          records.map((record) =>
            record.id === jackpot.id
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
    ]
  );

  return (
    <div className="h-full w-full overflow-y-auto bg-bg font-mono">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(214,168,75,0.06),transparent_26%)]" />
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-24 sm:px-6">
        <header className="flex flex-col gap-5 border-b border-grid pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-[-0.075em] text-white sm:text-6xl">
              JACKPOT
            </h1>
            <p className="mt-3 max-w-2xl text-[11px] leading-5 text-neutral-500">
              One Sector is drawn after expiry. Its controller at the expiry
              snapshot wins the escrowed prize.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            className="self-start border border-neutral-700 px-4 py-2 text-[9px] tracking-[0.18em] text-neutral-400 transition-colors hover:border-white hover:text-white disabled:cursor-wait disabled:opacity-50 sm:self-auto"
          >
            {isLoading ? 'SYNCING…' : 'REFRESH'}
          </button>
        </header>

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

        {!error && isLoading && jackpots.length === 0 ? (
          <div className="mt-8 flex items-center gap-3 border-y border-grid py-14 text-[10px] tracking-[0.18em] text-neutral-500">
            <span className="h-1.5 w-1.5 animate-pulse bg-[#d6a84b]" />
            READING JACKPOT LEDGER…
          </div>
        ) : null}

        {!error && (!isLoading || jackpots.length > 0) ? (
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
                      <PrizeToken jackpot={current} />
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
                        : 'TIME TO SNAPSHOT'}
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
                        : `Control is recorded at ${formatDate(current.endsAt)}. An active contest preserves the incumbent controller.`}
                  </p>
                </div>
              </section>
            ) : (
              <EmptyJackpot />
            )}
          </div>
        ) : null}

        <section className="mt-14">
          <div className="flex items-end justify-between border-b border-grid pb-4">
            <div>
              <h2 className="text-xl tracking-[-0.04em] text-white sm:text-2xl">
                PAST JACKPOTS
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
              NO COMPLETED JACKPOTS YET
            </div>
          ) : (
            <div>
              {past.map((jackpot) => {
                const winnerConnected = Boolean(
                  address && addressesMatch(address, jackpot.winner)
                );
                const canClaim = winnerConnected && !jackpot.claimed;
                return (
                  <article
                    key={jackpot.id.toString()}
                    className="grid gap-6 border-b border-grid py-6 md:grid-cols-[0.45fr_1.2fr_1fr_0.8fr] md:items-center"
                  >
                    <div>
                      <div className="text-[8px] tracking-[0.16em] text-neutral-600">
                        ROUND
                      </div>
                      <div className="mt-1 text-xl tabular-nums text-white">
                        #{jackpot.id.toString().padStart(2, '0')}
                      </div>
                      <div className="mt-1 text-[9px] text-neutral-600">
                        {formatDate(jackpot.settledAt)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xl tracking-[-0.035em] text-white">
                        {prizeLabel(jackpot)}
                      </div>
                      <div className="mt-2">
                        <PrizeToken jackpot={jackpot} />
                      </div>
                    </div>

                    <div>
                      <div className="text-[8px] tracking-[0.16em] text-neutral-600">
                        WINNER · SECTOR {jackpot.lastDrawnSectorId}
                      </div>
                      <div className="mt-2 text-xs text-neutral-200">
                        {isZeroAddress(jackpot.winner)
                          ? 'NOT RECORDED'
                          : shortAddress(jackpot.winner)}
                      </div>
                      {winnerConnected ? (
                        <div className="mt-1 text-[8px] tracking-[0.14em] text-[#d6a84b]">
                          YOUR WIN
                        </div>
                      ) : null}
                    </div>

                    <div className="md:text-right">
                      {jackpot.claimed ? (
                        <div>
                          <div className="text-[9px] tracking-[0.16em] text-neutral-300">
                            CLAIMED ✓
                          </div>
                          <div className="mt-1 text-[8px] text-neutral-600">
                            {formatDate(jackpot.claimedAt)}
                          </div>
                          <div className="mt-1 text-[8px] text-neutral-600">
                            TO {shortAddress(jackpot.claimedBy)}
                          </div>
                        </div>
                      ) : canClaim ? (
                        <button
                          type="button"
                          onClick={() => void claimPrize(jackpot)}
                          disabled={claimingId !== null}
                          className="border border-[#d6a84b] bg-[#d6a84b] px-4 py-2 text-[9px] tracking-[0.16em] text-black transition-colors hover:bg-black hover:text-[#d6a84b] disabled:cursor-wait disabled:opacity-50"
                        >
                          {claimingId === jackpot.id
                            ? 'CLAIMING…'
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

          {!isConnected && past.some((jackpot) => !jackpot.claimed) ? (
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
