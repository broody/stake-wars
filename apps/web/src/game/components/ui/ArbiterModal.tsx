import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type {
  ArbiterHistoryEntry,
  ArbiterPhase,
  ArbiterRound,
  ArbiterSnapshot,
} from '../../services/api';
import type { ArbiterBidReceipt } from '../../services/whisperBid';
import { useArbiter } from '../../contexts/useArbiter';
import { useWallet } from '../../contexts/WalletContext';
import {
  arbiterDeadline,
  arbiterPhaseLabel,
  formatArbiterAmount,
} from '../../utils/arbiter';
import { addressesMatch, formatStrk, shortAddress } from '../../utils/format';

interface ArbiterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ArbiterConsoleProps extends ArbiterModalProps {
  snapshot: ArbiterSnapshot | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onPlaceBid?: (amount: string) => Promise<ArbiterBidReceipt>;
  bidStatusLabel?: string;
  presentation?: 'hud' | 'page';
  title?: string;
  view?: 'auction' | 'history';
  history?: ArbiterHistoryEntry[];
}

interface ArbiterSummaryCardProps extends ArbiterModalProps {
  snapshot: ArbiterSnapshot | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  viewerAddress?: string | null;
}

export function ArbiterModal({ isOpen, onClose }: ArbiterModalProps) {
  const { snapshot, isLoading, error, refresh } = useArbiter();
  const { address } = useWallet();

  return (
    <ArbiterSummaryCard
      isOpen={isOpen}
      onClose={onClose}
      snapshot={snapshot}
      isLoading={isLoading}
      error={error}
      onRefresh={refresh}
      viewerAddress={address}
    />
  );
}

export function ArbiterSummaryCard({
  isOpen,
  onClose,
  snapshot,
  isLoading,
  error,
  onRefresh,
  viewerAddress,
}: ArbiterSummaryCardProps) {
  const chainNow = useArbiterChainNow(isOpen, snapshot?.observedAt);

  useCloseOnEscape(isOpen, onClose);
  if (!isOpen) return null;

  const round = snapshot?.round ?? null;
  const phase = snapshot?.phase ?? 'none';
  const deadline = round ? arbiterDeadline(phase, round) : null;
  const isCurrentController = Boolean(
    viewerAddress &&
      snapshot?.controller &&
      addressesMatch(viewerAddress, snapshot.controller.address)
  );
  const search = new URLSearchParams();
  search.set('tracking', 'arbiter');

  return (
    <aside
      role="dialog"
      aria-labelledby="arbiter-summary-title"
      data-arbiter-console
      className="pointer-events-auto absolute left-3 right-3 top-20 z-[80] overflow-hidden border border-neutral-600 bg-black/95 font-mono text-xs text-fg shadow-[8px_8px_0_rgba(255,255,255,0.08)] backdrop-blur-md sm:left-auto sm:right-4 sm:w-[22rem]"
    >
      <header className="flex items-center justify-between border-b border-grid px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-[8px] tracking-[0.24em] text-fg">
            <span className="h-1.5 w-1.5 rounded-full bg-fg" />
            ARBITER
          </div>
          <h2
            id="arbiter-summary-title"
            className="mt-1 text-base font-bold tracking-[-0.03em]"
          >
            {arbiterPhaseLabel(phase)}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 text-[9px] tracking-[0.16em] text-dim transition-colors hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg"
          aria-label="Close Arbiter status"
        >
          CLOSE
        </button>
      </header>

      <div className="space-y-4 px-4 py-4">
        {error ? (
          <ErrorNotice hasSnapshot={Boolean(snapshot)} onRefresh={onRefresh} />
        ) : null}

        {isLoading && !snapshot ? (
          <p className="py-5 text-center text-[9px] tracking-[0.2em] text-neutral-500">
            VERIFYING STATE…
          </p>
        ) : null}

        {snapshot?.controller ? (
          <div className="flex items-end justify-between gap-3">
            <MetricText
              label="CURRENT CONTROLLER"
              value={shortAddress(snapshot.controller.address)}
            />
            <div className="text-right">
              {isCurrentController ? (
                <span className="bg-fg px-2 py-1 text-[8px] tracking-[0.16em] text-bg">
                  YOU
                </span>
              ) : null}
              <div className="mt-2 text-[8px] tracking-[0.12em] text-neutral-500">
                UNTIL NEXT WINNER
              </div>
            </div>
          </div>
        ) : null}

        {snapshot && round ? (
          <section className="border-l border-fg bg-white/[0.04] px-3 py-3">
            <div className="text-[8px] tracking-[0.18em] text-neutral-500">
              NEXT CONTROL
            </div>
            <div className="mt-1 flex items-end justify-between gap-3">
              <span className="text-lg font-bold tracking-[-0.04em]">
                {summaryAuctionValue(phase, deadline, chainNow)}
              </span>
              <span className="text-[8px] tracking-[0.14em] text-fg">
                VERIFIED
              </span>
            </div>
            {phase === 'pending' ? (
              <p className="mt-2 text-[10px] leading-4 text-neutral-400">
                First sealed bid starts a{' '}
                {formatAuctionWindow(round.schedule.biddingDurationSeconds)}{' '}
                auction.
              </p>
            ) : null}
          </section>
        ) : null}

        {snapshot && !round ? (
          <p className="border-l border-neutral-700 pl-3 leading-5 text-neutral-400">
            No auction is registered for this network.
          </p>
        ) : null}

        {!isLoading && !snapshot && !error ? (
          <p className="py-3 text-neutral-400">
            No Arbiter state is available.
          </p>
        ) : null}

        {isCurrentController ? <ProjectionPlaceholder compact /> : null}
      </div>

      <Link
        to={{ pathname: '/arbiter', search: `?${search.toString()}` }}
        className="flex items-center justify-between border-t border-grid px-4 py-3 text-[9px] tracking-[0.18em] transition-colors hover:bg-fg hover:text-bg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-fg"
      >
        <span>VIEW AUCTION</span>
        <span aria-hidden="true">↗</span>
      </Link>
    </aside>
  );
}

