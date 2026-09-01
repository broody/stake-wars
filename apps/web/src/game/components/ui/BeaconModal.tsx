import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useSignTypedData } from '@starknetfoundation/starknet-start-react';
import { Link, useLocation } from 'react-router-dom';
import type {
  BeaconHistoryEntry,
  BeaconPhase,
  BeaconRound,
  BeaconSnapshot,
} from '../../services/api';
import type { BeaconBidReceipt } from '../../services/whisperBid';
import type { StoredBeaconBid } from '../../services/beaconBidStorage';
import { api, type PreparedBeaconImage } from '../../services/api';
import { useBeacon } from '../../contexts/useBeacon';
import { useWallet } from '../../contexts/WalletContext';
import { prepareBeaconImage } from '../../utils/beaconImage';
import { clipboardImageFile } from '../../utils/sectorImage';
import {
  beaconCountdown,
  beaconDeadline,
  beaconPhaseLabel,
  formatBeaconAmount,
} from '../../utils/beacon';
import { addressesMatch, formatStrk, shortAddress } from '../../utils/format';
import { shareableGameViewSearch } from '../../utils/gameViewSearch';

interface BeaconModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BeaconConsoleProps extends BeaconModalProps {
  snapshot: BeaconSnapshot | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onPlaceBid?: (amount: string) => Promise<BeaconBidReceipt>;
  bidStatusLabel?: string;
  presentation?: 'hud' | 'page';
  title?: string;
  view?: 'auction' | 'history';
  history?: BeaconHistoryEntry[];
  ownBids?: StoredBeaconBid[];
  ownBidsLoading?: boolean;
  ownBidsError?: string | null;
}

interface BeaconSummaryCardProps extends BeaconModalProps {
  snapshot: BeaconSnapshot | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  viewerAddress?: string | null;
}

export function BeaconModal({ isOpen, onClose }: BeaconModalProps) {
  const { snapshot, isLoading, error, refresh } = useBeacon();
  const { address } = useWallet();

  return (
    <BeaconSummaryCard
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

export function BeaconSummaryCard({
  isOpen,
  onClose,
  snapshot,
  isLoading,
  error,
  onRefresh,
  viewerAddress,
}: BeaconSummaryCardProps) {
  const location = useLocation();
  const projectionInputRef = useRef<HTMLInputElement>(null);
  const [projectionFile, setProjectionFile] = useState<File | null>(null);

  useCloseOnEscape(isOpen, onClose);
  const isCurrentController = Boolean(
    viewerAddress &&
      snapshot?.controller &&
      addressesMatch(viewerAddress, snapshot.controller.address)
  );

  useEffect(() => {
    if (!isOpen || !isCurrentController || snapshot?.billboard) {
      setProjectionFile(null);
    }
  }, [isCurrentController, isOpen, snapshot?.billboard]);

  if (!isOpen) return null;

  const search = shareableGameViewSearch(new URLSearchParams(location.search));
  search.set('tracking', 'beacon');

  return (
    <aside
      role="dialog"
      aria-labelledby="beacon-summary-title"
      data-beacon-console
      className="activity-scrollbar pointer-events-auto absolute left-3 right-3 top-20 z-[80] max-h-[calc(100vh-6.5rem)] overflow-y-auto border border-neutral-600 bg-black/95 font-mono text-xs text-fg shadow-[8px_8px_0_rgba(255,255,255,0.08)] backdrop-blur-md sm:left-auto sm:right-4 sm:w-[24rem]"
    >
      <header className="flex items-center justify-between border-b border-grid px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-[8px] tracking-[0.24em] text-fg">
            <span className="h-1.5 w-1.5 rounded-full bg-fg" />
            BEACON
          </div>
          <h2
            id="beacon-summary-title"
            className="mt-1 text-base font-bold tracking-[-0.03em]"
          >
            {snapshot?.billboard ? 'PAID TRANSMISSION' : 'THE BEACON'}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 text-[9px] tracking-[0.16em] text-dim transition-colors hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg"
          aria-label="Close Beacon status"
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

        {snapshot?.billboard ? (
          <BeaconBillboard billboard={snapshot.billboard} />
        ) : null}

        {snapshot?.controller ? (
          <section className="border-l border-fg pl-3">
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
          </section>
        ) : null}

        {snapshot && !snapshot.controller ? (
          <p className="border-l border-neutral-700 pl-3 leading-5 text-neutral-400">
            No controller has been assigned.
          </p>
        ) : null}

        {!isLoading && !snapshot && !error ? (
          <p className="py-3 text-neutral-400">No Beacon state is available.</p>
        ) : null}

        {isCurrentController && viewerAddress && !snapshot?.billboard ? (
          <>
            <input
              ref={projectionInputRef}
              type="file"
              accept="image/webp,image/jpeg,image/png"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) setProjectionFile(file);
              }}
            />
            {projectionFile ? (
              <BeaconProjectionUpload
                initialFile={projectionFile}
                walletAddress={viewerAddress}
                onCancel={() => setProjectionFile(null)}
                onPublished={onRefresh}
              />
            ) : (
              <BeaconControllerActions
                onSelect={() => projectionInputRef.current?.click()}
              />
            )}
          </>
        ) : null}

        {isCurrentController && snapshot?.billboard ? (
          <BeaconTransmissionLocked />
        ) : null}
      </div>

      <Link
        to={{ pathname: '/beacon', search: `?${search.toString()}` }}
        className="flex items-center justify-between border-t border-grid px-4 py-3 text-[9px] tracking-[0.18em] transition-colors hover:bg-fg hover:text-bg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-fg"
      >
        <span>OPEN BEACON PAGE</span>
        <span aria-hidden="true">↗</span>
      </Link>
    </aside>
  );
}

