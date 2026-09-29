import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useProvider,
  useSendTransaction,
} from '@starknetfoundation/starknet-start-react';
import { TransactionExecutionStatus } from 'starknet';
import { SupplyDropLogo } from '../components/3d/SupplyDropLogo';
import { WalletButton } from '../components/ui/WalletButton';
import { AddressLink } from '../components/ui/AddressLink';
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
import { addressesMatch, formatStrk, isZeroAddress } from '../utils/format';
import {
  Badge,
  Button,
  Callout,
  Eyebrow,
  PageTitle,
  Panel,
  PanelSection,
  SectionHeading,
  Stat,
  StatGrid,
} from '../../ui';

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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-fg-subtle">
      <Badge tone="gold">{prizeStandard(supplyDrop.prizeKind)}</Badge>
      <span className="tabular-nums">
        TOKEN <AddressLink address={supplyDrop.token} />
      </span>
    </div>
  );
}

function EmptySupplyDrop() {
  return (
    <Panel className="px-6 py-16 sm:px-10">
      <div className="h-px w-16 bg-gold" />
      <h2 className="mt-6 text-title text-fg">NO ACTIVE SUPPLY DROP</h2>
      <p className="mt-4 max-w-xl text-caption leading-6 text-fg-subtle">
        The next Supply Drop has not started yet. Keep control of your
        Sectors—the operator recorded when the drop window closes is eligible to
        receive the drop if their Sector is selected.
      </p>
    </Panel>
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
    <div className="h-full w-full overflow-y-auto bg-surface font-mono">
      <div className="pointer-events-none fixed inset-0 bg-glow-gold-corner" />
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-24 sm:px-6">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-5 border-b border-line pb-7">
          <div className="min-w-0">
            <Eyebrow>SECTOR REWARDS</Eyebrow>
            <PageTitle className="mt-1">SUPPLY DROP</PageTitle>
            <p className="mt-2 max-w-xl text-caption text-fg-muted">
              A portion of pool commissions funds each drop. One Sector is
              selected at random; its operator at the deadline receives it.
              Received drops are staked automatically.
            </p>
            {current && policies[current.id.toString()]?.stakingRequired ? (
              <p className="mt-3 max-w-2xl text-caption text-gold">
                Claiming automatically stakes the full drop in the same
                transaction. Until it is staked, Sector actions and image
                changes pause. Your Sectors remain open to takeover.
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3 self-start">
            <div className="hidden text-right text-tag text-fg-subtle md:block">
              <div>LIVE OBJECT</div>
              <div className="mt-1 text-gold">SUPPLY DROP</div>
            </div>
            <div className="h-16 w-16 border border-line bg-surface sm:h-24 sm:w-24">
              <SupplyDropLogo className="pointer-events-none h-full w-full" />
            </div>
          </div>
        </header>

        {policyError ? (
          <Callout tone="warning" role="alert" className="mt-4">
            Staking terms unavailable: {policyError} Claims are disabled until
            verification succeeds.
          </Callout>
        ) : null}

        {error ? (
          <Panel as="div" tone="warning" className="mt-8">
            <PanelSection className="text-caption text-warning">
              <p>{error}</p>
              <Button
                variant="outline"
                tone="warning"
                onClick={refresh}
                className="mt-4"
              >
                RETRY
              </Button>
            </PanelSection>
          </Panel>
        ) : null}

        {!error && isLoading && supplyDrops.length === 0 ? (
          <div className="mt-8 flex items-center gap-3 border-y border-line py-14 text-label text-fg-subtle">
            <span className="h-1.5 w-1.5 animate-pulse bg-gold" />
            READING SUPPLY DROP LEDGER…
          </div>
        ) : null}

        {!error && (!isLoading || supplyDrops.length > 0) ? (
          <div className="mt-8">
            {current ? (
              <Panel className="grid lg:grid-cols-[1.4fr_0.6fr]">
                <div className="relative overflow-hidden p-6 sm:p-10">
                  <div className="absolute bottom-0 right-0 text-ghost font-bold leading-none text-fg/[0.018]">
                    {current.id.toString().padStart(2, '0')}
                  </div>
                  <div className="relative">
                    <Eyebrow tone="gold" dot>
                      {liveStatus(current, now)} · ROUND {current.id.toString()}
                    </Eyebrow>
                    <h2 className="mt-8 break-words text-display font-bold text-fg">
                      {prizeLabel(current)}
                    </h2>
                    <div className="mt-7">
                      <PrizeToken supplyDrop={current} />
                    </div>
                    <StatGrid className="mt-10 max-w-xl grid-cols-2 sm:grid-cols-3">
                      <Stat
                        label="SECTORS IN DRAW"
                        value={current.sectorLimitSnapshot.toLocaleString()}
                      />
                      <Stat label="PREVIOUS DRAWS" value={current.drawCount} />
                      <Stat
                        className="col-span-2 sm:col-span-1"
                        label="SPONSOR"
                        value={<AddressLink address={current.sponsor} />}
                      />
                    </StatGrid>
                  </div>
                </div>

                <div className="flex flex-col justify-between border-t border-line p-6 lg:border-l lg:border-t-0 lg:p-8">
                  <div>
                    <Eyebrow>
                      {current.status === 3 || current.endsAt * 1_000 <= now
                        ? 'ROUND EXPIRED'
                        : 'TIME TO DROP'}
                    </Eyebrow>
                    <div className="mt-4 whitespace-nowrap text-figure tabular-nums text-fg">
                      {current.status === 3 || current.endsAt * 1_000 <= now
                        ? '00:00:00:00'
                        : formatCountdown(current.endsAt, now)}
                    </div>
                    <div className="mt-2 grid grid-cols-4 text-tag text-fg-subtle">
                      <span>DAYS</span>
                      <span>HRS</span>
                      <span>MIN</span>
                      <span>SEC</span>
                    </div>
                  </div>
                  <Callout tone="gold" className="mt-12 text-fg-subtle">
                    {current.status === 3
                      ? `The draw is locked to block ${current.randomnessBlock.toString()}. Settlement can complete once randomness is ready.`
                      : current.endsAt * 1_000 <= now
                        ? 'The control snapshot is fixed. The winning Sector is waiting to be drawn and settled.'
                        : `Operator is recorded at ${formatDate(current.endsAt)}.`}
                  </Callout>
                </div>
              </Panel>
            ) : (
              <EmptySupplyDrop />
            )}
          </div>
        ) : null}

        <section className="mt-14">
          <SectionHeading
            eyebrow="PRIZES · WINNERS · CLAIM STATUS"
            title="PAST SUPPLY DROPS"
            className="border-b border-line pb-4"
          >
            <span className="text-caption tabular-nums text-fg-subtle">
              {past.length.toString().padStart(2, '0')}
            </span>
          </SectionHeading>

          {claimError ? (
            <Callout tone="warning" className="mt-4">
              {claimError}
            </Callout>
          ) : null}

          {past.length === 0 ? (
            <div className="border-b border-line py-12 text-label text-fg-subtle">
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
                    className="grid gap-6 border-b border-line py-6 md:grid-cols-[0.45fr_1.2fr_1fr_0.8fr] md:items-center"
                  >
                    <div>
                      <div className="text-label text-fg-subtle">ROUND</div>
                      <div className="mt-1 text-figure-sm tabular-nums text-fg">
                        #{supplyDrop.id.toString().padStart(2, '0')}
                      </div>
                      <div className="mt-1 text-caption tabular-nums text-fg-subtle">
                        {formatDate(supplyDrop.settledAt)}
                      </div>
                    </div>

                    <div>
                      <div className="text-figure-sm text-fg">
                        {prizeLabel(supplyDrop)}
                      </div>
                      <div className="mt-2">
                        <PrizeToken supplyDrop={supplyDrop} />
                      </div>
                      {policy?.stakingRequired ? (
                        <p className="mt-2 text-caption text-gold">
                          Received drops are staked automatically. Claiming
                          alone pauses gameplay until it is staked.
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <div className="text-label text-fg-subtle">
                        WINNER · SECTOR {supplyDrop.lastDrawnSectorId}
                      </div>
                      <div className="mt-2 text-caption text-fg-secondary">
                        {isZeroAddress(supplyDrop.winner) ? (
                          'NOT RECORDED'
                        ) : (
                          <AddressLink address={supplyDrop.winner} />
                        )}
                      </div>
                      {winnerConnected ? (
                        <div className="mt-1">
                          <Badge tone="gold">YOUR WIN</Badge>
                        </div>
                      ) : null}
                    </div>

                    <div className="md:text-right">
                      {supplyDrop.claimed ? (
                        <div>
                          <div className="text-label text-fg-secondary">
                            CLAIMED ✓
                          </div>
                          <div className="mt-1 text-tag text-fg-subtle">
                            {formatDate(supplyDrop.claimedAt)}
                          </div>
                          <div className="mt-1 text-tag text-fg-subtle">
                            TO <AddressLink address={supplyDrop.claimedBy} />
                          </div>
                        </div>
                      ) : canClaim ? (
                        <Button
                          variant="solid"
                          tone="gold"
                          onClick={() => void claimPrize(supplyDrop)}
                          disabled={
                            claimingId !== null ||
                            !policy ||
                            Boolean(policyError)
                          }
                          busy={
                            claimingId === supplyDrop.id ||
                            (!policy && !policyError)
                          }
                        >
                          {claimingId === supplyDrop.id
                            ? 'CLAIMING…'
                            : !policy
                              ? 'VERIFYING…'
                              : policy.stakingRequired
                                ? 'CLAIM & STAKE'
                                : 'CLAIM PRIZE'}
                        </Button>
                      ) : (
                        <div className="text-label text-fg-subtle">
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
            <Panel as="div" className="mt-6">
              <PanelSection className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <p className="text-caption text-fg-subtle">
                  Connect the winning wallet to reveal and claim its prize.
                </p>
                <WalletButton />
              </PanelSection>
            </Panel>
          ) : null}
        </section>
      </div>
    </div>
  );
}
