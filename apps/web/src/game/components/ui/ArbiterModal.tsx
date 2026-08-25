import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ArbiterSnapshot } from '../../services/api';
import type { ArbiterPreviewMode } from '../../services/arbiterMock';
import { useArbiterPreview } from '../../contexts/useArbiterPreview';
import { useWallet } from '../../contexts/WalletContext';
import {
  arbiterCountdown,
  arbiterDeadline,
  arbiterPhaseLabel,
  formatArbiterAmount,
} from '../../utils/arbiter';
import { addressesMatch, shortAddress } from '../../utils/format';

interface ArbiterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ArbiterConsoleProps extends ArbiterModalProps {
  snapshot: ArbiterSnapshot | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  previewMode?: ArbiterPreviewMode;
  onPreviewModeChange?: (mode: ArbiterPreviewMode) => void;
  presentation?: 'hud' | 'page';
  viewerAddress?: string | null;
  title?: string;
}

export function ArbiterModal({ isOpen, onClose }: ArbiterModalProps) {
  const { snapshot, isLoading, error, refresh, previewMode } =
    useArbiterPreview();
  const { address } = useWallet();

  return (
    <ArbiterSummaryCard
      isOpen={isOpen}
      onClose={onClose}
      snapshot={snapshot}
      isLoading={isLoading}
      error={error}
      onRefresh={refresh}
      previewMode={previewMode}
      viewerAddress={address}
    />
  );
}

interface ArbiterSummaryCardProps extends ArbiterModalProps {
  snapshot: ArbiterSnapshot | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  previewMode?: ArbiterPreviewMode;
  viewerAddress?: string | null;
}

