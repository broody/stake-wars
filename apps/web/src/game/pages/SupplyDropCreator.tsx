import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useProvider,
  useSendTransaction,
} from '@starknetfoundation/starknet-start-react';
import { shortString, TransactionExecutionStatus } from 'starknet';
import { Link } from 'react-router-dom';
import { SupplyDropTopUp } from '../components/ui/SupplyDropTopUp';
import { WalletButton } from '../components/ui/WalletButton';
import { AddressLink } from '../components/ui/AddressLink';
import { useTransactionToast } from '../contexts/TransactionToastContext';
import { useWallet } from '../contexts/WalletContext';
import { config } from '../services/config';
import {
  buildCreateSupplyDropCalls,
  normalizeContractAddress,
  parseDurationSeconds,
  parseTokenId,
  parseTokenUnits,
  type SupplyDropDurationUnit,
  type SupplyDropPrizeKind,
} from '../services/supplyDrop';
import { canCreateSupplyDrop, getActiveSupplyDrop } from '../services/starknet';
import type { SupplyDrop } from '../types';
import {
  addressesMatch,
  formatCountdown,
  formatStrk,
  shortAddress,
} from '../utils/format';
import { voyagerTransactionUrl } from '../utils/voyager';
import {
  Badge,
  Button,
  buttonStyles,
  Callout,
  ExternalLink,
  Eyebrow,
  fieldStyles,
  PageTitle,
  Panel,
  PanelSection,
  Stat,
  StatGrid,
} from '../../ui';

type SubmissionPhase = 'idle' | 'submitting' | 'confirming' | 'confirmed';
type AuthorizationState = 'idle' | 'checking' | 'allowed' | 'denied' | 'error';

const PRIZE_OPTIONS: Array<{
  kind: SupplyDropPrizeKind;
  label: string;
  detail: string;
}> = [
  { kind: 'erc20', label: 'ERC-20', detail: 'FUNGIBLE' },
  { kind: 'erc721', label: 'ERC-721', detail: '1 OF 1' },
  { kind: 'erc1155', label: 'ERC-1155', detail: 'EDITION' },
];

const DURATION_PRESETS: Array<{
  label: string;
  value: string;
  unit: SupplyDropDurationUnit;
}> = [
  { label: '10 MIN TEST', value: '10', unit: 'minutes' },
  { label: '1 HOUR', value: '1', unit: 'hours' },
  { label: '7 DAYS', value: '7', unit: 'days' },
];

function displayDuration(seconds: bigint): string {
  const days = seconds / 86_400n;
  const hours = (seconds % 86_400n) / 3_600n;
  const minutes = (seconds % 3_600n) / 60n;
  if (days > 0n) return `${days}D ${hours}H`;
  if (hours > 0n) return `${hours}H ${minutes}M`;
  return `${minutes}M`;
}

function InputLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-label text-fg-subtle">
      {children}
    </label>
  );
}

function CircuitStep({
  index,
  title,
  detail,
  active,
}: {
  index: string;
  title: string;
  detail: string;
  active: boolean;
}) {
  return (
    <div className="relative grid grid-cols-[42px_1fr] gap-4 pb-8 last:pb-0">
      <div
        className={`relative z-[1] flex h-10 w-10 items-center justify-center border text-caption transition-colors motion-reduce:transition-none ${
          active
            ? 'border-gold bg-gold text-surface'
            : 'border-line-strong bg-surface text-fg-subtle'
        }`}
      >
        {index}
      </div>
      <div className="pt-0.5">
        <div
          className={`text-label ${active ? 'text-gold-soft' : 'text-fg-secondary'}`}
        >
          {title}
        </div>
        <p className="mt-1 text-caption text-fg-subtle">{detail}</p>
      </div>
    </div>
  );
}

