import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  ArbiterPhase,
  ArbiterRound,
  ArbiterSnapshot,
} from '../../services/api';
import type { ArbiterPreviewMode } from '../../services/arbiterMock';
import { useArbiterPreview } from '../../contexts/useArbiterPreview';
import { useWallet } from '../../contexts/WalletContext';
import {
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
  onPlaceBid?: () => void;
  previewMode?: ArbiterPreviewMode;
  onPreviewModeChange?: (mode: ArbiterPreviewMode) => void;
  presentation?: 'hud' | 'page';
  viewerAddress?: string | null;
  title?: string;
}

interface ArbiterSummaryCardProps extends ArbiterModalProps {
  snapshot: ArbiterSnapshot | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  previewMode?: ArbiterPreviewMode;
  viewerAddress?: string | null;
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
  const deadline = round ? arbiterDeadline(phase, round) : null;
  const isCurrentController = Boolean(
    viewerAddress &&
      snapshot?.controller &&
      addressesMatch(viewerAddress, snapshot.controller.address)
  );
  const search = new URLSearchParams();
  if (previewMode && previewMode !== 'live') {
    search.set('arbiterMock', previewMode);
  }
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
                {previewMode && previewMode !== 'live' ? 'MOCK' : 'VERIFIED'}
              </span>
            </div>
            {phase === 'pending' ? (
              <p className="mt-2 text-[10px] leading-4 text-neutral-400">
                First sealed bid starts three days.
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
  previewMode,
  onPreviewModeChange,
  presentation = 'hud',
  viewerAddress,
  title = 'THE ARBITER',
}: ArbiterConsoleProps) {
  const chainNow = useArbiterChainNow(isOpen, snapshot?.observedAt);
  useCloseOnEscape(isOpen && presentation === 'hud', onClose);
  if (!isOpen) return null;

  const phase = snapshot?.phase ?? 'none';
  const round = snapshot?.round ?? null;
  const isPage = presentation === 'page';
  const isMock = previewMode !== undefined && previewMode !== 'live';
  const isCurrentController = Boolean(
    viewerAddress &&
      snapshot?.controller &&
      addressesMatch(viewerAddress, snapshot.controller.address)
  );
  const Container = isPage ? 'section' : 'aside';

  return (
    <Container
      role={isPage ? 'region' : 'dialog'}
      aria-labelledby="arbiter-title"
      data-arbiter-console
      className={
        isPage
          ? 'relative w-full overflow-hidden border border-grid bg-black/85 font-mono text-fg shadow-[14px_14px_0_rgba(255,255,255,0.06)]'
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

      {previewMode && onPreviewModeChange ? (
        <PreviewControls current={previewMode} onChange={onPreviewModeChange} />
      ) : null}

      {error ? (
        <div className="px-4 pt-4 sm:px-6">
          <ErrorNotice hasSnapshot={Boolean(snapshot)} onRefresh={onRefresh} />
        </div>
      ) : null}

      {isLoading && !snapshot ? (
        <div className="grid min-h-[28rem] place-items-center">
          <div className="text-center">
            <div className="mx-auto h-px w-20 animate-pulse bg-fg motion-reduce:animate-none" />
            <p className="mt-4 text-[9px] tracking-[0.22em] text-neutral-500">
              VERIFYING ARBITER
            </p>
          </div>
        </div>
      ) : null}

      {snapshot && round ? (
        <>
          <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
            <CurrentControlPanel
              snapshot={snapshot}
              isCurrentController={isCurrentController}
            />
            <AuctionPanel
              phase={phase}
              round={round}
              chainNow={chainNow}
              onPlaceBid={onPlaceBid}
            />
          </div>

          <PhaseRail phase={phase} />

          <AuctionDetails snapshot={snapshot} round={round} isMock={isMock} />
        </>
      ) : null}

      {snapshot && !round ? (
        <div className="grid min-h-[28rem] place-items-center px-6 text-center">
          <div className="max-w-sm">
            <ArbiterGlyph className="mx-auto h-20 w-20 text-fg" />
            <h3 className="mt-6 text-2xl font-bold tracking-[-0.05em]">
              No auction registered
            </h3>
            <p className="mt-3 text-xs leading-5 text-neutral-400">
              The current signal remains unchanged until the next round is
              available.
            </p>
          </div>
        </div>
      ) : null}

      {!isLoading && !snapshot && !error ? (
        <div className="grid min-h-[24rem] place-items-center text-xs text-neutral-500">
          No Arbiter state is available.
        </div>
      ) : null}

      <footer className="flex items-center justify-between border-t border-grid px-4 py-3 text-[8px] tracking-[0.18em] text-dim sm:px-6">
        <span>{isMock ? 'LOCAL PREVIEW' : 'VERIFIED ONCHAIN'}</span>
        <span>SEALED VICKREY AUCTION</span>
      </footer>
    </Container>
  );
}

function CurrentControlPanel({
  snapshot,
  isCurrentController,
}: {
  snapshot: ArbiterSnapshot;
  isCurrentController: boolean;
}) {
  return (
    <section className="relative min-h-[17rem] overflow-hidden border-b border-grid sm:min-h-[27rem] lg:border-b-0 lg:border-r">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.09),transparent_42%)]" />
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:64px_64px]" />

      {snapshot.billboard ? (
        <img
          src={snapshot.billboard.imageUrl}
          alt="Current Arbiter signal"
          className="absolute inset-0 h-full w-full object-cover opacity-70 mix-blend-screen"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <ArbiterGlyph className="h-28 w-28 text-fg/80 sm:h-44 sm:w-44" />
        </div>
      )}

      <div className="relative flex min-h-[17rem] flex-col justify-between p-5 sm:min-h-[27rem] sm:p-7">
        <div className="flex items-center justify-between text-[8px] tracking-[0.2em]">
          <span className="text-fg">CURRENT SIGNAL</span>
          <span className="text-neutral-500">LIVE</span>
        </div>

        <div className="max-w-md border-l border-fg bg-black/80 px-4 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-[8px] tracking-[0.2em] text-neutral-500">
            CURRENT CONTROLLER
            {isCurrentController ? (
              <span className="bg-fg px-2 py-0.5 text-bg">YOU</span>
            ) : null}
          </div>
          <div className="mt-2 text-2xl font-bold tracking-[-0.05em] sm:text-3xl">
            {snapshot.controller
              ? shortAddress(snapshot.controller.address)
              : 'UNCLAIMED'}
          </div>
          <div className="mt-2 text-[9px] tracking-[0.14em] text-fg">
            CONTROL CONTINUES UNTIL THE NEXT WINNER
          </div>
          {isCurrentController ? <ProjectionPlaceholder /> : null}
        </div>
      </div>
    </section>
  );
}