export function ArbiterSummaryCard({
  isOpen,
  onClose,
  snapshot,
  isLoading,
  error,
  onRefresh,
  previewMode,
  viewerAddress,
}: ArbiterSummaryCardProps) {
  const chainNow = useArbiterChainNow(isOpen, snapshot?.observedAt);

  useCloseOnEscape(isOpen, onClose);

  if (!isOpen) return null;

  const round = snapshot?.round ?? null;
  const phase = snapshot?.phase ?? 'none';
  const phaseDeadline = round ? arbiterDeadline(phase, round) : null;
  const isCurrentController = Boolean(
    viewerAddress &&
      snapshot?.controller &&
      addressesMatch(viewerAddress, snapshot.controller.address)
  );
  const arbiterSearch = new URLSearchParams();
  if (previewMode && previewMode !== 'live') {
    arbiterSearch.set('arbiterMock', previewMode);
  }
  arbiterSearch.set('tracking', 'arbiter');
  const arbiterHref = {
    pathname: '/arbiter',
    search: `?${arbiterSearch.toString()}`,
  };

  return (
    <aside
      role="dialog"
      aria-labelledby="arbiter-summary-title"
      data-arbiter-console
      className="pointer-events-auto absolute left-3 right-3 top-20 z-[80] border border-neutral-500 bg-black/90 font-mono text-xs text-fg shadow-[8px_8px_0_rgba(255,255,255,0.08)] backdrop-blur-md sm:left-auto sm:right-4 sm:w-[21rem]"
    >
      <header className="flex items-center justify-between border-b border-neutral-600 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-[8px] tracking-[0.22em] text-dim">
            <span className="h-1.5 w-1.5 bg-white" aria-hidden="true" />
            ARBITER // {arbiterPhaseLabel(phase)}
          </div>
          <h2
            id="arbiter-summary-title"
            className="mt-1 text-sm tracking-[0.12em] text-white"
          >
            GLOBAL CONTROL
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="border border-grid px-2 py-1 text-[10px] text-dim transition-colors hover:border-neutral-500 hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
          aria-label="Stop tracking the Arbiter"
        >
          ESC
        </button>
      </header>

      <div className="space-y-3 px-4 py-4">
        {error ? (
          <section className="border-l-2 border-neutral-400 bg-white/[0.04] px-3 py-3">
            <div className="text-[9px] tracking-[0.2em] text-neutral-500">
              UPLINK INTERRUPTED
            </div>
            <p className="mt-2 leading-5 text-neutral-300">
              {snapshot ? 'Showing the last verified state.' : error}
            </p>
            <button
              type="button"
              onClick={onRefresh}
              className="mt-3 border border-neutral-600 px-3 py-2 text-[9px] tracking-[0.16em] text-white hover:border-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              RETRY UPLINK
            </button>
          </section>
        ) : null}

        {isLoading && !snapshot ? (
          <p className="py-4 text-center text-[9px] tracking-[0.2em] text-neutral-400">
            VERIFYING ARBITER STATE…
          </p>
        ) : null}

        {!isLoading && !snapshot && !error ? (
          <p className="py-3 text-neutral-400">
            No Arbiter telemetry is available.
          </p>
        ) : null}

        {snapshot && !round ? (
          <section className="border-l-2 border-neutral-500 pl-3">
            <div className="text-[9px] tracking-[0.2em] text-neutral-500">
              NO AUCTION SCHEDULED
            </div>
            <p className="mt-2 leading-5 text-neutral-300">
              The projection surface is available. No sealed-bid round is
              active.
            </p>
          </section>
        ) : null}

        {snapshot && round ? (
          <section className="border border-neutral-700 bg-white/[0.025] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[8px] tracking-[0.22em] text-neutral-500">
                  ROUND // {String(round.id).padStart(4, '0')}
                </div>
                <div className="mt-1 text-sm tracking-[0.1em] text-white">
                  {arbiterPhaseLabel(phase)}
                </div>
              </div>
              <span className="border border-neutral-700 px-2 py-1 text-[8px] tracking-[0.14em] text-neutral-400">
                {previewMode && previewMode !== 'live' ? 'MOCK' : 'VERIFIED'}
              </span>
            </div>
            {phaseDeadline ? (
              <div className="mt-3 border-t border-grid pt-3">
                <div className="text-[8px] tracking-[0.18em] text-neutral-500">
                  {phaseDeadline.label}
                </div>
                <div className="mt-1 text-xl tabular-nums tracking-[0.1em] text-white">
                  {arbiterCountdown(phaseDeadline.at, chainNow)}
                </div>
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-4 border-t border-grid pt-3">
              <MetricText
                label="RESERVE"
                value={formatArbiterAmount(round.reservePrice)}
              />
              <MetricText
                label="FUNDED"
                value={`${round.fundedTrancheCount} / ${round.maxBids}`}
              />
            </div>
          </section>
        ) : null}

        {snapshot?.controller ? (
          <section className="border-l-2 border-white bg-white/[0.04] px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[8px] tracking-[0.2em] text-neutral-500">
                CURRENT CONTROLLER
              </div>
              {isCurrentController ? (
                <span className="bg-white px-2 py-0.5 text-[8px] tracking-[0.16em] text-black">
                  YOU
                </span>
              ) : null}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <MetricText
                label="ADDRESS"
                value={shortAddress(snapshot.controller.address)}
              />
              <MetricText
                label="CONTROL WINDOW"
                value={
                  snapshot.controller.expiresAt
                    ? arbiterCountdown(snapshot.controller.expiresAt, chainNow)
                    : 'OPEN'
                }
              />
            </div>
            {isCurrentController ? <UploadImagePlaceholder /> : null}
          </section>
        ) : null}
      </div>

      <Link
        to={arbiterHref}
        className="flex items-center justify-between border-t border-neutral-600 px-4 py-3 text-[9px] tracking-[0.18em] text-white transition-colors hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-white"
      >
        <span>OPEN FULL AUCTION UI</span>
        <span aria-hidden="true">→</span>
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
  previewMode,
  onPreviewModeChange,
  presentation = 'hud',
  viewerAddress,
  title = 'THE ARBITER',
}: ArbiterConsoleProps) {
  const chainNow = useArbiterChainNow(isOpen, snapshot?.observedAt);

  useCloseOnEscape(isOpen && presentation === 'hud', onClose);

  if (!isOpen) return null;

  const round = snapshot?.round ?? null;
  const phase = snapshot?.phase ?? 'none';
  const phaseDeadline = round ? arbiterDeadline(phase, round) : null;
  const isMockPreview = previewMode !== undefined && previewMode !== 'live';
  const isCurrentController = Boolean(
    viewerAddress &&
      snapshot?.controller &&
      addressesMatch(viewerAddress, snapshot.controller.address)
  );
  const isPage = presentation === 'page';
  const Container = isPage ? 'section' : 'aside';

  return (
    <Container
      role={isPage ? 'region' : 'dialog'}
      aria-labelledby="arbiter-title"
      data-arbiter-console
      className={
        isPage
          ? 'activity-scrollbar relative w-full border border-neutral-500 bg-black/70 font-mono text-xs text-fg shadow-[10px_10px_0_rgba(255,255,255,0.06)]'
          : 'activity-scrollbar pointer-events-auto absolute left-3 right-3 top-20 z-[80] max-h-[calc(100%-6rem)] overflow-y-auto border border-neutral-500 bg-black/90 font-mono text-xs text-fg shadow-[8px_8px_0_rgba(255,255,255,0.08)] backdrop-blur-md sm:left-auto sm:right-4 sm:w-[23rem]'
      }
    >
      <header
        className={`z-10 flex items-center justify-between border-b border-neutral-600 bg-black/95 px-4 py-3 backdrop-blur-md ${
          isPage ? '' : 'sticky top-0'
        }`}
      >
        <div>
          <div className="flex items-center gap-2 text-[9px] tracking-[0.24em] text-dim">
            <span className="h-1.5 w-1.5 bg-white" aria-hidden="true" />
            ORBITAL UPLINK // {arbiterPhaseLabel(phase)}
          </div>
          <h2
            id="arbiter-title"
            className="mt-1 text-base tracking-[0.12em] text-white"
          >
            {title}
          </h2>
        </div>
        {isPage ? (
          <span className="border border-neutral-600 px-2 py-1 text-[9px] tracking-[0.14em] text-neutral-400">
            PUBLIC UPLINK
          </span>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="border border-grid px-2 py-1 text-[10px] text-dim transition-colors hover:border-neutral-500 hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label="Stop tracking the Arbiter"
          >
            ESC
          </button>
        )}
      </header>

      {previewMode && onPreviewModeChange ? (
        <nav
          aria-label="Arbiter preview scenario"
          className="flex items-center justify-between gap-3 border-b border-neutral-700 bg-white/[0.025] px-4 py-2"
        >
          <span className="text-[8px] tracking-[0.2em] text-neutral-600">
            LOCAL SIGNAL
          </span>
          <div className="flex border border-neutral-700 p-0.5">
            {(
              [
                ['LIVE', 'live'],
                ['AUCTION', 'bidding'],
                ['WINNER', 'winner'],
              ] as const
            ).map(([label, mode]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={previewMode === mode}
                onClick={() => onPreviewModeChange(mode)}
                className={`px-2 py-1 text-[8px] tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white ${
                  previewMode === mode
                    ? 'bg-white text-black'
                    : 'text-neutral-600 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>
      ) : null}

      <div className="space-y-4 px-4 py-4">
        {error ? (
          <section className="border-l-2 border-neutral-400 bg-white/[0.04] px-3 py-3">
            <div className="text-[9px] tracking-[0.24em] text-neutral-500">
              UPLINK INTERRUPTED
            </div>
            <p className="mt-2 leading-5 text-neutral-300">
              {snapshot
                ? 'Displaying the last verified state while the canonical feed reconnects.'
                : 'The canonical round could not be verified. The Arbiter card remains in safe mode.'}
            </p>
            <button
              type="button"
              onClick={onRefresh}
              className="mt-3 border border-neutral-600 px-3 py-2 text-[10px] tracking-[0.16em] text-white transition-colors hover:border-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              RETRY UPLINK
            </button>
          </section>
        ) : null}

        {isLoading && !snapshot ? (
          <section className="py-8 text-center">
            <div className="mx-auto h-px w-16 animate-pulse bg-white motion-reduce:animate-none" />
            <p className="mt-4 text-[10px] tracking-[0.2em] text-neutral-400">
              VERIFYING CANONICAL ROUND
            </p>
          </section>
        ) : null}

        {!isLoading && !snapshot && !error ? (
          <p className="py-6 text-center text-neutral-400">
            No Arbiter telemetry is available.
          </p>
        ) : null}

        {snapshot && !round ? (
          <section className="space-y-4">
            <div className="flex items-start gap-4 border-b border-grid pb-4">
              <ArbiterGlyph />
              <div>
                <div className="text-[9px] tracking-[0.24em] text-neutral-500">
                  SIGNAL AVAILABLE // NO AUCTION
                </div>
                <p
                  id="arbiter-description"
                  className="mt-2 text-xs leading-5 text-neutral-300"
                >
                  The projection surface is online. A verified sealed-bid round
                  has not been scheduled for this network.
                </p>
              </div>
            </div>
            <SignalNotice>
              The Arbiter reveals no bidder identities or bid amounts while a
              round is active. Only public contract counters appear here.
            </SignalNotice>
          </section>
        ) : null}

        {snapshot && round ? (
          <>
            <section className="relative overflow-hidden border border-neutral-700 bg-white/[0.025] p-3">
              <div className="absolute left-0 top-0 h-3 w-3 border-l border-t border-white" />
              <div className="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-white" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[9px] tracking-[0.24em] text-neutral-500">
                    ROUND // {String(round.id).padStart(4, '0')}
                  </div>
                  <div className="mt-1 text-sm tracking-[0.12em] text-white">
                    {arbiterPhaseLabel(phase)}
                  </div>
                </div>
                <span className="border border-neutral-600 px-2 py-1 text-[9px] tracking-[0.14em] text-neutral-300">
                  {isMockPreview ? 'MOCK' : 'VERIFIED'}
                </span>
              </div>

              {phaseDeadline ? (
                <div className="mt-5 border-t border-grid pt-3">
                  <div className="text-[9px] tracking-[0.2em] text-neutral-500">
                    {phaseDeadline.label} // CHAIN TIME
                  </div>
                  <div className="mt-1 text-2xl tracking-[0.12em] text-white">
                    {arbiterCountdown(phaseDeadline.at, chainNow)}
                  </div>
                </div>
              ) : null}
            </section>

            {snapshot.billboard ? (
              <section className="border border-neutral-700 bg-white/[0.025] p-2">
                <img
                  src={snapshot.billboard.thumbnailUrl}
                  alt="Current Arbiter transmission"
                  className="aspect-video w-full border border-grid object-cover"
                />
                <div className="mt-2 text-[9px] tracking-[0.2em] text-neutral-500">
                  ACTIVE TRANSMISSION // MODERATION APPROVED
                </div>
              </section>
            ) : null}

            {snapshot.controller ? (
              <section className="border-l-2 border-white bg-white/[0.04] px-3 py-3">
                <div className="text-[9px] tracking-[0.24em] text-neutral-500">
                  CURRENT BILLBOARD CONTROL
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <MetricText
                    label="CURRENT WINNER"
                    value={shortAddress(snapshot.controller.address)}
                  />
                  <MetricText
                    label="CONTROL WINDOW"
                    value={
                      snapshot.controller.expiresAt
                        ? arbiterCountdown(
                            snapshot.controller.expiresAt,
                            chainNow
                          )
                        : 'OPEN'
                    }
                  />
                </div>
                {isCurrentController ? <UploadImagePlaceholder /> : null}
              </section>
            ) : null}

            <section className="grid grid-cols-2 border-l border-t border-grid">
              <Metric
                label="RESERVE"
                value={formatArbiterAmount(round.reservePrice)}
              />
              <Metric
                label="PAYMENT TOKEN"
                value={shortAddress(round.paymentToken)}
              />
              <Metric
                label="FUNDED TRANCHES"
                value={`${round.fundedTrancheCount} / ${round.maxBids}`}
              />
              <Metric
                label="SUBMISSIONS"
                value={String(round.submissionCount)}
              />
            </section>

            {phase === 'bidding' || phase === 'acceptance' ? (
              <SignalNotice>
                Bid values remain sealed from the public and other bidders. The
                vault operator can inspect accepted deposits and controls the
                refund path required for settlement.
              </SignalNotice>
            ) : null}

            {phase === 'settling' ? (
              <SignalNotice>
                Bidding and normal acceptance are closed. The vault operator is
                assembling the public settlement roots.
              </SignalNotice>
            ) : null}

            {phase === 'recovery' ? (
              <SignalNotice>
                The settlement deadline has passed. Contract recovery is now
                available; the round remains read-only here until chain state
                changes.
              </SignalNotice>
            ) : null}

            {phase === 'aborted' ? (
              <SignalNotice>
                This round was aborted without transferring billboard control.
                The projection surface remains on its safe transmission.
              </SignalNotice>
            ) : null}

            {phase === 'settled' && round.result ? (
              <section className="space-y-3 border-l-2 border-white bg-white/[0.04] px-3 py-3">
                <div className="text-[9px] tracking-[0.24em] text-neutral-500">
                  {round.result.hasWinner
                    ? snapshot.controller
                      ? 'CONTROL CLAIMED'
                      : 'WINNER VERIFIED // CLAIM PENDING'
                    : 'NO QUALIFYING BID'}
                </div>
                {round.result.hasWinner ? (
                  <>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <MetricText
                        label="CLEARING PRICE"
                        value={formatArbiterAmount(round.result.clearingPrice)}
                      />
                      <MetricText
                        label="WINNING BID"
                        value={formatArbiterAmount(round.result.winningBid)}
                      />
                      <MetricText
                        label="SECOND BID"
                        value={formatArbiterAmount(
                          round.result.secondHighestBid
                        )}
                      />
                      <MetricText
                        label="COMMITMENT"
                        value={shortAddress(round.result.winnerCommitment)}
                      />
                    </div>
                  </>
                ) : (
                  <p className="leading-5 text-neutral-300">
                    The reserve was not cleared. No billboard control window was
                    created.
                  </p>
                )}
              </section>
            ) : null}

            <details className="border border-grid px-3 py-2 text-[10px] text-neutral-400">
              <summary className="cursor-pointer tracking-[0.16em] text-neutral-300">
                CANONICAL ROUND DETAILS
              </summary>
              <dl className="mt-3 space-y-2 break-all">
                <Detail label="NETWORK" value={snapshot.network} />
                <Detail label="WHISPER" value={round.whisperAddress} />
                <Detail label="AUCTION" value={String(round.auctionId)} />
                <Detail label="CHAIN OBSERVED" value={snapshot.observedAt} />
              </dl>
            </details>
          </>
        ) : null}
      </div>

      <footer
        className={`bottom-0 border-t border-neutral-700 bg-black/95 px-4 py-2 text-[9px] tracking-[0.2em] text-neutral-500 backdrop-blur-md ${
          isPage ? '' : 'sticky'
        }`}
      >
        {isMockPreview
          ? 'LOCAL PREVIEW // NO TRANSACTIONS'
          : 'READ-ONLY UPLINK // PHASE A'}
      </footer>
    </Container>
  );
}

function UploadImagePlaceholder() {
  return (
    <div className="mt-3 border-t border-neutral-700 pt-3">
      <div className="text-[8px] tracking-[0.2em] text-neutral-500">
        YOUR CONTROL WINDOW
      </div>
      <button
        type="button"
        disabled
        className="mt-2 w-full cursor-not-allowed border border-neutral-700 px-3 py-2 text-[9px] tracking-[0.16em] text-neutral-500"
        title="Image uploads are planned for the next integration phase"
      >
        UPLOAD IMAGE // COMING NEXT
      </button>
    </div>
  );
}

function useCloseOnEscape(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);
}

function useArbiterChainNow(isOpen: boolean, observedAt?: string) {
  const [elapsedSinceObservation, setElapsedSinceObservation] = useState(0);

  useEffect(() => {
    if (!isOpen || !observedAt) return;
    const startedAt = performance.now();
    setElapsedSinceObservation(0);
    const timer = window.setInterval(() => {
      setElapsedSinceObservation(performance.now() - startedAt);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [isOpen, observedAt]);

  const observedTimestamp = observedAt ? Date.parse(observedAt) : Number.NaN;
  return Number.isFinite(observedTimestamp)
    ? observedTimestamp + elapsedSinceObservation
    : Number.NaN;
}

function ArbiterGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 72 72"
      className="h-12 w-12 shrink-0 text-neutral-400"
      fill="none"
      stroke="currentColor"
    >
      <path d="M36 6 65 55 36 66 7 55 36 6Z" />
      <path d="m7 55 29-17 29 17M36 6v32m0 0v28" />
    </svg>
  );
}

function SignalNotice({ children }: { children: ReactNode }) {
  return (
    <section className="border-l-2 border-neutral-400 bg-white/[0.04] px-3 py-3">
      <div className="text-[9px] tracking-[0.24em] text-neutral-500">
        PUBLIC SIGNAL POLICY
      </div>
      <p className="mt-2 text-xs leading-5 text-neutral-300">{children}</p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-r border-grid px-3 py-3">
      <MetricText label={label} value={value} />
    </div>
  );
}

function MetricText({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] tracking-[0.18em] text-neutral-500">
        {label}
      </div>
      <div className="mt-1 truncate text-[11px] text-white" title={value}>
        {value}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[8px] tracking-[0.16em] text-neutral-600">{label}</dt>
      <dd className="mt-0.5 text-neutral-300">{value}</dd>
    </div>
  );
}