export function ArbiterConsole({
  isOpen,
  onClose,
  snapshot,
  isLoading,
  error,
  onRefresh,
  onPlaceBid,
  bidStatusLabel,
  presentation = 'hud',
  title = 'THE ARBITER',
  view = 'auction',
  history = [],
}: ArbiterConsoleProps) {
  const chainNow = useArbiterChainNow(isOpen, snapshot?.observedAt);
  useCloseOnEscape(isOpen && presentation === 'hud', onClose);
  if (!isOpen) return null;

  const phase = snapshot?.phase ?? 'none';
  const round = snapshot?.round ?? null;
  const isPage = presentation === 'page';
  const Container = isPage ? 'section' : 'aside';

  return (
    <Container
      role={isPage ? 'region' : 'dialog'}
      aria-labelledby="arbiter-title"
      data-arbiter-console
      className={
        isPage
          ? 'relative w-full overflow-hidden border border-grid bg-black/85 font-mono text-fg'
          : 'activity-scrollbar pointer-events-auto absolute left-3 right-3 top-20 z-[80] max-h-[calc(100%-6rem)] overflow-y-auto border border-neutral-600 bg-black/95 font-mono text-fg shadow-[8px_8px_0_rgba(255,255,255,0.08)] backdrop-blur-md sm:left-auto sm:right-4 sm:w-[28rem]'
      }
    >
      <header className="flex items-center justify-between border-b border-grid px-4 py-3 sm:px-6">
        <div>
          <div className="text-[8px] tracking-[0.24em] text-fg">
            CONTROL SIGNAL // {arbiterPhaseLabel(phase)}
          </div>
          <h2
            id="arbiter-title"
            className="mt-1 text-base font-bold tracking-[-0.03em]"
          >
            {title}
          </h2>
        </div>
        {!isPage ? (
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-[9px] tracking-[0.16em] text-dim hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg"
          >
            CLOSE
          </button>
        ) : null}
      </header>

      {error ? (
        <div className="px-4 pt-4 sm:px-6">
          <ErrorNotice
            hasSnapshot={
              view === 'history' ? history.length > 0 : Boolean(snapshot)
            }
            onRefresh={onRefresh}
          />
        </div>
      ) : null}

      {isLoading && (view === 'history' || !snapshot) ? (
        <div className="grid min-h-[28rem] place-items-center">
          <div className="text-center">
            <div className="mx-auto h-px w-20 animate-pulse bg-fg motion-reduce:animate-none" />
            <p className="mt-4 text-[9px] tracking-[0.22em] text-neutral-500">
              VERIFYING ARBITER
            </p>
          </div>
        </div>
      ) : null}

      {view === 'auction' && snapshot && round ? (
        <AuctionPanel
          phase={phase}
          round={round}
          chainNow={chainNow}
          onPlaceBid={onPlaceBid}
          bidStatusLabel={bidStatusLabel}
        />
      ) : null}

      {view === 'history' && !isLoading ? (
        <HistoryPanel entries={history} />
      ) : null}

      {view === 'auction' && snapshot && !round ? (
        <div className="grid min-h-[28rem] place-items-center px-6 text-center">
          <div className="max-w-sm">
            <h3 className="text-2xl font-bold tracking-[-0.05em]">
              No auction registered
            </h3>
            <p className="mt-3 text-xs leading-5 text-neutral-400">
              The current signal remains unchanged until the next round is
              available.
            </p>
          </div>
        </div>
      ) : null}

      {view === 'auction' && !isLoading && !snapshot && !error ? (
        <div className="grid min-h-[24rem] place-items-center text-xs text-neutral-500">
          No Arbiter state is available.
        </div>
      ) : null}

      <footer className="flex items-center justify-between border-t border-grid px-4 py-3 text-[8px] tracking-[0.18em] text-dim sm:px-6">
        <span>VERIFIED ONCHAIN</span>
        <span>SEALED VICKREY AUCTION</span>
      </footer>
    </Container>
  );
}