function AuctionPanel({
  phase,
  round,
  chainNow,
  onPlaceBid,
}: {
  phase: ArbiterPhase;
  round: ArbiterRound;
  chainNow: number;
  onPlaceBid?: () => void;
}) {
  const state = auctionState(phase, round);
  const canBid = phase === 'pending' || phase === 'bidding';

  return (
    <section className="flex min-h-[27rem] flex-col justify-between bg-black p-5 sm:p-7">
      <div className="flex items-center justify-between text-[8px] tracking-[0.2em]">
        <span className="text-fg">NEXT CONTROL</span>
        <span className="text-neutral-500">
          ROUND {String(round.id).padStart(4, '0')}
        </span>
      </div>

      <AuctionOrbit phase={phase} round={round} chainNow={chainNow} />

      <div>
        <h3 className="text-2xl font-bold tracking-[-0.05em] sm:text-3xl">
          {state.title}
        </h3>
        <p className="mt-2 max-w-sm text-xs leading-5 text-neutral-400">
          {state.body}
        </p>
        {canBid ? (
          <button
            type="button"
            onClick={onPlaceBid}
            disabled={!onPlaceBid}
            title={
              onPlaceBid
                ? 'Place a sealed bid'
                : 'Private wallet bidding is not connected yet'
            }
            className="mt-5 w-full border border-fg bg-fg px-4 py-3 text-[10px] font-bold tracking-[0.18em] text-bg transition-colors enabled:hover:bg-transparent enabled:hover:text-fg disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-transparent disabled:text-dim focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg"
          >
            PLACE SEALED BID
          </button>
        ) : null}
      </div>
    </section>
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

function PhaseRail({ phase }: { phase: ArbiterPhase }) {
  const active = phaseRailIndex(phase);
  const labels = ['WAITING', '3 DAY AUCTION', 'RESOLVING', 'CONTROL'];

  return (
    <ol className="grid grid-cols-4 border-t border-grid bg-black">
      {labels.map((label, index) => (
        <li
          key={label}
          aria-current={index === active ? 'step' : undefined}
          className={`border-r border-grid px-2 py-3 text-center text-[7px] tracking-[0.12em] last:border-r-0 sm:px-4 sm:text-[8px] sm:tracking-[0.18em] ${
            index === active
              ? 'bg-fg text-bg'
              : index < active
                ? 'text-neutral-300'
                : 'text-neutral-600'
          }`}
        >
          {label}
        </li>
      ))}
    </ol>
  );
}

function AuctionDetails({
  snapshot,
  round,
  isMock,
}: {
  snapshot: ArbiterSnapshot;
  round: ArbiterRound;
  isMock: boolean;
}) {
  return (
    <details className="group border-t border-grid bg-black">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-[9px] tracking-[0.18em] text-neutral-400 transition-colors hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-fg sm:px-6 [&::-webkit-details-marker]:hidden">
        <span>AUCTION DETAILS</span>
        <span className="text-fg group-open:rotate-45">＋</span>
      </summary>
      <div className="grid gap-px border-t border-grid bg-grid sm:grid-cols-2 lg:grid-cols-4">
        <DetailCell
          label="RESERVE"
          value={formatArbiterAmount(round.reservePrice)}
        />
        <DetailCell
          label="ACCEPTED BIDS"
          value={`${round.fundedTrancheCount} / ${round.maxBids}`}
        />
        <DetailCell
          label="BIDDING WINDOW"
          value={formatDuration(round.schedule.biddingDurationSeconds)}
        />
        <DetailCell
          label="STATUS"
          value={isMock ? 'LOCAL PREVIEW' : 'ONCHAIN VERIFIED'}
        />
      </div>
      {round.result?.hasWinner ? (
        <div className="grid gap-px border-t border-grid bg-grid sm:grid-cols-2">
          <DetailCell
            label="CLEARING PRICE"
            value={formatArbiterAmount(round.result.clearingPrice)}
          />
          <DetailCell
            label="WINNER COMMITMENT"
            value={shortAddress(round.result.winnerCommitment)}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2 border-t border-grid px-4 py-4 text-[9px] leading-4 text-neutral-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>Bids stay sealed until settlement.</span>
        <span>
          {snapshot.network} // AUCTION {round.auctionId} //{' '}
          {shortAddress(round.whisperAddress)}
        </span>
      </div>
    </details>
  );
}

function PreviewControls({
  current,
  onChange,
}: {
  current: ArbiterPreviewMode;
  onChange: (mode: ArbiterPreviewMode) => void;
}) {
  const options: Array<[string, ArbiterPreviewMode]> = [
    ['LIVE', 'live'],
    ['WAITING', 'pending'],
    ['BIDDING', 'bidding'],
    ['RESOLVING', 'resolving'],
    ['WINNER', 'winner'],
  ];
  return (
    <nav
      aria-label="Arbiter preview scenario"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-grid bg-black px-4 py-2 sm:px-6"
    >
      <span className="text-[8px] tracking-[0.18em] text-neutral-600">
        LOCAL SIGNAL
      </span>
      <div className="flex flex-wrap justify-end gap-1">
        {options.map(([label, mode]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={current === mode}
            onClick={() => onChange(mode)}
            className={`px-2 py-1 text-[7px] tracking-[0.12em] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-fg sm:text-[8px] ${
              current === mode ? 'bg-fg text-bg' : 'text-dim hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
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
          ? 'Showing the last verified state.'
          : 'State unavailable.'}
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

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-black px-4 py-4 sm:px-6">
      <div className="text-[8px] tracking-[0.16em] text-neutral-600">
        {label}
      </div>
      <div className="mt-2 truncate text-xs text-neutral-200" title={value}>
        {value}
      </div>
    </div>
  );
}

function ArbiterGlyph({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 72 72"
      className={className}
      fill="none"
      stroke="currentColor"
    >
      <path d="M36 6 65 55 36 66 7 55 36 6Z" />
      <path d="m7 55 29-17 29 17M36 6v32m0 0v28" />
    </svg>
  );
}

function auctionState(phase: ArbiterPhase, round: ArbiterRound) {
  switch (phase) {
    case 'pending':
      return {
        title: 'Start the clock',
        body: 'The first sealed bid opens a three-day auction.',
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

function phaseRailIndex(phase: ArbiterPhase) {
  if (phase === 'pending') return 0;
  if (phase === 'bidding') return 1;
  if (phase === 'acceptance' || phase === 'settling' || phase === 'recovery') {
    return 2;
  }
  if (phase === 'settled' || phase === 'aborted') return 3;
  return 0;
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
