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
import { api, type PreparedBeaconImage } from '../../services/api';
import { useBeacon } from '../../contexts/useBeacon';
import { useWallet } from '../../contexts/WalletContext';
import { useClipboardImagePaste } from '../../hooks/useClipboardImagePaste';
import { prepareBeaconImage } from '../../utils/beaconImage';
import {
  beaconDeadline,
  beaconPhaseLabel,
  formatBeaconAmount,
} from '../../utils/beacon';
import { addressesMatch, formatStrk, parseStrk } from '../../utils/format';
import { shareableGameViewSearch } from '../../utils/gameViewSearch';
import {
  Badge,
  Button,
  buttonStyles,
  Callout,
  colors,
  Eyebrow,
  fieldStyles,
  panelStyles,
  SectionHeading,
  Stat,
  StatGrid,
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../../ui';
import { AddressLink } from './AddressLink';
import { normalizeBeaconDestination } from '../../utils/beaconDestination';

interface BeaconModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BeaconConsoleProps extends BeaconModalProps {
  snapshot: BeaconSnapshot | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onPlaceBid?: (amount: string) => Promise<void>;
  onSettle?: () => Promise<void>;
  viewerAddress?: string | null;
  bidStatusLabel?: string;
  presentation?: 'hud' | 'page';
  title?: string;
  view?: 'auction' | 'history';
  history?: BeaconHistoryEntry[];
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
  const currentControllerHasPublished = Boolean(
    snapshot?.controller?.hasPublished
  );

  useEffect(() => {
    if (!isOpen || !isCurrentController || currentControllerHasPublished) {
      setProjectionFile(null);
    }
  }, [currentControllerHasPublished, isCurrentController, isOpen]);

  useClipboardImagePaste(
    isOpen &&
      isCurrentController &&
      Boolean(viewerAddress) &&
      !currentControllerHasPublished &&
      !projectionFile,
    setProjectionFile
  );

  if (!isOpen) return null;

  const search = shareableGameViewSearch(new URLSearchParams(location.search));
  search.set('tracking', 'beacon');

  return (
    <aside
      role="dialog"
      aria-labelledby="beacon-summary-title"
      data-beacon-console
      className={panelStyles(
        'floating',
        'activity-scrollbar pointer-events-auto absolute left-3 right-3 top-20 z-[80] max-h-[calc(100vh-6.5rem)] overflow-y-auto font-mono text-caption text-fg sm:left-auto sm:right-4 sm:w-[24rem]'
      )}
    >
      <header className="border-b border-line px-4 py-3">
        <SectionHeading
          id="beacon-summary-title"
          eyebrow={<Eyebrow dot>BEACON</Eyebrow>}
          title={snapshot?.billboard ? 'TRANSMISSION' : 'THE BEACON'}
          className="flex-nowrap items-center gap-3"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="shrink-0"
            aria-label="Close Beacon status"
          >
            CLOSE
          </Button>
        </SectionHeading>
      </header>

      <div className="space-y-4 px-4 py-4">
        {error ? (
          <ErrorNotice hasSnapshot={Boolean(snapshot)} onRefresh={onRefresh} />
        ) : null}

        {isLoading && !snapshot ? (
          <p className="py-5 text-center text-label text-fg-subtle">
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
                value={<AddressLink address={snapshot.controller.address} />}
              />
              {isCurrentController ? <Badge variant="solid">YOU</Badge> : null}
            </div>
          </section>
        ) : null}

        {snapshot && !snapshot.controller ? (
          <Callout>No controller has been assigned.</Callout>
        ) : null}

        {!isLoading && !snapshot && !error ? (
          <p className="py-3 text-fg-muted">No Beacon state is available.</p>
        ) : null}

        {isCurrentController &&
        viewerAddress &&
        !currentControllerHasPublished ? (
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
      </div>

      <Link
        to={{ pathname: '/beacon', search: `?${search.toString()}` }}
        className="flex items-center justify-between border-t border-line px-4 py-3 text-label transition-colors hover:bg-fg hover:text-surface focus-visible:outline-offset-[-3px]"
      >
        <span>BID FOR BEACON CONTROL</span>
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
  onSettle,
  viewerAddress,
  bidStatusLabel,
  presentation = 'hud',
  title = 'THE BEACON',
  view = 'auction',
  history = [],
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
          ? panelStyles(
              'default',
              'relative w-full overflow-hidden bg-surface/85 font-mono text-fg'
            )
          : panelStyles(
              'floating',
              'activity-scrollbar pointer-events-auto absolute left-3 right-3 top-20 z-[80] max-h-[calc(100%-6rem)] overflow-y-auto font-mono text-fg sm:left-auto sm:right-4 sm:w-[28rem]'
            )
      }
    >
      <header className="border-b border-line px-4 py-3 sm:px-6">
        <SectionHeading
          id="beacon-title"
          eyebrow={`CONTROL SIGNAL // ${beaconPhaseLabel(phase)}`}
          title={title}
          className="items-center gap-3"
        >
          {isPage && view === 'auction' && round ? (
            <div
              className="flex items-center gap-3 border-l border-line pl-4 sm:gap-4 sm:pl-6"
              aria-label={`Round ${round.id}`}
            >
              <span className="text-label text-fg-subtle">CURRENT ROUND</span>
              <span className="text-figure-sm font-bold tabular-nums text-fg sm:text-figure">
                {String(round.id).padStart(4, '0')}
              </span>
            </div>
          ) : !isPage ? (
            <Button variant="ghost" size="sm" onClick={onClose}>
              CLOSE
            </Button>
          ) : null}
        </SectionHeading>
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
            <p className="mt-4 text-label text-fg-subtle">VERIFYING BEACON</p>
          </div>
        </div>
      ) : null}

      {view === 'auction' && snapshot && round ? (
        <AuctionPanel
          phase={phase}
          round={round}
          chainNow={chainNow}
          onPlaceBid={onPlaceBid}
          onSettle={onSettle}
          viewerAddress={viewerAddress}
          bidStatusLabel={bidStatusLabel}
        />
      ) : null}

      {view === 'history' && !isLoading ? (
        <HistoryPanel entries={history} />
      ) : null}

      {view === 'auction' && snapshot && !round ? (
        <div className="grid min-h-[28rem] place-items-center px-6 text-center">
          <div className="max-w-sm">
            <h3 className="text-title font-bold">No auction registered</h3>
            <p className="mt-3 text-caption text-fg-muted">
              The current signal remains unchanged until the next round is
              available.
            </p>
          </div>
        </div>
      ) : null}

      {view === 'auction' && !isLoading && !snapshot && !error ? (
        <div className="grid min-h-[24rem] place-items-center text-caption text-fg-subtle">
          No Beacon state is available.
        </div>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line px-4 py-3 text-tag text-fg-subtle sm:px-6">
        <span>VERIFIED ONCHAIN</span>
        <span>OPEN ASCENDING AUCTION</span>
      </footer>
    </Container>
  );
}

function AuctionPanel({
  phase,
  round,
  chainNow,
  onPlaceBid,
  onSettle,
  viewerAddress,
  bidStatusLabel,
}: {
  phase: BeaconPhase;
  round: BeaconRound;
  chainNow: number;
  onPlaceBid?: (amount: string) => Promise<void>;
  onSettle?: () => Promise<void>;
  viewerAddress?: string | null;
  bidStatusLabel?: string;
}) {
  const minimumBid = strkInputValue(round.minimumBid);
  const [bidAmount, setBidAmount] = useState(minimumBid);
  const [isSubmitting, setSubmitting] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const submissionInFlight = useRef(false);
  const edited = useRef(false);
  const state = auctionState(phase, round);
  const canBid = phase === 'pending' || phase === 'bidding';
  const isLeader = Boolean(
    viewerAddress && round.leader && addressesMatch(viewerAddress, round.leader)
  );
  const bidIsValid = meetsMinimum(bidAmount, round.minimumBid);

  useEffect(() => {
    edited.current = false;
    setBidError(null);
    setNotice(null);
  }, [round.id]);

  // A rival bid raises the minimum. Keep the viewer's own amount while it
  // still qualifies; otherwise move the input to the new minimum.
  useEffect(() => {
    setBidAmount((current) =>
      edited.current && meetsMinimum(current, round.minimumBid)
        ? current
        : minimumBid
    );
  }, [minimumBid, round.id, round.minimumBid]);

  const runAction = async (action: () => Promise<void>, success: string) => {
    if (isSubmitting || submissionInFlight.current) return;
    submissionInFlight.current = true;
    setBidError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await action();
      edited.current = false;
      setNotice(success);
    } catch (reason) {
      setBidError(
        reason instanceof Error ? reason.message : 'Transaction failed.'
      );
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  };

  const submitBid = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onPlaceBid || !bidIsValid || isLeader) return;
    void runAction(() => onPlaceBid(bidAmount), 'BID CONFIRMED // YOU LEAD');
  };

  const details =
    phase === 'pending'
      ? [
          { label: 'RESERVE', value: formatBeaconAmount(round.reservePrice) },
          {
            label: 'WINDOW',
            value: formatDuration(round.biddingDurationSeconds),
          },
          { label: 'MIN RAISE', value: formatRaise(round.minRaiseBps) },
        ]
      : phase === 'settling'
        ? [
            {
              label: 'WINNING BID',
              value: formatBeaconAmount(round.leadingBid),
            },
            { label: 'BIDS', value: String(round.bidCount) },
            { label: 'RESERVE', value: formatBeaconAmount(round.reservePrice) },
          ]
        : [
            {
              label: 'LEADING BID',
              value: formatBeaconAmount(round.leadingBid),
            },
            { label: 'BIDS', value: String(round.bidCount) },
            {
              label: 'NEXT MINIMUM',
              value: formatBeaconAmount(round.minimumBid),
            },
          ];

  return (
    <section className="bg-surface px-5 py-6 sm:px-7 sm:py-8">
      <Eyebrow>BIDDING DETAILS</Eyebrow>

      <div className="mt-4 grid items-center gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-12">
        <AuctionOrbit phase={phase} round={round} chainNow={chainNow} />

        <div className="min-w-0">
          <h3 className="text-title font-bold">{state.title}</h3>
          <p className="mt-2 max-w-xl text-caption text-fg-muted">
            {state.body}
          </p>

          <StatGrid className="mt-6 sm:grid-cols-3">
            {details.map((detail) => (
              <Stat
                key={detail.label}
                label={detail.label}
                value={detail.value}
              />
            ))}
          </StatGrid>

          {round.leader ? (
            <section
              aria-label="Leading bidder"
              className="mt-5 flex items-center justify-between gap-3 border-l border-fg bg-fg/[0.035] px-4 py-3"
            >
              <MetricText
                label={phase === 'settling' ? 'WINNER' : 'LEADER'}
                value={<AddressLink address={round.leader} />}
              />
              {isLeader ? <Badge variant="solid">YOU</Badge> : null}
            </section>
          ) : null}

          {canBid ? (
            <form className="mt-6" onSubmit={submitBid}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-label">
                <label htmlFor="beacon-bid-amount" className="text-fg-subtle">
                  YOUR BID
                </label>
                <span className={onPlaceBid ? 'text-fg' : 'text-fg-subtle'}>
                  {bidStatusLabel ||
                    (onPlaceBid ? 'PUBLIC BID // STRK' : 'WALLET REQUIRED')}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] border border-line-strong focus-within:border-fg">
                <input
                  id="beacon-bid-amount"
                  type="number"
                  min={minimumBid}
                  step="any"
                  inputMode="decimal"
                  value={bidAmount}
                  disabled={isLeader}
                  onChange={(event) => {
                    edited.current = true;
                    setBidAmount(event.target.value);
                    setNotice(null);
                    setBidError(null);
                  }}
                  className="min-w-0 bg-surface px-4 py-4 text-figure font-bold tabular-nums text-fg outline-none disabled:text-fg-subtle"
                />
                <span className="grid place-items-center border-l border-line px-4 text-label text-fg-muted">
                  STRK
                </span>
              </div>
              <p className="mt-2 text-caption text-fg-subtle">
                {phase === 'pending'
                  ? `Minimum ${formatBeaconAmount(round.minimumBid)}.`
                  : `Minimum ${formatBeaconAmount(round.minimumBid)} (+${formatRaise(round.minRaiseBps)}).`}{' '}
                Outbid bids are refunded in the same transaction.
                {round.extensionSeconds > 0
                  ? ` A bid in the final ${formatWindow(round.extensionSeconds)} extends the deadline to ${formatWindow(round.extensionSeconds)} after that bid.`
                  : ''}
              </p>
              <Button
                type="submit"
                variant="solid"
                size="lg"
                fullWidth
                busy={isSubmitting}
                disabled={!onPlaceBid || !bidIsValid || isLeader}
                title={
                  onPlaceBid
                    ? 'Place a public bid'
                    : bidStatusLabel || 'Wallet bidding is unavailable'
                }
                className="mt-3"
              >
                {isSubmitting
                  ? 'CONFIRM IN WALLET…'
                  : isLeader
                    ? 'YOU HOLD THE LEAD'
                    : 'PLACE BID'}
              </Button>
            </form>
          ) : null}

          {phase === 'settling' ? (
            <div className="mt-6">
              <Button
                variant="solid"
                size="lg"
                fullWidth
                busy={isSubmitting}
                disabled={!onSettle}
                onClick={() => {
                  if (onSettle) {
                    void runAction(onSettle, 'ROUND SETTLED');
                  }
                }}
                title={
                  onSettle
                    ? 'Finalize this round'
                    : 'Connect a wallet to finalize this round'
                }
              >
                {isSubmitting ? 'CONFIRM IN WALLET…' : 'SETTLE ROUND'}
              </Button>
              <p className="mt-2 text-caption text-fg-subtle">
                Anyone can finalize the round; the keeper usually does it within
                a minute.
              </p>
            </div>
          ) : null}

          {notice ? (
            <p className="mt-2 text-label text-fg" role="status">
              {notice}
            </p>
          ) : null}
          {bidError ? (
            <Callout tone="danger" role="alert" className="mt-2">
              {bidError}
            </Callout>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function HistoryPanel({ entries }: { entries: BeaconHistoryEntry[] }) {
  return (
    <section className="min-h-[30rem] bg-surface">
      <div className="border-b border-line px-5 py-5 sm:px-7">
        <SectionHeading
          as="h3"
          eyebrow="COMPLETED CONTROL CYCLES"
          title="Winner history"
          className="items-center"
        >
          <span className="text-tag text-fg-subtle">VERIFIED</span>
        </SectionHeading>
      </div>

      {entries.length === 0 ? (
        <div className="grid min-h-[22rem] place-items-center px-6 text-center">
          <div>
            <div className="text-label text-fg-subtle">NO WINNERS YET</div>
            <p className="mt-3 text-caption text-fg-subtle">
              Completed auctions will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table aria-label="Beacon winner history">
            <TableHead>
              <tr>
                <TableHeaderCell className="py-4 pl-4 sm:pl-7">
                  ROUND
                </TableHeaderCell>
                <TableHeaderCell className="px-2 py-4 sm:px-3">
                  WINNER
                </TableHeaderCell>
                <TableHeaderCell numeric className="hidden py-4 sm:table-cell">
                  BIDS
                </TableHeaderCell>
                <TableHeaderCell
                  numeric
                  className="whitespace-normal py-4 pr-4 sm:whitespace-nowrap sm:pr-7"
                >
                  WINNING BID
                </TableHeaderCell>
              </tr>
            </TableHead>
            <tbody>
              {entries.map((entry) => (
                <TableRow key={entry.roundId}>
                  <TableCell className="py-4 pl-4 text-body font-bold tabular-nums sm:pl-7 sm:text-figure-sm">
                    {String(entry.roundId).padStart(4, '0')}
                  </TableCell>
                  <TableCell
                    className="whitespace-nowrap px-2 py-4 text-caption font-bold text-fg sm:px-3 sm:text-body"
                    title={entry.winnerAddress}
                  >
                    <AddressLink address={entry.winnerAddress} />
                  </TableCell>
                  <TableCell
                    numeric
                    className="hidden py-4 text-body sm:table-cell"
                  >
                    {entry.bidCount}
                  </TableCell>
                  <TableCell
                    numeric
                    className="whitespace-nowrap py-4 pr-4 text-caption font-bold text-fg sm:pr-7 sm:text-body"
                  >
                    {formatBeaconAmount(entry.winningBid)}
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </section>
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
          stroke={colors.line.DEFAULT}
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
        <Eyebrow>{orbitLabel(phase)}</Eyebrow>
        <div className="mt-2 text-figure font-bold tabular-nums">{value}</div>
        {phase === 'pending' ? (
          <div className="mt-2 text-label text-fg">STARTS ON BID</div>
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
    <Callout className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        {hasSnapshot
          ? 'Showing the last verified data.'
          : 'Verified data unavailable.'}
      </span>
      <Button variant="link" size="sm" onClick={onRefresh} className="shrink-0">
        RETRY
      </Button>
    </Callout>
  );
}

function BeaconBillboard({
  billboard,
}: {
  billboard: NonNullable<BeaconSnapshot['billboard']>;
}) {
  const destinationUrl = normalizeBeaconDestination(billboard.destinationUrl);

  return (
    <section aria-label="Beacon transmission">
      <div className="border border-line-strong bg-surface-raised p-2">
        <BeaconBillboardImage
          key={`${billboard.imageUrl}:${billboard.thumbnailUrl}`}
          imageUrl={billboard.imageUrl}
          thumbnailUrl={billboard.thumbnailUrl}
        />
      </div>
      {billboard.description ? (
        <p className="mt-3 whitespace-pre-line text-caption text-fg-secondary">
          {billboard.description}
        </p>
      ) : null}
      {isValidBeaconDestination(destinationUrl) ? (
        <a
          href={destinationUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className={buttonStyles({
            variant: 'outline',
            fullWidth: true,
            className: 'mt-3 justify-between gap-3',
          })}
          title={destinationUrl}
        >
          <span className="min-w-0 truncate normal-case underline decoration-fg-subtle underline-offset-4">
            {destinationUrl}
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
    <div className="grid min-h-36 max-h-64 place-items-center overflow-hidden bg-surface">
      {isUnavailable ? (
        <span className="text-tag text-fg-subtle">
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

function BeaconControllerActions({ onSelect }: { onSelect: () => void }) {
  return (
    <section className="border-t border-line pt-4">
      <Eyebrow className="flex items-center justify-between gap-3">
        <span>CONTROLLER ACTIONS</span>
        <span>01 AVAILABLE</span>
      </Eyebrow>
      <Button
        variant="solid"
        fullWidth
        onClick={onSelect}
        className="mt-3 justify-between text-left"
      >
        <span>BUILD TRANSMISSION</span>
        <span aria-hidden="true">→</span>
      </Button>
      <p className="mt-2 text-tag text-fg-subtle">
        OR PASTE AN IMAGE · CTRL/⌘V
      </p>
    </section>
  );
}

function isValidBeaconDestination(destinationUrl: string) {
  try {
    const normalized = normalizeBeaconDestination(destinationUrl);
    if (!normalized || normalized.length > BEACON_DESTINATION_MAX_LENGTH) {
      return false;
    }
    const parsed = new URL(normalized);
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

  useClipboardImagePaste(!isUploading, chooseFile);

  const upload = async () => {
    const normalizedDestinationUrl = normalizeBeaconDestination(destinationUrl);
    if (
      !prepared ||
      !uploadsEnabled ||
      isUploading ||
      (normalizedDestinationUrl !== '' &&
        !isValidBeaconDestination(normalizedDestinationUrl))
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
        destinationUrl: normalizedDestinationUrl,
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
    (destinationUrl.trim() !== '' && !isValidBeaconDestination(destinationUrl));

  return (
    <section
      className="border-t border-line pt-4"
      aria-label="Publish Beacon transmission"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>TRANSMISSION</Eyebrow>
          <div className="mt-1 text-body font-bold">ONE-SHOT BROADCAST</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isUploading}
          className="shrink-0"
        >
          RETURN
        </Button>
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
        className="mt-3 w-full border border-dashed border-line-strong bg-surface-raised p-3 text-left transition-colors hover:border-fg disabled:cursor-wait disabled:opacity-60"
      >
        <span className="grid min-h-32 max-h-64 place-items-center overflow-hidden border border-line bg-surface">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Prepared Beacon projection preview"
              className="h-auto max-h-64 max-w-full object-contain"
            />
          ) : (
            <span className="grid min-h-32 place-items-center text-label text-fg-subtle">
              CHOOSE · DROP · PASTE
            </span>
          )}
        </span>
        <span className="mt-2 block truncate text-tag text-fg-subtle">
          {fileName || 'WEBP · JPEG · PNG'}
        </span>
      </button>

      <label className="mt-3 block" htmlFor="beacon-ad-description">
        <span className="flex items-center justify-between gap-3 text-label text-fg-subtle">
          <span>DESCRIPTION (OPTIONAL)</span>
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
          className={fieldStyles({ className: 'mt-2 resize-none' })}
        />
      </label>

      <label className="mt-3 block" htmlFor="beacon-ad-destination">
        <span className="text-label text-fg-subtle">
          DESTINATION LINK (OPTIONAL)
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
          onBlur={() =>
            setDestinationUrl(normalizeBeaconDestination(destinationUrl))
          }
          placeholder="https://example.com"
          className={fieldStyles({ className: 'mt-2' })}
        />
      </label>

      <Callout className="mt-3">
        Publishing locks the image, description, and link until the next winner.
      </Callout>

      {!isCheckingService && !uploadsEnabled && !uploadError ? (
        <Callout className="mt-3 tracking-caps">
          UPLOADS UNAVAILABLE · IMAGE STORAGE IS NOT CONFIGURED
        </Callout>
      ) : null}
      {uploadError ? (
        <Callout tone="danger" role="alert" className="mt-3">
          UPLOAD FAILED · {uploadError}
        </Callout>
      ) : null}
      {uploadNotice ? (
        <Callout role="status" className="mt-3 border-fg text-label text-fg">
          {uploadNotice}
        </Callout>
      ) : null}

      <Button
        variant="solid"
        fullWidth
        busy={isCheckingService || isPreparing || isUploading}
        disabled={disabled}
        onClick={() => void upload()}
        className="mt-3"
      >
        {isCheckingService
          ? 'CHECKING IMAGE SERVICE…'
          : isPreparing
            ? 'PREPARING IMAGE…'
            : isUploading
              ? 'PUBLISHING TRANSMISSION…'
              : !prepared
                ? 'CHOOSE IMAGE'
                : destinationUrl.trim() !== '' &&
                    !isValidBeaconDestination(destinationUrl)
                  ? 'ADD VALID LINK'
                  : 'PUBLISH TRANSMISSION'}
      </Button>
    </section>
  );
}

function MetricText({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <Eyebrow>{label}</Eyebrow>
      <div
        className="mt-1 truncate text-caption text-fg"
        title={typeof value === 'string' ? value : undefined}
      >
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
        body: `The first bid at or above the reserve opens a ${formatAuctionWindow(round.biddingDurationSeconds)} auction.`,
      };
    case 'bidding':
      return {
        title: 'Bidding is open',
        body: 'Every bid is public. The highest bid when the clock runs out wins control of the Beacon.',
      };
    case 'settling':
      return {
        title: 'Bidding closed',
        body: 'The leading bid won. Settlement hands control to the winner and opens the next round.',
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
  if (phase === 'settling') return 'FINAL';
  return '—';
}

function orbitLabel(phase: BeaconPhase) {
  if (phase === 'bidding') return 'BIDDING CLOSES IN';
  if (phase === 'settling') return 'SETTLEMENT';
  if (phase === 'pending') return 'AUCTION';
  return beaconPhaseLabel(phase);
}

function auctionProgress(
  phase: BeaconPhase,
  round: BeaconRound,
  chainNow: number
) {
  if (phase === 'settling') return 1;
  if (phase === 'bidding') {
    return timedProgress(round.startedAt, round.endsAt, chainNow);
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

function formatRaise(bps: number) {
  return `${Number((bps / 100).toFixed(2))}%`;
}

function formatWindow(seconds: number) {
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  return `${seconds} seconds`;
}

function strkInputValue(value: string) {
  try {
    return formatStrk(BigInt(value), 18).replace(/,/g, '');
  } catch {
    return '';
  }
}

function meetsMinimum(amount: string, minimum: string) {
  try {
    return parseStrk(amount) >= BigInt(minimum) && BigInt(minimum) > 0n;
  } catch {
    return false;
  }
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
