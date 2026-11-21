import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSignTypedData } from '@starknetfoundation/starknet-start-react';
import {
  Badge,
  Button,
  ExternalLink,
  Callout,
  PageTitle,
  Eyebrow,
  SectionHeading,
  SegmentedControl,
  Stat,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableHeaderCell,
  buttonStyles,
} from '../../ui';
import { useWallet } from '../contexts/WalletContext';
import {
  hasPlayedSurvivor,
  retrySurvivorRuns,
  survivorGuestId,
} from '../survivors/guest';
import { SurvivorGuide } from '../components/ui/SurvivorGuide';
import { SurvivorFinalSkills } from '../components/ui/SurvivorFinalSkills';
import { SurvivorChase } from '../components/3d/SurvivorChase';
import { WalletButton } from '../components/ui/WalletButton';
import { voyagerTransactionUrl } from '../utils/voyager';
import { isOutisWallet } from '../utils/wallets';
import { api, type SurvivorBoard } from '../services/api';
import { config } from '../services/config';
import { survivorsSession } from '../survivors/session';
import {
  addressesMatch,
  formatCountdown,
  formatStrk,
  formatSurvivalTime,
  shortAddress,
} from '../utils/format';

export function Survivors() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const [board, setBoard] = useState<
    (SurvivorBoard & { isCurrent: boolean }) | null
  >(null);
  const [error, setError] = useState('');
  const [startError, setStartError] = useState('');
  const [starting, setStarting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [scope, setScope] = useState<'round' | 'all'>('round');
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [params] = useSearchParams();
  const viewedRound = params.get('round') || undefined;
  useEffect(() => {
    if (!address) return;
    const flush = () => void retrySurvivorRuns(address);
    flush();
    window.addEventListener('online', flush);
    const timer = window.setInterval(flush, 15000);
    return () => {
      window.removeEventListener('online', flush);
      window.clearInterval(timer);
    };
  }, [address]);
  useEffect(() => {
    setBoard(null);
    setStartError('');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let archivedRound: string | undefined;
    async function read() {
      let pollDelay = 15000;
      try {
        // Once a round is historical, only its own scores and payout need polling.
        let next = await api.getSurvivorBoard(controller.signal, archivedRound);
        if (
          !controller.signal.aborted &&
          viewedRound &&
          !archivedRound &&
          viewedRound !== String(next.round?.id)
        ) {
          const latestId = next.round?.id;
          next = await api.getSurvivorBoard(controller.signal, viewedRound);
          if (latestId && next.round && next.round.id < latestId)
            archivedRound = viewedRound;
        }
        if (controller.signal.aborted) return;
        if (next.network !== config.starknetChainId)
          throw new Error('The leaderboard is on a different network.');
        if (scope === 'all' && next.round) {
          const all = await api.getSurvivorBoard(
            controller.signal,
            undefined,
            true
          );
          if (controller.signal.aborted) return;
          if (all.network !== next.network)
            throw new Error('The leaderboard is on a different network.');
          next = { ...next, entries: all.entries };
        }
        setBoard({ ...next, isCurrent: !archivedRound });
        setError('');
        if (next.round && !next.round.closed) {
          const untilClose = Date.parse(next.round.deadline) - Date.now();
          if (untilClose > 0) pollDelay = Math.min(pollDelay, untilClose);
        }
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof Error ? reason.message : 'Leaderboard unavailable.'
        );
      }
      if (!controller.signal.aborted) timer = setTimeout(read, pollDelay);
    }
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [refresh, viewedRound, scope]);

  const round = board?.round;
  const deadline = round && !round.closed ? Date.parse(round.deadline) : 0;
  useEffect(() => {
    if (!deadline) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  const remainingSeconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const open = remainingSeconds > 0;
  async function start() {
    if (!board || starting) return;
    setStarting(true);
    setStartError('');
    try {
      const ticket = await api.startSurvivorRun();
      survivorGuestId();
      survivorsSession.ticket = ticket;
      setShowGuide(false);
      navigate('/?survive=1');
    } catch (reason) {
      setStartError(
        reason instanceof Error ? reason.message : 'Could not start this run.'
      );
    } finally {
      setStarting(false);
    }
  }

  const prize = round?.prizeAmount
    ? formatStrk(BigInt(round.prizeAmount)) + ' STRK'
    : '';
  const winner = round?.closed ? round.winner : null;
  const showPrizeColumn = scope === 'round' && Boolean(winner && prize);
  const standings = board?.entries ?? [];
  // The eligible Outis winner can rank below the public top 100.
  const rows =
    scope === 'round' &&
    winner?.wallet &&
    !standings.some(
      (entry) =>
        entry.wallet &&
        winner.wallet &&
        addressesMatch(entry.wallet, winner.wallet)
    )
      ? [...standings, winner]
      : standings;

  return (
    <div className="h-full overflow-y-auto bg-surface">
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-16 sm:px-6">
        <header className="relative isolate flex flex-col md:min-h-96 md:justify-center">
          <SurvivorChase />
          <div className="relative py-6 md:w-1/2 md:py-10">
            {round && !error && (
              <Eyebrow tone="accent" className="uppercase">
                Round {round.id} /{' '}
                {round.closed ? 'Closed' : open ? 'Open' : 'Finalizing'}
              </Eyebrow>
            )}
            <PageTitle className="mt-3">Core Survivors</PageTitle>
            <p className="mt-3 text-lead text-fg-secondary">
              Fight the Hollow Legion.
            </p>
            <Button
              variant="solid"
              tone="accent"
              size="xl"
              className="mt-6 text-title font-bold"
              disabled={!board || Boolean(error)}
              busy={starting}
              onClick={() => {
                if (hasPlayedSurvivor()) void start();
                else setShowGuide(true);
              }}
            >
              Play
            </Button>
          </div>
        </header>
        <section aria-label="Prize round" className="border-y border-line py-4">
          {error ? (
            <Callout
              className="mt-3"
              tone="warning"
              role="alert"
              action={
                <Button
                  variant="outline"
                  onClick={() => setRefresh((n) => n + 1)}
                >
                  Retry
                </Button>
              }
            >
              {error}
            </Callout>
          ) : !board ? (
            <p role="status" className="mt-3 text-body text-fg-muted">
              Loading standings…
            </p>
          ) : !round ? (
            <p className="mt-3 text-body text-fg-muted">No open prize round.</p>
          ) : (
            <>
              <div className="flex items-center gap-3 whitespace-nowrap sm:gap-8">
                {prize && (
                  <Stat
                    label="DAILY PRIZE"
                    value={prize}
                    emphasis
                    className="p-0"
                  />
                )}
                {!round.closed && (
                  <Stat
                    label="ENDS IN"
                    value={
                      open ? (
                        <span role="timer" aria-label="Time remaining">
                          {formatCountdown(remainingSeconds)}
                        </span>
                      ) : (
                        'Finalizing…'
                      )
                    }
                    emphasis
                    className="border-l border-line py-0 pl-3 pr-0 sm:pl-8"
                  />
                )}
              </div>
              {prize && board.isCurrent ? (
                <div className="mt-4 flex items-stretch gap-3 border-t border-line pt-4">
                  <div
                    className="relative aspect-square min-h-9 shrink-0"
                    aria-hidden="true"
                  >
                    <img
                      src="/outis-mark.svg"
                      alt=""
                      className="absolute inset-0 size-full object-contain"
                    />
                  </div>
                  <p
                    role="status"
                    className="min-w-0 self-center text-body text-fg-secondary"
                  >
                    {round.closed && !winner ? (
                      'No Outis wallet qualified for this prize.'
                    ) : (
                      <PrizeEligibility />
                    )}
                  </p>
                </div>
              ) : round.closed && !winner ? (
                <p className="mt-3 text-body text-fg-secondary">
                  {prize
                    ? 'No Outis wallet qualified for this prize.'
                    : 'No runs finished this round.'}
                </p>
              ) : null}
            </>
          )}
          {startError && !showGuide && (
            <Callout className="mt-3" tone="warning" role="alert">
              {startError}
            </Callout>
          )}
        </section>
        <section className="mt-8" aria-label="Leaderboard">
          <SectionHeading title="Leaderboard">
            {round?.closed && !error && (
              <p className="text-caption text-fg-muted">
                Closed{' '}
                <time dateTime={round.deadline}>
                  {new Date(round.deadline).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'long',
                    timeZone: 'UTC',
                  })}
                </time>
              </p>
            )}
          </SectionHeading>
          {round && (
            <SegmentedControl
              label="Leaderboard period"
              className="mt-3 w-fit"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'round', label: 'This round' },
                { value: 'all', label: 'All time' },
              ]}
            />
          )}
          {!round && board && (
            <p className="mt-2 text-caption text-fg-muted">All time</p>
          )}
          {board &&
            !error &&
            (rows.length ? (
              <div className="mt-3 overflow-x-auto">
                <Table aria-label="Players ranked by enemies destroyed">
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Rank</TableHeaderCell>
                      <TableHeaderCell>Player</TableHeaderCell>
                      <TableHeaderCell numeric>Destroyed</TableHeaderCell>
                      <TableHeaderCell numeric>Duration</TableHeaderCell>
                      {showPrizeColumn && (
                        <TableHeaderCell className="text-right">
                          Prize
                        </TableHeaderCell>
                      )}
                    </TableRow>
                  </TableHead>
                  <tbody>
                    {rows.map((entry, i) => {
                      const isWinner =
                        scope === 'round' &&
                        winner &&
                        entry.wallet &&
                        winner.wallet &&
                        addressesMatch(entry.wallet, winner.wallet);
                      const identity = entry.wallet ?? entry.guest;
                      const name =
                        entry.name ||
                        (entry.wallet
                          ? shortAddress(entry.wallet)
                          : 'Anonymous');
                      const id = `survivor-upgrades-${board.round?.id}-${identity}`;
                      const expanded = expandedEntry === id;
                      const toggleUpgrades = () =>
                        setExpandedEntry((current) =>
                          current === id ? null : id
                        );
                      return (
                        <Fragment key={identity}>
                          <TableRow
                            className="cursor-pointer hover:bg-surface-hover"
                            onClick={(event) => {
                              if (
                                !(event.target as Element).closest(
                                  'button, a, [role="menu"]'
                                )
                              )
                                toggleUpgrades();
                            }}
                          >
                            <TableCell>
                              {i < standings.length
                                ? i + 1
                                : standings.length === 100
                                  ? '100+'
                                  : '—'}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="link"
                                size="sm"
                                aria-label={`${expanded ? 'Hide' : 'Show'} final skills for ${name}`}
                                aria-expanded={expanded}
                                aria-controls={expanded ? id : undefined}
                                title={entry.wallet}
                                className="text-caption no-underline"
                                onClick={toggleUpgrades}
                              >
                                <span
                                  aria-hidden="true"
                                  className="text-fg-muted"
                                >
                                  {expanded ? '▾' : '▸'}
                                </span>
                                {name}
                              </Button>
                              {entry.outis && (
                                <span className="ml-2 inline-flex items-center gap-1 align-middle text-tag text-fg-muted">
                                  <img
                                    src="/outis-mark.svg"
                                    alt=""
                                    width={16}
                                    height={16}
                                    className="size-4 shrink-0"
                                  />
                                  Outis
                                </span>
                              )}
                              {isWinner && (
                                <Badge tone="accent" className="ml-2">
                                  Winner
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell numeric>
                              {entry.destroyed.toLocaleString()}
                            </TableCell>
                            <TableCell numeric>
                              {entry.durationSeconds == null
                                ? 'Unrecorded'
                                : formatSurvivalTime(entry.durationSeconds)}
                            </TableCell>
                            {showPrizeColumn && (
                              <TableCell className="text-right">
                                {isWinner && round && (
                                  <WinnerPrize
                                    key={round.id}
                                    round={round}
                                    prize={prize}
                                    payoutsEnabled={board.payoutsEnabled}
                                    onClaimed={() => setRefresh((n) => n + 1)}
                                  />
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                          {expanded && (
                            <TableRow id={id}>
                              <TableCell colSpan={showPrizeColumn ? 5 : 4}>
                                <SurvivorFinalSkills
                                  upgrades={entry.upgrades}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            ) : (
              <p className="mt-3 text-body text-fg-muted">
                No scores recorded.
              </p>
            ))}
        </section>
        <nav aria-label="Prize rounds" className="mt-4 flex gap-4">
          {round?.previousId && (
            <Link
              className={buttonStyles({ variant: 'link' })}
              to={`/survivors?round=${round.previousId}`}
            >
              Previous round
            </Link>
          )}
          {viewedRound && (
            <Link className={buttonStyles({ variant: 'link' })} to="/survivors">
              Current round
            </Link>
          )}
        </nav>
      </div>
      {showGuide && (
        <SurvivorGuide
          starting={starting}
          error={startError}
          onClose={() => setShowGuide(false)}
          onStart={() => void start()}
        />
      )}
    </div>
  );
}

function PrizeEligibility() {
  const { isConnected, address, walletName, walletId } = useWallet();
  if (!isConnected || !address || (!walletName && !walletId))
    return (
      <>
        Play as a guest. Submit scores with any Starknet wallet. Only{' '}
        <strong className="font-medium text-fg">Outis wallets</strong> are
        eligible for the prize.
      </>
    );

  if (isOutisWallet(walletName ?? '', walletId))
    return (
      <>
        <strong className="font-medium text-success">
          Outis wallet connected.
        </strong>{' '}
        Submit your score with this wallet to compete for the daily prize.
      </>
    );

  return (
    <>
      You can submit scores with {walletName || 'this wallet'}.{' '}
      <strong className="font-medium text-warning">
        This wallet can’t claim the daily prize, even if you finish first.
      </strong>
    </>
  );
}

function WinnerPrize({
  round,
  prize,
  payoutsEnabled,
  onClaimed,
}: {
  round: NonNullable<SurvivorBoard['round']>;
  prize: string;
  payoutsEnabled: boolean;
  onClaimed: () => void;
}) {
  const { address } = useWallet();
  const { signTypedDataAsync } = useSignTypedData({});
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState('');
  if (round.claimed) {
    const delayed = ['reverted', 'failed'].includes(round.paymentStatus ?? '');
    return (
      <div role="status">
        {round.paymentStatus === 'succeeded'
          ? `Paid ${prize}`
          : delayed
            ? 'Payment delayed. Retrying.'
            : 'Payment pending.'}
        {round.transactionHash && (
          <div>
            <ExternalLink href={voyagerTransactionUrl(round.transactionHash)}>
              View transaction
            </ExternalLink>
          </div>
        )}
      </div>
    );
  }
  if (!payoutsEnabled) return <>Claims unavailable</>;
  if (!address)
    return <WalletButton variant="block" label="Connect to claim" />;
  if (!round.winner?.wallet || !addressesMatch(address, round.winner.wallet))
    return <>Winning Outis wallet required</>;

  async function claim() {
    if (claiming) return;
    setError('');
    setClaiming(true);
    try {
      await api.claimSurvivorPrize(round.id, signTypedDataAsync);
      onClaimed();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not claim the prize.'
      );
    } finally {
      setClaiming(false);
    }
  }
  return (
    <>
      <Button
        size="sm"
        tone="accent"
        busy={claiming}
        onClick={() => void claim()}
      >
        Claim {prize}
      </Button>
      {error && (
        <p className="mt-1 text-caption text-warning" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