export function BeaconConsole({
  isOpen,
  onClose,
  snapshot,
  isLoading,
  error,
  onRefresh,
  onPlaceBid,
  bidStatusLabel,
  presentation = 'hud',
  title = 'THE BEACON',
  view = 'auction',
  history = [],
  ownBids = [],
  ownBidsLoading = false,
  ownBidsError = null,
}: BeaconConsoleProps) {
  const chainNow = useBeaconChainNow(isOpen, snapshot?.observedAt);
  useCloseOnEscape(isOpen && presentation === 'hud', onClose);
  if (!isOpen) return null;

  const phase = snapshot?.phase ?? 'none';
  const round = snapshot?.round ?? null;
  const isPage = presentation === 'page';
  const Container = isPage ? 'section' : 'aside';

  return (
    <Container
      role={isPage ? 'region' : 'dialog'}
      aria-labelledby="beacon-title"
      data-beacon-console
      className={
        isPage
          ? 'relative w-full overflow-hidden border border-grid bg-black/85 font-mono text-fg'
          : 'activity-scrollbar pointer-events-auto absolute left-3 right-3 top-20 z-[80] max-h-[calc(100%-6rem)] overflow-y-auto border border-neutral-600 bg-black/95 font-mono text-fg shadow-[8px_8px_0_rgba(255,255,255,0.08)] backdrop-blur-md sm:left-auto sm:right-4 sm:w-[28rem]'
      }
    >
      <header className="flex items-center justify-between border-b border-grid px-4 py-3 sm:px-6">
        <div>
          <div className="text-[8px] tracking-[0.24em] text-fg">
            CONTROL SIGNAL // {beaconPhaseLabel(phase)}
          </div>
          <h2
            id="beacon-title"
            className="mt-1 text-base font-bold tracking-[-0.03em]"
          >
            {title}
          </h2>
        </div>
        {isPage && view === 'auction' && round ? (
          <div
            className="flex items-center gap-3 border-l border-grid pl-4 sm:gap-4 sm:pl-6"
            aria-label={`Round ${round.id}`}
          >
            <span className="text-[7px] tracking-[0.22em] text-neutral-500">
              CURRENT ROUND
            </span>
            <span className="text-xl font-bold tabular-nums tracking-[-0.05em] text-fg sm:text-2xl">
              {String(round.id).padStart(4, '0')}
            </span>
          </div>
        ) : !isPage ? (
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
              VERIFYING BEACON
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
          ownBids={ownBids}
          ownBidsLoading={ownBidsLoading}
          ownBidsError={ownBidsError}
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
          No Beacon state is available.
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
  ownBids,
  ownBidsLoading,
  ownBidsError,
}: {
  phase: BeaconPhase;
  round: BeaconRound;
  chainNow: number;
  onPlaceBid?: (amount: string) => Promise<BeaconBidReceipt>;
  bidStatusLabel?: string;
  ownBids: StoredBeaconBid[];
  ownBidsLoading: boolean;
  ownBidsError: string | null;
}) {
  const reserveBid = formatStrk(BigInt(round.reservePrice), 18);
  const [bidAmount, setBidAmount] = useState(reserveBid);
  const [isSubmitting, setSubmitting] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<BeaconBidReceipt | null>(null);
  const submissionInFlight = useRef(false);
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
    if (
      !onPlaceBid ||
      !bidIsValid ||
      isSubmitting ||
      submissionInFlight.current
    ) {
      return;
    }
    submissionInFlight.current = true;
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
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-black px-5 py-6 sm:px-7 sm:py-8">
      <div className="text-[8px] tracking-[0.2em] text-fg">BIDDING DETAILS</div>

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
              value={formatBeaconAmount(round.reservePrice)}
            />
            <CompactDetail label="BIDS" value={String(round.submissionCount)} />
            <CompactDetail
              label="WINDOW"
              value={formatDuration(round.schedule.biddingDurationSeconds)}
            />
          </div>

          <OwnBidsPanel
            bids={ownBids}
            isLoading={ownBidsLoading}
            error={ownBidsError}
          />

          {canBid ? (
            <form className="mt-6" onSubmit={submitBid}>
              <div className="flex items-center justify-between gap-3 text-[8px] tracking-[0.18em]">
                <label htmlFor="beacon-bid-amount" className="text-neutral-500">
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
                  id="beacon-bid-amount"
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
              {receipt?.storageStatus === 'failed' ? (
                <p
                  className="mt-2 text-[9px] leading-4 text-red-400"
                  role="alert"
                >
                  BID SUBMITTED // COULD NOT SAVE ON THIS DEVICE
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

function OwnBidsPanel({
  bids,
  isLoading,
  error,
}: {
  bids: StoredBeaconBid[];
  isLoading: boolean;
  error: string | null;
}) {
  if (!isLoading && bids.length === 0 && !error) return null;

  return (
    <section
      aria-label="Your sealed bids"
      className="mt-5 border-l border-fg bg-white/[0.035] px-4 py-3"
    >
      <div className="flex items-center justify-between gap-3 text-[8px] tracking-[0.2em]">
        <span className="text-neutral-500">
          {bids.length === 1 ? 'YOUR SEALED BID' : 'YOUR SEALED BIDS'}
        </span>
        <span className="text-neutral-600">SAVED ON THIS DEVICE</span>
      </div>
      {isLoading ? (
        <div className="mt-3 text-[9px] tracking-[0.18em] text-neutral-500">
          RESTORING…
        </div>
      ) : null}
      {!isLoading && bids.length > 0 ? (
        <div className="mt-2 divide-y divide-grid">
          {bids.map((bid, index) => (
            <div
              key={bid.bidHandle}
              className="flex items-center justify-between gap-4 py-2 first:pt-1 last:pb-0"
            >
              <span className="text-xl font-bold tabular-nums tracking-[-0.04em] text-fg">
                {formatBeaconAmount(bid.amount)}
              </span>
              <span className="text-[8px] tracking-[0.16em] text-neutral-500">
                BID {String(bids.length - index).padStart(2, '0')}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 text-[9px] tracking-[0.14em] text-red-400">
          {error}
        </div>
      ) : null}
    </section>
  );
}

function HistoryPanel({ entries }: { entries: BeaconHistoryEntry[] }) {
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
        <div role="table" aria-label="Beacon winner history">
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
                <span className="text-lg font-bold tabular-nums tracking-[-0.04em] text-neutral-300">
                  {String(entry.roundId).padStart(4, '0')}
                </span>
              </HistoryCell>
              <HistoryCell
                label="WINNER"
                className="px-5 py-4 sm:py-5"
                title={
                  entry.winnerAddress ?? 'The winning wallet is being verified'
                }
              >
                <span
                  className={`text-sm font-bold tracking-[-0.03em] ${
                    entry.winnerAddress ? 'text-fg' : 'text-neutral-500'
                  }`}
                >
                  {entry.winnerAddress
                    ? shortAddress(entry.winnerAddress)
                    : 'VERIFYING'}
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
                  {formatBeaconAmount(entry.winningBid)}
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
    <div className="bg-black px-4 py-4 sm:px-5 sm:py-5">
      <div className="text-[8px] tracking-[0.18em] text-neutral-500">
        {label}
      </div>
      <div className="mt-2 text-xl font-bold leading-none tabular-nums tracking-[-0.04em] text-fg sm:text-2xl">
        {value}
      </div>
    </div>
  );
}

function AuctionOrbit({
  phase,
  round,
  chainNow,
}: {
  phase: BeaconPhase;
  round: BeaconRound;
  chainNow: number;
}) {
  const deadline = beaconDeadline(phase, round);
  const progress = auctionProgress(phase, round, chainNow);
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
          className={
            phase === 'pending' || phase === 'settling' ? 'animate-pulse' : ''
          }
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

function BeaconBillboard({
  billboard,
}: {
  billboard: NonNullable<BeaconSnapshot['billboard']>;
}) {
  return (
    <section aria-label="Paid Beacon transmission">
      <div className="border border-neutral-700 bg-neutral-950 p-2">
        <BeaconBillboardImage
          key={`${billboard.imageUrl}:${billboard.thumbnailUrl}`}
          imageUrl={billboard.imageUrl}
          thumbnailUrl={billboard.thumbnailUrl}
        />
      </div>
      {billboard.description ? (
        <p className="mt-3 whitespace-pre-line text-[11px] leading-5 text-neutral-200">
          {billboard.description}
        </p>
      ) : null}
      {billboard.destinationUrl ? (
        <a
          href={billboard.destinationUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="mt-3 flex items-center justify-between gap-3 border border-fg px-3 py-3 text-[9px] tracking-[0.14em] transition-colors hover:bg-fg hover:text-bg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg"
          title={billboard.destinationUrl}
        >
          <span className="min-w-0 truncate">
            {beaconDestinationLabel(billboard.destinationUrl)}
          </span>
          <span className="shrink-0" aria-hidden="true">
            VISIT ↗
          </span>
        </a>
      ) : null}
    </section>
  );
}

function BeaconBillboardImage({
  imageUrl,
  thumbnailUrl,
}: {
  imageUrl: string;
  thumbnailUrl: string;
}) {
  const [source, setSource] = useState(imageUrl);
  const [isUnavailable, setUnavailable] = useState(false);

  return (
    <div className="grid min-h-36 max-h-64 place-items-center overflow-hidden bg-black">
      {isUnavailable ? (
        <span className="text-[8px] tracking-[0.18em] text-neutral-600">
          IMAGE SIGNAL UNAVAILABLE
        </span>
      ) : (
        <img
          src={source}
          alt="Beacon advertisement artwork"
          className="h-auto max-h-64 max-w-full object-contain"
          onError={() => {
            if (source !== thumbnailUrl && thumbnailUrl) {
              setSource(thumbnailUrl);
              return;
            }
            setUnavailable(true);
          }}
        />
      )}
    </div>
  );
}

function BeaconTransmissionLocked() {
  return (
    <section className="border-t border-grid pt-4">
      <div className="flex items-center justify-between text-[8px] tracking-[0.18em]">
        <span className="text-neutral-500">TRANSMISSION STATUS</span>
        <span>LOCKED</span>
      </div>
      <p className="mt-2 text-[9px] leading-4 text-neutral-500">
        Published for this control term. It cannot be edited or replaced.
      </p>
    </section>
  );
}

function BeaconControllerActions({ onSelect }: { onSelect: () => void }) {
  return (
    <section className="border-t border-grid pt-4">
      <div className="flex items-center justify-between text-[8px] tracking-[0.18em] text-neutral-500">
        <span>CONTROLLER ACTIONS</span>
        <span>01 AVAILABLE</span>
      </div>
      <button
        type="button"
        onClick={onSelect}
        className="mt-3 flex w-full items-center justify-between border border-fg bg-fg px-3 py-3 text-left text-bg transition-colors hover:bg-neutral-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg"
      >
        <span className="text-[10px] font-semibold tracking-[0.18em]">
          BUILD TRANSMISSION
        </span>
        <span aria-hidden="true" className="text-base">
          →
        </span>
      </button>
    </section>
  );
}

function beaconDestinationLabel(destinationUrl: string) {
  try {
    return new URL(destinationUrl).hostname.replace(/^www\./, '');
  } catch {
    return destinationUrl;
  }
}

function isValidBeaconDestination(destinationUrl: string) {
  try {
    const parsed = new URL(destinationUrl.trim());
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.hostname.length > 0 &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

const DEFAULT_MAXIMUM_IMAGE_BYTES = 2 * 1024 * 1024;
const BEACON_DESCRIPTION_MAX_LENGTH = 280;
const BEACON_DESTINATION_MAX_LENGTH = 2048;

function BeaconProjectionUpload({
  initialFile,
  walletAddress,
  onCancel,
  onPublished,
}: {
  initialFile: File;
  walletAddress: string;
  onCancel: () => void;
  onPublished: () => void;
}) {
  const { signTypedDataAsync } = useSignTypedData({});
  const inputRef = useRef<HTMLInputElement>(null);
  const preparationVersionRef = useRef(0);
  const preparedInitialFileRef = useRef<File | null>(null);
  const [prepared, setPrepared] = useState<PreparedBeaconImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [maximumImageBytes, setMaximumImageBytes] = useState(
    DEFAULT_MAXIMUM_IMAGE_BYTES
  );
  const [uploadsEnabled, setUploadsEnabled] = useState(false);
  const [isCheckingService, setCheckingService] = useState(true);
  const [isPreparing, setPreparing] = useState(false);
  const [isUploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setCheckingService(true);
    api
      .getConfig(controller.signal)
      .then((configuration) => {
        setUploadsEnabled(Boolean(configuration.imageUploadsEnabled));
        if (
          Number.isFinite(configuration.maxImageBytes) &&
          configuration.maxImageBytes > 0
        ) {
          setMaximumImageBytes(configuration.maxImageBytes);
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setUploadsEnabled(false);
          setUploadError(
            failure instanceof Error
              ? failure.message
              : 'Unable to check image storage.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCheckingService(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  const chooseFile = useCallback(
    async (file: File | undefined) => {
      if (!file || isUploading) return;
      const version = ++preparationVersionRef.current;
      setPreparing(true);
      setUploadError(null);
      setUploadNotice(null);
      try {
        const next = await prepareBeaconImage(file, maximumImageBytes);
        if (version !== preparationVersionRef.current) return;
        const nextPreviewUrl = URL.createObjectURL(next.detail);
        setPrepared(next);
        setFileName(file.name || 'PASTED IMAGE');
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextPreviewUrl;
        });
      } catch (failure) {
        if (version !== preparationVersionRef.current) return;
        setUploadError(
          failure instanceof Error
            ? failure.message
            : 'Unable to prepare this image.'
        );
      } finally {
        if (version === preparationVersionRef.current) setPreparing(false);
      }
    },
    [isUploading, maximumImageBytes]
  );

  useEffect(() => {
    if (preparedInitialFileRef.current === initialFile) return;
    preparedInitialFileRef.current = initialFile;
    void chooseFile(initialFile);
  }, [chooseFile, initialFile]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || isUploading) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, [contenteditable]:not([contenteditable="false"])'
        )
      ) {
        return;
      }
      const file = clipboardImageFile(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void chooseFile(file);
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [chooseFile, isUploading]);

  const upload = async () => {
    if (
      !prepared ||
      !uploadsEnabled ||
      isUploading ||
      !description.trim() ||
      !isValidBeaconDestination(destinationUrl)
    ) {
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadNotice(null);
    try {
      await api.uploadBeaconArtwork({
        walletAddress,
        description: description.trim(),
        destinationUrl: destinationUrl.trim(),
        prepared,
        signTypedData: signTypedDataAsync,
      });
      setUploadNotice('TRANSMISSION PUBLISHED');
      onPublished();
    } catch (failure) {
      setUploadError(
        failure instanceof Error ? failure.message : 'Image upload failed.'
      );
    } finally {
      setUploading(false);
    }
  };

  const disabled =
    isCheckingService ||
    isPreparing ||
    isUploading ||
    !uploadsEnabled ||
    !prepared ||
    !description.trim() ||
    !isValidBeaconDestination(destinationUrl);

  return (
    <section
      className="border-t border-grid pt-4"
      aria-label="Publish Beacon transmission"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[8px] tracking-[0.2em] text-neutral-500">
            PAID TRANSMISSION
          </div>
          <div className="mt-1 text-sm font-bold tracking-[-0.03em]">
            ONE-SHOT BROADCAST
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={isUploading}
          className="text-[8px] tracking-[0.16em] text-neutral-500 hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg disabled:opacity-50"
        >
          RETURN
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/webp,image/jpeg,image/png"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void chooseFile(file);
        }}
      />
      <button
        type="button"
        disabled={isPreparing || isUploading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void chooseFile(event.dataTransfer.files[0]);
        }}
        className="mt-3 w-full border border-dashed border-neutral-600 bg-neutral-950 p-3 text-left transition-colors hover:border-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg disabled:cursor-wait disabled:opacity-60"
      >
        <span className="grid min-h-32 max-h-64 place-items-center overflow-hidden border border-neutral-800 bg-black">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Prepared Beacon projection preview"
              className="h-auto max-h-64 max-w-full object-contain"
            />
          ) : (
            <span className="grid min-h-32 place-items-center text-[9px] tracking-[0.18em] text-neutral-600">
              CHOOSE · DROP · PASTE
            </span>
          )}
        </span>
        <span className="mt-2 block truncate text-[8px] tracking-[0.12em] text-neutral-500">
          {fileName || 'WEBP · JPEG · PNG'}
        </span>
      </button>

      <label className="mt-3 block" htmlFor="beacon-ad-description">
        <span className="flex items-center justify-between text-[8px] tracking-[0.16em] text-neutral-500">
          <span>DESCRIPTION</span>
          <span>
            {description.length}/{BEACON_DESCRIPTION_MAX_LENGTH}
          </span>
        </span>
        <textarea
          id="beacon-ad-description"
          rows={3}
          maxLength={BEACON_DESCRIPTION_MAX_LENGTH}
          value={description}
          disabled={isUploading}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Tell players what this transmission is promoting."
          className="mt-2 w-full resize-none border border-neutral-700 bg-black px-3 py-2 text-[11px] leading-5 text-fg outline-none placeholder:text-neutral-700 focus:border-fg disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      <label className="mt-3 block" htmlFor="beacon-ad-destination">
        <span className="text-[8px] tracking-[0.16em] text-neutral-500">
          DESTINATION LINK
        </span>
        <input
          id="beacon-ad-destination"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={BEACON_DESTINATION_MAX_LENGTH}
          value={destinationUrl}
          disabled={isUploading}
          onChange={(event) => setDestinationUrl(event.target.value)}
          placeholder="https://example.com"
          className="mt-2 w-full border border-neutral-700 bg-black px-3 py-2 text-[11px] text-fg outline-none placeholder:text-neutral-700 focus:border-fg disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      <p className="mt-3 border-l border-fg pl-3 text-[9px] leading-4 text-neutral-500">
        Publishing locks the image, description, and link until the next winner.
      </p>

      {!isCheckingService && !uploadsEnabled && !uploadError ? (
        <div className="mt-3 border border-neutral-700 px-3 py-2 text-[9px] leading-4 text-neutral-500">
          UPLOADS UNAVAILABLE · IMAGE STORAGE IS NOT CONFIGURED
        </div>
      ) : null}
      {uploadError ? (
        <div
          role="alert"
          className="mt-3 border border-red-700/70 px-3 py-2 text-[9px] leading-4 text-red-400"
        >
          UPLOAD FAILED · {uploadError}
        </div>
      ) : null}
      {uploadNotice ? (
        <div
          role="status"
          className="mt-3 border border-fg px-3 py-2 text-[9px] tracking-[0.14em] text-fg"
        >
          {uploadNotice}
        </div>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onClick={() => void upload()}
        className="mt-3 w-full border border-fg bg-fg px-3 py-3 text-[10px] font-semibold tracking-[0.18em] text-bg transition-colors hover:bg-neutral-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-600"
      >
        {isCheckingService
          ? 'CHECKING IMAGE SERVICE…'
          : isPreparing
            ? 'PREPARING IMAGE…'
            : isUploading
              ? 'PUBLISHING TRANSMISSION…'
              : !prepared
                ? 'CHOOSE IMAGE'
                : !description.trim()
                  ? 'ADD DESCRIPTION'
                  : !isValidBeaconDestination(destinationUrl)
                    ? 'ADD VALID LINK'
                    : 'PUBLISH TRANSMISSION'}
      </button>
    </section>
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

function auctionState(phase: BeaconPhase, round: BeaconRound) {
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
      return {
        title: 'Finalizing bids',
        body: 'Submitted bids can be funded until the settlement window opens.',
      };
    case 'settling':
      return {
        title: 'Choosing the winner',
        body: 'The settlement proof is being generated and confirmed onchain.',
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
            body: 'The winning wallet is being verified for control.',
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
  phase: BeaconPhase,
  deadline: { label: string; at: string } | null,
  chainNow: number
) {
  if (phase === 'pending') return 'OPEN';
  if (phase === 'bidding' && deadline) {
    return compactAuctionCountdown(deadline.at, chainNow);
  }
  if (phase === 'acceptance' && deadline) {
    return beaconCountdown(deadline.at, chainNow);
  }
  if (phase === 'settling') return 'PROVING';
  if (phase === 'settled') return 'FINAL';
  if (phase === 'aborted') return 'ENDED';
  if (phase === 'recovery') return 'HOLD';
  return '—';
}

function orbitLabel(phase: BeaconPhase) {
  if (phase === 'bidding') return 'BIDDING CLOSES IN';
  if (phase === 'acceptance') return 'SETTLEMENT STARTS IN';
  if (phase === 'settling') return 'SETTLEMENT';
  if (phase === 'pending') return 'AUCTION';
  return beaconPhaseLabel(phase);
}

function auctionProgress(
  phase: BeaconPhase,
  round: BeaconRound,
  chainNow: number
) {
  if (phase === 'settling' || phase === 'settled') {
    return 1;
  }
  if (phase === 'acceptance') {
    return timedProgress(
      round.biddingDeadline,
      round.forceRevealAfter,
      chainNow
    );
  }
  if (phase === 'bidding') {
    return timedProgress(round.startedAt, round.biddingDeadline, chainNow);
  }
  return 0;
}

function timedProgress(
  startsAtValue: string | null,
  endsAtValue: string | null,
  chainNow: number
) {
  if (!startsAtValue || !endsAtValue) return 0;
  const startsAt = Date.parse(startsAtValue);
  const endsAt = Date.parse(endsAtValue);
  if (
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt) ||
    endsAt <= startsAt
  ) {
    return 0;
  }
  return Math.min(1, Math.max(0, (chainNow - startsAt) / (endsAt - startsAt)));
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

function useBeaconChainNow(isOpen: boolean, observedAt?: string) {
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