function AuctionPanel({
  phase,
  round,
  chainNow,
  onPlaceBid,
  bidStatusLabel,
}: {
  phase: ArbiterPhase;
  round: ArbiterRound;
  chainNow: number;
  onPlaceBid?: (amount: string) => Promise<ArbiterBidReceipt>;
  bidStatusLabel?: string;
}) {
  const reserveBid = formatStrk(BigInt(round.reservePrice), 18);
  const [bidAmount, setBidAmount] = useState(reserveBid);
  const [isSubmitting, setSubmitting] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ArbiterBidReceipt | null>(null);
  const state = auctionState(phase, round);
  const canBid = phase === 'pending' || phase === 'bidding';
  const bidIsValid = Number(bidAmount) > 0;

  useEffect(() => {
    setBidAmount(reserveBid);
    setBidError(null);
    setReceipt(null);
  }, [reserveBid, round.id]);

  const submitBid = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onPlaceBid || !bidIsValid || isSubmitting) return;
    setBidError(null);
    setReceipt(null);
    setSubmitting(true);
    try {
      setReceipt(await onPlaceBid(bidAmount));
    } catch (reason) {
      setBidError(
        reason instanceof Error ? reason.message : 'Private bid failed.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-black px-5 py-6 sm:px-7 sm:py-8">
      <div className="flex items-center justify-between text-[8px] tracking-[0.2em]">
        <span className="text-fg">BIDDING DETAILS</span>
        <span className="text-neutral-500">
          ROUND {String(round.id).padStart(4, '0')}
        </span>
      </div>

      <div className="mt-4 grid items-center gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-12">
        <AuctionOrbit phase={phase} round={round} chainNow={chainNow} />

        <div className="min-w-0">
          <h3 className="text-3xl font-bold tracking-[-0.06em] sm:text-4xl">
            {state.title}
          </h3>
          <p className="mt-2 max-w-xl text-xs leading-5 text-neutral-400">
            {state.body}
          </p>

          <div className="mt-6 grid gap-px bg-grid sm:grid-cols-3">
            <CompactDetail
              label="RESERVE"
              value={formatArbiterAmount(round.reservePrice)}
            />
            <CompactDetail label="BIDS" value={String(round.submissionCount)} />
            <CompactDetail
              label="WINDOW"
              value={formatDuration(round.schedule.biddingDurationSeconds)}
            />
          </div>

          {canBid ? (
            <form className="mt-6" onSubmit={submitBid}>
              <div className="flex items-center justify-between gap-3 text-[8px] tracking-[0.18em]">
                <label
                  htmlFor="arbiter-bid-amount"
                  className="text-neutral-500"
                >
                  YOUR SEALED BID
                </label>
                <span className={onPlaceBid ? 'text-fg' : 'text-neutral-600'}>
                  {bidStatusLabel ||
                    (onPlaceBid
                      ? 'READY WALLET // PRIVATE'
                      : 'READY WALLET REQUIRED')}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] border border-neutral-600 focus-within:border-fg">
                <input
                  id="arbiter-bid-amount"
                  type="number"
                  min={reserveBid}
                  step="0.01"
                  inputMode="decimal"
                  value={bidAmount}
                  onChange={(event) => {
                    setBidAmount(event.target.value);
                    setReceipt(null);
                    setBidError(null);
                  }}
                  className="min-w-0 bg-black px-4 py-4 text-2xl font-bold tabular-nums tracking-[-0.04em] text-fg outline-none"
                />
                <span className="grid place-items-center border-l border-grid px-4 text-[10px] tracking-[0.16em] text-neutral-400">
                  STRK
                </span>
              </div>
              <button
                type="submit"
                disabled={!onPlaceBid || !bidIsValid || isSubmitting}
                title={
                  onPlaceBid
                    ? 'Place a sealed bid'
                    : bidStatusLabel || 'Private wallet bidding is unavailable'
                }
                className="mt-3 w-full border border-fg bg-fg px-4 py-4 text-[10px] font-bold tracking-[0.2em] text-bg transition-colors enabled:hover:bg-transparent enabled:hover:text-fg disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-transparent disabled:text-dim focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg"
              >
                {isSubmitting
                  ? 'CONFIRM IN READY…'
                  : receipt
                    ? 'BID SUBMITTED'
                    : 'PLACE SEALED BID'}
              </button>
              {receipt ? (
                <p
                  className="mt-2 text-[8px] tracking-[0.16em] text-fg"
                  role="status"
                >
                  TRANSACTION {shortAddress(receipt.transactionHash)} // CLAIM
                  TICKET SAVED ON THIS DEVICE
                </p>
              ) : null}
              {bidError ? (
                <p
                  className="mt-2 text-[9px] leading-4 text-red-400"
                  role="alert"
                >
                  {bidError}
                </p>
              ) : null}
            </form>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function HistoryPanel({ entries }: { entries: ArbiterHistoryEntry[] }) {
  return (
    <section className="min-h-[30rem] bg-black">
      <div className="flex items-center justify-between border-b border-grid px-5 py-5 sm:px-7">
        <div>
          <div className="text-[8px] tracking-[0.22em] text-neutral-500">
            COMPLETED CONTROL CYCLES
          </div>
          <h3 className="mt-2 text-2xl font-bold tracking-[-0.05em]">
            Winner history
          </h3>
        </div>
        <span className="text-[8px] tracking-[0.18em] text-neutral-500">
          VERIFIED
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="grid min-h-[22rem] place-items-center px-6 text-center">
          <div>
            <div className="text-[9px] tracking-[0.2em] text-neutral-500">
              NO WINNERS YET
            </div>
            <p className="mt-3 text-xs text-neutral-600">
              Completed auctions will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div role="table" aria-label="Arbiter winner history">
          <div
            role="row"
            className="hidden grid-cols-[6rem_minmax(0,1fr)_7rem_10rem] border-b border-grid text-[8px] tracking-[0.18em] text-neutral-600 sm:grid"
          >
            <div role="columnheader" className="px-7 py-4">
              ROUND
            </div>
            <div role="columnheader" className="px-5 py-4">
              WINNER
            </div>
            <div role="columnheader" className="px-5 py-4 text-right">
              BIDS
            </div>
            <div role="columnheader" className="px-7 py-4 text-right">
              WINNING BID
            </div>
          </div>
          {entries.map((entry) => (
            <div
              key={entry.roundId}
              role="row"
              className="grid grid-cols-2 border-b border-grid last:border-b-0 sm:grid-cols-[6rem_minmax(0,1fr)_7rem_10rem]"
            >
              <HistoryCell label="ROUND" className="px-5 py-4 sm:px-7 sm:py-5">
                <span className="text-[10px] text-neutral-500">
                  {String(entry.roundId).padStart(4, '0')}
                </span>
              </HistoryCell>
              <HistoryCell
                label="WINNER"
                className="px-5 py-4 sm:py-5"
                title={
                  entry.winnerAddress ??
                  'The winning wallet has not claimed control yet'
                }
              >
                <span
                  className={`text-sm font-bold tracking-[-0.03em] ${
                    entry.winnerAddress ? 'text-fg' : 'text-neutral-500'
                  }`}
                >
                  {entry.winnerAddress
                    ? shortAddress(entry.winnerAddress)
                    : 'UNCLAIMED'}
                </span>
              </HistoryCell>
              <HistoryCell
                label="BIDS"
                className="border-t border-grid px-5 py-4 sm:border-t-0 sm:py-5 sm:text-right"
              >
                <span className="text-sm tabular-nums text-neutral-300">
                  {entry.bidCount}
                </span>
              </HistoryCell>
              <HistoryCell
                label="WINNING BID"
                className="border-t border-grid px-5 py-4 text-right sm:border-t-0 sm:px-7 sm:py-5"
              >
                <span className="text-sm font-bold tabular-nums text-fg">
                  {formatArbiterAmount(entry.winningBid)}
                </span>
              </HistoryCell>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function HistoryCell({
  label,
  className,
  title,
  children,
}: {
  label: string;
  className: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div role="cell" className={className} title={title}>
      <div className="mb-2 text-[7px] tracking-[0.16em] text-neutral-600 sm:hidden">
        {label}
      </div>
      {children}
    </div>
  );
}

function CompactDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black px-3 py-3">
      <div className="text-[7px] tracking-[0.16em] text-neutral-600">
        {label}
      </div>
      <div className="mt-1 text-[11px] text-neutral-200">{value}</div>
    </div>
  );
}

function AuctionOrbit({
  phase,
  round,
  chainNow,
}: {
  phase: ArbiterPhase;
  round: ArbiterRound;
  chainNow: number;
}) {
  const deadline = arbiterDeadline(phase, round);
  const progress = biddingProgress(phase, round, chainNow);
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);
  const value = orbitValue(phase, deadline, chainNow);

  return (
    <div className="relative mx-auto my-8 grid h-56 w-56 place-items-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 200 200"
        className={`absolute inset-0 h-full w-full -rotate-90 text-fg ${
          phase === 'pending'
            ? 'animate-[spin_18s_linear_infinite] motion-reduce:animate-none'
            : ''
        }`}
      >
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="1"
        />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="square"
          strokeDasharray={
            phase === 'pending' ? '5 12' : `${circumference} ${circumference}`
          }
          strokeDashoffset={phase === 'pending' ? 0 : dashOffset}
        />
        <circle
          cx="100"
          cy="12"
          r="3"
          fill="currentColor"
          className={phase === 'pending' ? 'animate-pulse' : ''}
        />
      </svg>
      <div className="relative text-center">
        <div className="text-[8px] tracking-[0.22em] text-neutral-500">
          {orbitLabel(phase)}
        </div>
        <div className="mt-2 text-3xl font-bold tabular-nums tracking-[-0.07em] sm:text-4xl">
          {value}
        </div>
        {phase === 'pending' ? (
          <div className="mt-2 text-[8px] tracking-[0.18em] text-fg">
            STARTS ON BID
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ErrorNotice({
  hasSnapshot,
  onRefresh,
}: {
  hasSnapshot: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="flex items-center justify-between gap-3 border-l border-fg bg-white/[0.04] px-3 py-3">
      <span className="text-[9px] leading-4 text-neutral-400">
        {hasSnapshot
          ? 'Showing the last verified data.'
          : 'Verified data unavailable.'}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        className="text-[8px] tracking-[0.16em] text-fg hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg"
      >
        RETRY
      </button>
    </section>
  );
}

function ProjectionPlaceholder({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      disabled
      title="Signal controls are planned for the next integration phase"
      className={`${compact ? 'mt-0' : 'mt-4'} border border-neutral-700 px-3 py-2 text-[8px] tracking-[0.14em] text-dim`}
    >
      SET SIGNAL // SOON
    </button>
  );
}

function MetricText({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] tracking-[0.16em] text-neutral-500">
        {label}
      </div>
      <div className="mt-1 truncate text-[11px] text-white" title={value}>
        {value}
      </div>
    </div>
  );
}

function auctionState(phase: ArbiterPhase, round: ArbiterRound) {
  switch (phase) {
    case 'pending':
      return {
        title: 'Start the clock',
        body: `The first sealed bid opens a ${formatAuctionWindow(round.schedule.biddingDurationSeconds)} auction.`,
      };
    case 'bidding':
      return {
        title: 'Bidding is open',
        body: 'Bid privately. Control changes only after the result is confirmed.',
      };
    case 'acceptance':
    case 'settling':
      return {
        title: 'Choosing the winner',
        body: 'Bidding is closed. The current controller stays in place.',
      };
    case 'recovery':
      return {
        title: 'Awaiting recovery',
        body: 'The current controller stays in place while the round recovers.',
      };
    case 'settled':
      return round.result?.hasWinner
        ? {
            title: 'Winner confirmed',
            body: 'Control changes when the winning commitment is claimed.',
          }
        : {
            title: 'Control stays put',
            body: 'No bid cleared the reserve. A new auction can begin.',
          };
    case 'aborted':
      return {
        title: 'Control stays put',
        body: 'This round ended without a winner. A new auction can begin.',
      };
    default:
      return {
        title: 'No auction',
        body: 'The current signal remains active.',
      };
  }
}

function orbitValue(
  phase: ArbiterPhase,
  deadline: { label: string; at: string } | null,
  chainNow: number
) {
  if (phase === 'pending') return 'OPEN';
  if (phase === 'bidding' && deadline) {
    return compactAuctionCountdown(deadline.at, chainNow);
  }
  if (phase === 'acceptance' || phase === 'settling') return 'SEALED';
  if (phase === 'settled') return 'FINAL';
  if (phase === 'aborted') return 'ENDED';
  if (phase === 'recovery') return 'HOLD';
  return '—';
}

function orbitLabel(phase: ArbiterPhase) {
  if (phase === 'bidding') return 'BIDDING CLOSES IN';
  if (phase === 'acceptance' || phase === 'settling') return 'RESOLVING';
  if (phase === 'pending') return 'AUCTION';
  return arbiterPhaseLabel(phase);
}

function summaryAuctionValue(
  phase: ArbiterPhase,
  deadline: { label: string; at: string } | null,
  chainNow: number
) {
  if (phase === 'pending') return 'WAITING FOR A BID';
  if (phase === 'bidding' && deadline) {
    return compactAuctionCountdown(deadline.at, chainNow);
  }
  if (phase === 'acceptance' || phase === 'settling') return 'RESOLVING';
  return arbiterPhaseLabel(phase);
}

function biddingProgress(
  phase: ArbiterPhase,
  round: ArbiterRound,
  chainNow: number
) {
  if (phase === 'acceptance' || phase === 'settling' || phase === 'settled') {
    return 1;
  }
  if (phase !== 'bidding' || !round.startedAt || !round.biddingDeadline) {
    return 0;
  }
  const startedAt = Date.parse(round.startedAt);
  const deadline = Date.parse(round.biddingDeadline);
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(deadline) ||
    deadline <= startedAt
  ) {
    return 0;
  }
  return Math.min(
    1,
    Math.max(0, (chainNow - startedAt) / (deadline - startedAt))
  );
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'FIXED WINDOW';
  if (seconds % 86400 === 0) {
    const days = seconds / 86400;
    return `${days} ${days === 1 ? 'DAY' : 'DAYS'}`;
  }
  if (seconds % 3600 === 0) return `${seconds / 3600} HOURS`;
  return `${Math.round(seconds / 60)} MINUTES`;
}

function formatAuctionWindow(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'fixed-window';
  if (seconds % 86400 === 0) {
    const days = seconds / 86400;
    return `${days}-day`;
  }
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours}-hour`;
  }
  return `${Math.round(seconds / 60)}-minute`;
}

function compactAuctionCountdown(at: string, now: number) {
  const deadline = Date.parse(at);
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return '—';
  const remainingMinutes = Math.max(0, Math.ceil((deadline - now) / 60_000));
  const days = Math.floor(remainingMinutes / (24 * 60));
  const hours = Math.floor((remainingMinutes % (24 * 60)) / 60);
  const minutes = remainingMinutes % 60;
  if (days > 0) return `${days}D ${String(hours).padStart(2, '0')}H`;
  if (hours > 0) {
    return `${hours}H ${String(minutes).padStart(2, '0')}M`;
  }
  return `${minutes}M`;
}

function useCloseOnEscape(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [isOpen, onClose]);
}

function useArbiterChainNow(isOpen: boolean, observedAt?: string) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isOpen || !observedAt) return;
    const startedAt = performance.now();
    setElapsed(0);
    const timer = window.setInterval(() => {
      setElapsed(performance.now() - startedAt);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, observedAt]);

  const observed = observedAt ? Date.parse(observedAt) : Number.NaN;
  return Number.isFinite(observed) ? observed + elapsed : Number.NaN;
}