export function SupplyDropCreator() {
  const { address, chainId, isConnected } = useWallet();
  const [current, setCurrent] = useState<SupplyDrop | null>();
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const controller = new AbortController();
    setCurrent(undefined);
    setError(null);
    getActiveSupplyDrop(controller.signal)
      .then((supplyDrop) => {
        if (!controller.signal.aborted) setCurrent(supplyDrop);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to check the current supply drop.'
          );
        }
      });
    return () => controller.abort();
  }, [revision]);

  const endsAt = current?.endsAt;
  useEffect(() => {
    if (!endsAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  const refresh = () => setRevision((value) => value + 1);
  if (current === null && !error) {
    return (
      <SupplyDropCreationForm
        key={`${address}:${chainId}:${isConnected}`}
        onRoundChanged={refresh}
      />
    );
  }

  const isStrk =
    current?.prizeKind === 1 &&
    addressesMatch(current.token, config.strkTokenAddress);
  return (
    <div className="h-full w-full overflow-y-auto bg-surface font-mono">
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-24 sm:px-6">
        <header className="border-b border-line pb-7">
          <div className="flex flex-wrap items-center gap-3 text-label text-fg-subtle">
            <span>
              INTERNAL TOOL //{' '}
              {config.starknetChainId === 'SN_MAIN'
                ? 'MAINNET'
                : config.starknetChainId.replace('SN_', '')}
            </span>
            <Badge tone="gold">UNLISTED ROUTE</Badge>
          </div>
          <PageTitle className="mt-3">SUPPLY_DROP FOUNDRY</PageTitle>
          <p className="mt-3 text-caption text-fg-subtle">
            Manage the current prize or create a round when no supplyDrop is
            active.
          </p>
        </header>
        {error ? (
          <Panel as="div" tone="warning" className="mt-7">
            <PanelSection>
              <p role="alert" className="text-caption text-warning">
                Current supplyDrop could not be verified. {error}
              </p>
              <Button
                variant="link"
                tone="gold"
                onClick={refresh}
                className="mt-4"
              >
                RETRY SUPPLY_DROP CHECK
              </Button>
            </PanelSection>
          </Panel>
        ) : current == null ? (
          <p role="status" className="mt-7 text-caption text-fg-subtle">
            Checking current supplyDrop…
          </p>
        ) : (
          <Panel className="mt-7 p-5 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-label text-gold">
                CURRENT SUPPLY_DROP #{current.id.toString()}
              </h2>
              <Button variant="link" onClick={refresh}>
                REFRESH
              </Button>
            </div>
            <p className="mt-5 break-words text-figure font-bold text-fg">
              {isStrk
                ? `${formatStrk(current.amount, 18)} STRK`
                : current.prizeKind === 2
                  ? `NFT #${current.tokenId}`
                  : `${current.amount.toLocaleString()} ${current.prizeKind === 3 ? `UNITS OF #${current.tokenId}` : 'BASE UNITS'}`}
            </p>
            <p className="mt-2 break-all text-caption text-fg-subtle">
              TOKEN {current.token}
            </p>
            <div className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
              <div className="text-label text-fg-subtle">
                DRAW CLOSES{' '}
                <span className="mt-2 block text-caption tabular-nums text-fg-secondary">
                  {new Date(current.endsAt * 1_000).toLocaleString()}
                </span>
              </div>
              <div className="text-label text-fg-subtle">
                REMAINING{' '}
                <span className="mt-2 block text-caption tabular-nums text-fg-secondary">
                  {current.status === 2 && now < current.endsAt * 1_000
                    ? formatCountdown(current.endsAt - now / 1_000)
                    : 'AWAITING DRAW / SETTLEMENT'}
                </span>
              </div>
            </div>
            {current.prizeKind === 2 ? (
              <p className="mt-6 text-caption text-fg-subtle">
                This supplyDrop holds a single NFT. ERC-721 prizes cannot be
                topped up.
              </p>
            ) : (
              <SupplyDropTopUp
                key={`${current.id}:${address}:${chainId}:${isConnected}`}
                supplyDrop={current}
                now={now}
                onConfirmed={(id, amount) =>
                  setCurrent((previous) =>
                    previous?.id === id && amount > previous.amount
                      ? { ...previous, amount }
                      : previous
                  )
                }
              />
            )}
            <p className="mt-6 border-t border-line pt-5 text-caption text-fg-subtle">
              A new supplyDrop can be created after the current round settles.
            </p>
            <Link
              to="/drop"
              className={buttonStyles({
                variant: 'link',
                tone: 'gold',
                className: 'mt-3',
              })}
            >
              VIEW SUPPLY_DROP
            </Link>
          </Panel>
        )}
      </main>
    </div>
  );
}

function SupplyDropCreationForm({
  onRoundChanged,
}: {
  onRoundChanged: () => void;
}) {
  const { address, chainId, isConnected } = useWallet();
  const { provider } = useProvider();
  const transaction = useSendTransaction({});
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const [prizeKind, setPrizeKind] = useState<SupplyDropPrizeKind>('erc20');
  const [tokenAddress, setTokenAddress] = useState(config.strkTokenAddress);
  const [tokenId, setTokenId] = useState('0');
  const [amount, setAmount] = useState('1');
  const [decimals, setDecimals] = useState('18');
  const [duration, setDuration] = useState('7');
  const [durationUnit, setDurationUnit] =
    useState<SupplyDropDurationUnit>('days');
  const [authorization, setAuthorization] =
    useState<AuthorizationState>('idle');
  const [authorizationError, setAuthorizationError] = useState<string | null>(
    null
  );
  const [phase, setPhase] = useState<SubmissionPhase>('idle');
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [lastTransactionHash, setLastTransactionHash] = useState<string | null>(
    null
  );
  const submitting = useRef(false);
  const correctNetwork = Boolean(
    chainId &&
      addressesMatch(
        chainId,
        shortString.encodeShortString(config.starknetChainId)
      )
  );

  useEffect(() => {
    const controller = new AbortController();
    setAuthorizationError(null);
    setLastTransactionHash(null);
    setPhase('idle');

    if (!address || !isConnected || !correctNetwork) {
      setAuthorization('idle');
      return () => controller.abort();
    }

    setAuthorization('checking');
    canCreateSupplyDrop(address, controller.signal)
      .then((allowed) => {
        if (!controller.signal.aborted) {
          setAuthorization(allowed ? 'allowed' : 'denied');
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setAuthorization('error');
        setAuthorizationError(
          reason instanceof Error
            ? reason.message
            : 'Unable to verify supply drop creator access.'
        );
      });
    return () => controller.abort();
  }, [address, isConnected, correctNetwork]);

  const parsedForm = useMemo(() => {
    try {
      const normalizedToken = normalizeContractAddress(tokenAddress);
      const durationSeconds = parseDurationSeconds(duration, durationUnit);
      const parsedTokenId = prizeKind === 'erc20' ? 0n : parseTokenId(tokenId);
      const parsedDecimals = Number(decimals);
      const parsedAmount =
        prizeKind === 'erc721'
          ? 1n
          : parseTokenUnits(amount, prizeKind === 'erc20' ? parsedDecimals : 0);
      return {
        amount: parsedAmount,
        durationSeconds,
        error: null,
        tokenAddress: normalizedToken,
        tokenId: parsedTokenId,
      };
    } catch (reason) {
      return {
        amount: null,
        durationSeconds: null,
        error: reason instanceof Error ? reason.message : 'Check the form.',
        tokenAddress: null,
        tokenId: null,
      };
    }
  }, [
    amount,
    decimals,
    duration,
    durationUnit,
    prizeKind,
    tokenAddress,
    tokenId,
  ]);

  const busy = phase === 'submitting' || phase === 'confirming';
  const disabledReason = !config.supplyDropSystemAddress
    ? 'SUPPLY_DROP SYSTEM NOT CONFIGURED'
    : !isConnected || !address
      ? 'CONNECT WALLET'
      : !correctNetwork
        ? `SWITCH TO ${config.starknetChainId}`
        : authorization === 'checking' || authorization === 'idle'
          ? 'CHECKING CREATOR ROLE'
          : authorization === 'denied'
            ? 'WALLET IS NOT A CREATOR'
            : authorization === 'error'
              ? 'CREATOR CHECK FAILED'
              : parsedForm.error
                ? 'CHECK PRIZE DETAILS'
                : null;

  const submitSupplyDrop = async () => {
    if (
      disabledReason ||
      submitting.current ||
      phase === 'confirmed' ||
      !parsedForm.tokenAddress ||
      parsedForm.tokenId === null ||
      parsedForm.amount === null ||
      parsedForm.durationSeconds === null
    ) {
      return;
    }

    let hash: string | null = null;
    submitting.current = true;
    setSubmissionError(null);
    setLastTransactionHash(null);
    setPhase('submitting');

    try {
      // Another creator may have armed a round since this page was opened.
      if (await getActiveSupplyDrop()) {
        onRoundChanged();
        return;
      }
      const calls = buildCreateSupplyDropCalls({
        supplyDropSystemAddress: config.supplyDropSystemAddress,
        prizeKind,
        tokenAddress: parsedForm.tokenAddress,
        tokenId: parsedForm.tokenId,
        amount: parsedForm.amount,
        durationSeconds: parsedForm.durationSeconds,
      });
      const result = await transaction.sendAsync(calls);
      hash = result.transaction_hash;
      setLastTransactionHash(hash);
      notifySubmitting(hash, 'SUPPLY_DROP CREATION');
      setPhase('confirming');
      await provider.waitForTransaction(hash, {
        errorStates: [TransactionExecutionStatus.REVERTED],
      });
      notifyConfirmed(hash);
      setPhase('confirmed');
      onRoundChanged();
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : 'SupplyDrop creation failed.';
      setSubmissionError(message);
      setPhase('idle');
      if (hash) notifyFailed(hash, message);
    } finally {
      submitting.current = false;
    }
  };

  const standardLabel = PRIZE_OPTIONS.find(
    (option) => option.kind === prizeKind
  )?.label;
  const accessLabel = !address
    ? 'NO WALLET'
    : authorization === 'checking'
      ? 'VERIFYING'
      : authorization === 'allowed'
        ? 'CREATOR AUTHORIZED'
        : authorization === 'denied'
          ? 'ROLE MISSING'
          : authorization === 'error'
            ? 'CHECK FAILED'
            : 'WAITING';
  const sequenceStep = phase === 'confirmed' ? 3 : busy ? 2 : 1;

  return (
    <div className="h-full w-full overflow-y-auto bg-surface font-mono">
      <div className="pointer-events-none fixed inset-0 bg-gold-slash" />
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-24 sm:px-6">
        <header className="grid gap-6 border-b border-line pb-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3 text-label text-fg-subtle">
              <span>INTERNAL TOOL</span>
              <span className="text-fg-disabled">//</span>
              <span>
                {config.starknetChainId === 'SN_MAIN'
                  ? 'MAINNET'
                  : config.starknetChainId.replace('SN_', '')}
              </span>
              <Badge tone="gold">UNLISTED ROUTE</Badge>
            </div>
            <PageTitle className="mt-3">SUPPLY_DROP FOUNDRY</PageTitle>
            <p className="mt-3 max-w-2xl text-caption text-fg-subtle">
              Arm one prize round. Approval and escrow execute atomically, so a
              failed creation leaves no partial SupplyDrop transaction behind.
            </p>
          </div>
          <div className="grid grid-cols-2 border-l border-t border-line text-label sm:min-w-[320px]">
            <div className="border-b border-r border-line px-4 py-3 text-fg-subtle">
              NETWORK
              <div className="mt-1 text-caption text-fg-secondary">
                {chainId ?? 'DISCONNECTED'}
              </div>
            </div>
            <div className="border-b border-r border-line px-4 py-3 text-fg-subtle">
              ACCESS
              <div
                className={`mt-1 text-caption ${authorization === 'allowed' ? 'text-gold-soft' : 'text-fg-secondary'}`}
              >
                {accessLabel}
              </div>
            </div>
          </div>
        </header>

        <div className="mt-7 grid border-l border-t border-line lg:grid-cols-[1.45fr_0.75fr]">
          <main className="border-b border-r border-line p-5 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Eyebrow tone="gold">PRIZE LOADOUT</Eyebrow>
                <h2 className="mt-2 text-heading text-fg">CONFIGURE ROUND</h2>
              </div>
              {address ? (
                <div className="text-right text-label text-fg-subtle">
                  SPONSOR
                  <div className="mt-1 text-caption text-fg-muted">
                    <AddressLink address={address} />
                  </div>
                </div>
              ) : (
                <WalletButton />
              )}
            </div>

            <fieldset className="mt-8">
              <legend className="text-label text-fg-subtle">
                TOKEN STANDARD
              </legend>
              <div className="mt-2 grid grid-cols-3 border-l border-t border-line-strong">
                {PRIZE_OPTIONS.map((option) => (
                  <button
                    key={option.kind}
                    type="button"
                    aria-pressed={prizeKind === option.kind}
                    onClick={() => {
                      setPrizeKind(option.kind);
                      setSubmissionError(null);
                    }}
                    disabled={busy}
                    className={`border-b border-r px-2 py-4 text-left transition-colors focus-visible:outline-offset-[-3px] disabled:cursor-wait motion-reduce:transition-none sm:px-4 ${
                      prizeKind === option.kind
                        ? 'border-gold bg-gold/10 text-fg'
                        : 'border-line-strong text-fg-subtle hover:bg-surface-raised hover:text-fg-secondary'
                    }`}
                  >
                    <span className="block text-label">{option.label}</span>
                    <span className="mt-1 block text-tag text-fg-subtle">
                      {option.detail}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-7">
              <InputLabel htmlFor="supply-drop-token-address">
                TOKEN CONTRACT
              </InputLabel>
              <input
                id="supply-drop-token-address"
                value={tokenAddress}
                onChange={(event) => setTokenAddress(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                className={fieldStyles({
                  tone: 'gold',
                  className: 'mt-2 px-4 py-3',
                })}
                placeholder="0x…"
              />
              {prizeKind === 'erc20' && config.strkTokenAddress ? (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setTokenAddress(config.strkTokenAddress);
                    setDecimals('18');
                  }}
                  disabled={busy}
                  className="mt-2"
                >
                  USE STRK
                </Button>
              ) : null}
            </div>

            <div
              className={`mt-7 grid gap-5 ${prizeKind === 'erc20' ? 'sm:grid-cols-[1fr_150px]' : prizeKind === 'erc1155' ? 'sm:grid-cols-2' : ''}`}
            >
              {prizeKind !== 'erc721' ? (
                <div>
                  <InputLabel htmlFor="supply-drop-amount">
                    {prizeKind === 'erc20'
                      ? 'PRIZE AMOUNT'
                      : 'EDITION QUANTITY'}
                  </InputLabel>
                  <input
                    id="supply-drop-amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode={prizeKind === 'erc20' ? 'decimal' : 'numeric'}
                    autoComplete="off"
                    disabled={busy}
                    className={fieldStyles({
                      size: 'lg',
                      tone: 'gold',
                      className: 'mt-2 py-4',
                    })}
                    placeholder="1"
                  />
                </div>
              ) : null}

              {prizeKind === 'erc20' ? (
                <div>
                  <InputLabel htmlFor="supply-drop-decimals">
                    TOKEN DECIMALS
                  </InputLabel>
                  <input
                    id="supply-drop-decimals"
                    value={decimals}
                    onChange={(event) => setDecimals(event.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    disabled={busy}
                    className={fieldStyles({
                      size: 'lg',
                      tone: 'gold',
                      className: 'mt-2 py-4',
                    })}
                  />
                </div>
              ) : null}

              {prizeKind !== 'erc20' ? (
                <div>
                  <InputLabel htmlFor="supply-drop-token-id">
                    TOKEN ID
                  </InputLabel>
                  <input
                    id="supply-drop-token-id"
                    value={tokenId}
                    onChange={(event) => setTokenId(event.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    disabled={busy}
                    className={fieldStyles({
                      size: 'lg',
                      tone: 'gold',
                      className: 'mt-2 py-4',
                    })}
                    placeholder="0"
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-8 border-t border-line pt-7">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <InputLabel htmlFor="supply-drop-duration">
                    ROUND LENGTH
                  </InputLabel>
                  <div className="mt-2 flex border border-line-strong focus-within:border-gold">
                    <input
                      id="supply-drop-duration"
                      value={duration}
                      onChange={(event) => setDuration(event.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={busy}
                      className="w-28 min-w-0 bg-surface px-4 py-3 text-figure-sm tabular-nums text-fg outline-none disabled:cursor-wait"
                    />
                    <select
                      aria-label="SupplyDrop duration unit"
                      value={durationUnit}
                      onChange={(event) =>
                        setDurationUnit(
                          event.target.value as SupplyDropDurationUnit
                        )
                      }
                      disabled={busy}
                      className="border-l border-line-strong bg-surface px-3 text-label text-fg-secondary outline-none disabled:cursor-wait"
                    >
                      <option value="minutes">MINUTES</option>
                      <option value="hours">HOURS</option>
                      <option value="days">DAYS</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DURATION_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      size="sm"
                      onClick={() => {
                        setDuration(preset.value);
                        setDurationUnit(preset.unit);
                      }}
                      disabled={busy}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <StatGrid className="mt-8 border border-line sm:grid-cols-3">
              <Stat label="STANDARD" value={standardLabel} />
              <Stat
                label="DURATION"
                value={
                  parsedForm.durationSeconds === null
                    ? '—'
                    : displayDuration(parsedForm.durationSeconds)
                }
              />
              <Stat
                label="ESCROW"
                value={<span className="text-gold-soft">IMMEDIATE</span>}
              />
            </StatGrid>

            <Button
              variant="solid"
              tone="gold"
              size="lg"
              fullWidth
              onClick={() => void submitSupplyDrop()}
              disabled={
                Boolean(disabledReason) || busy || phase === 'confirmed'
              }
              busy={busy}
              className="mt-5 font-semibold"
            >
              {phase === 'submitting'
                ? 'AUTHORIZE APPROVAL + CREATION…'
                : phase === 'confirming'
                  ? 'CONFIRMING SUPPLY_DROP…'
                  : phase === 'confirmed'
                    ? 'SUPPLY_DROP ARMED'
                    : disabledReason || 'APPROVE PRIZE + CREATE SUPPLY_DROP'}
            </Button>

            {parsedForm.error || authorizationError || submissionError ? (
              <Callout tone="warning" role="alert" className="mt-3">
                {submissionError || authorizationError || parsedForm.error}
              </Callout>
            ) : null}

            {lastTransactionHash ? (
              <Panel
                as="div"
                tone="gold"
                className="mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-label"
              >
                <span className="text-gold-soft">
                  {phase === 'confirmed'
                    ? 'SUPPLY_DROP ACTIVE'
                    : 'TRANSACTION SENT'}
                </span>
                <ExternalLink
                  href={voyagerTransactionUrl(lastTransactionHash)}
                  className="text-fg-muted"
                >
                  VIEW {shortAddress(lastTransactionHash)}
                </ExternalLink>
              </Panel>
            ) : null}
          </main>

          <aside className="border-b border-r border-line bg-surface-raised/30 p-5 sm:p-8">
            <Eyebrow>ATOMIC ARMING SEQUENCE</Eyebrow>
            <div className="relative mt-8 before:absolute before:bottom-5 before:left-5 before:top-5 before:w-px before:bg-surface-hover">
              <CircuitStep
                index="01"
                title="AUTHORIZE PRIZE"
                detail={
                  prizeKind === 'erc1155'
                    ? 'Grant the SupplyDrop contract operator approval for this collection.'
                    : 'Approve the selected amount or token ID for transfer.'
                }
                active={sequenceStep >= 1}
              />
              <CircuitStep
                index="02"
                title="LOCK ESCROW"
                detail="The SupplyDrop contract pulls and verifies the prize before the round activates."
                active={sequenceStep >= 2}
              />
              <CircuitStep
                index="03"
                title="OPEN SECTOR DRAW"
                detail="The timer starts in the same confirmed transaction. Gameplay continues."
                active={sequenceStep >= 3}
              />
            </div>

            <Panel as="div" className="mt-9 p-4">
              <div className="text-label text-fg-subtle">
                SUPPLY_DROP SYSTEM
              </div>
              <div className="mt-2 break-all text-caption text-fg-muted">
                {config.supplyDropSystemAddress || 'NOT CONFIGURED'}
              </div>
            </Panel>

            <Callout
              tone="gold"
              title="ESCROW IS FINAL FOR THE ROUND"
              className="mt-4 bg-gold/[0.04] py-3 pr-4"
            >
              <p className="text-fg-subtle">
                The prize leaves this wallet immediately. Only the selected
                winner can claim it after settlement. One active SupplyDrop is
                allowed globally.
              </p>
            </Callout>

            {prizeKind === 'erc1155' ? (
              <p className="mt-4 text-caption text-fg-subtle">
                ERC-1155 uses collection-wide operator approval. Revoke that
                approval from your wallet after creation if you do not want it
                to remain enabled.
              </p>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
