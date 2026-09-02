import { useEffect, useMemo, useState } from 'react';
import {
  useProvider,
  useSendTransaction,
} from '@starknetfoundation/starknet-start-react';
import { TransactionExecutionStatus } from 'starknet';
import { WalletButton } from '../components/ui/WalletButton';
import { useTransactionToast } from '../contexts/TransactionToastContext';
import { useWallet } from '../contexts/WalletContext';
import { config } from '../services/config';
import {
  buildCreateJackpotCalls,
  normalizeContractAddress,
  parseDurationSeconds,
  parseTokenId,
  parseTokenUnits,
  type JackpotDurationUnit,
  type JackpotPrizeKind,
} from '../services/jackpot';
import { canCreateJackpot } from '../services/starknet';
import { shortAddress } from '../utils/format';
import { voyagerTransactionUrl } from '../utils/voyager';

type SubmissionPhase = 'idle' | 'submitting' | 'confirming' | 'confirmed';
type AuthorizationState = 'idle' | 'checking' | 'allowed' | 'denied' | 'error';

const PRIZE_OPTIONS: Array<{
  kind: JackpotPrizeKind;
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
  unit: JackpotDurationUnit;
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
    <label
      htmlFor={htmlFor}
      className="block text-[9px] tracking-[0.2em] text-neutral-500"
    >
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
        className={`relative z-[1] flex h-10 w-10 items-center justify-center border text-[10px] transition-colors motion-reduce:transition-none ${
          active
            ? 'border-[#d6a84b] bg-[#d6a84b] text-black'
            : 'border-neutral-700 bg-black text-neutral-500'
        }`}
      >
        {index}
      </div>
      <div className="pt-0.5">
        <div
          className={`text-[10px] tracking-[0.18em] ${active ? 'text-[#e4bd6b]' : 'text-neutral-300'}`}
        >
          {title}
        </div>
        <p className="mt-1 text-[10px] leading-5 text-neutral-600">{detail}</p>
      </div>
    </div>
  );
}

export function JackpotCreator() {
  const { address, chainId, isConnected } = useWallet();
  const { provider } = useProvider();
  const transaction = useSendTransaction({});
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const [prizeKind, setPrizeKind] = useState<JackpotPrizeKind>('erc20');
  const [tokenAddress, setTokenAddress] = useState(config.strkTokenAddress);
  const [tokenId, setTokenId] = useState('0');
  const [amount, setAmount] = useState('1');
  const [decimals, setDecimals] = useState('18');
  const [duration, setDuration] = useState('7');
  const [durationUnit, setDurationUnit] = useState<JackpotDurationUnit>('days');
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

  useEffect(() => {
    const controller = new AbortController();
    setAuthorizationError(null);
    setLastTransactionHash(null);
    setPhase('idle');

    if (!address) {
      setAuthorization('idle');
      return () => controller.abort();
    }

    setAuthorization('checking');
    canCreateJackpot(address, controller.signal)
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
            : 'Unable to verify jackpot creator access.'
        );
      });
    return () => controller.abort();
  }, [address]);

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
  const disabledReason = !config.jackpotSystemAddress
    ? 'JACKPOT SYSTEM NOT CONFIGURED'
    : !isConnected || !address
      ? 'CONNECT READY WALLET'
      : authorization === 'checking'
        ? 'CHECKING CREATOR ROLE'
        : authorization === 'denied'
          ? 'WALLET IS NOT A CREATOR'
          : authorization === 'error'
            ? 'CREATOR CHECK FAILED'
            : parsedForm.error
              ? 'CHECK PRIZE DETAILS'
              : null;

  const submitJackpot = async () => {
    if (
      disabledReason ||
      !parsedForm.tokenAddress ||
      parsedForm.tokenId === null ||
      parsedForm.amount === null ||
      parsedForm.durationSeconds === null
    ) {
      return;
    }

    let hash: string | null = null;
    setSubmissionError(null);
    setLastTransactionHash(null);
    setPhase('submitting');

    try {
      const calls = buildCreateJackpotCalls({
        jackpotSystemAddress: config.jackpotSystemAddress,
        prizeKind,
        tokenAddress: parsedForm.tokenAddress,
        tokenId: parsedForm.tokenId,
        amount: parsedForm.amount,
        durationSeconds: parsedForm.durationSeconds,
      });
      const result = await transaction.sendAsync(calls);
      hash = result.transaction_hash;
      setLastTransactionHash(hash);
      notifySubmitting(hash, 'JACKPOT CREATION');
      setPhase('confirming');
      await provider.waitForTransaction(hash, {
        errorStates: [TransactionExecutionStatus.REVERTED],
      });
      notifyConfirmed(hash);
      setPhase('confirmed');
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'Jackpot creation failed.';
      setSubmissionError(message);
      setPhase('idle');
      if (hash) notifyFailed(hash, message);
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
    <div className="h-full w-full overflow-y-auto bg-bg font-mono">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(115deg,transparent_0%,transparent_58%,rgba(214,168,75,0.035)_58%,rgba(214,168,75,0.035)_100%)]" />
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-24 sm:px-6">
        <header className="grid gap-6 border-b border-grid pb-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3 text-[9px] tracking-[0.22em] text-neutral-500">
              <span>INTERNAL TOOL</span>
              <span className="text-neutral-700">//</span>
              <span>SEPOLIA</span>
              <span className="border border-[#d6a84b]/50 px-2 py-1 text-[#d6a84b]">
                UNLISTED ROUTE
              </span>
            </div>
            <h1 className="mt-3 text-4xl font-bold tracking-[-0.075em] text-white sm:text-6xl">
              JACKPOT FOUNDRY
            </h1>
            <p className="mt-3 max-w-2xl text-[11px] leading-5 text-neutral-500">
              Arm one prize round. Approval and escrow execute atomically, so a
              failed creation leaves no partial Jackpot transaction behind.
            </p>
          </div>
          <div className="grid grid-cols-2 border-l border-t border-grid text-[8px] tracking-[0.16em] sm:min-w-[320px]">
            <div className="border-b border-r border-grid px-4 py-3 text-neutral-600">
              NETWORK
              <div className="mt-1 text-[10px] text-neutral-300">
                {chainId ?? 'DISCONNECTED'}
              </div>
            </div>
            <div className="border-b border-r border-grid px-4 py-3 text-neutral-600">
              ACCESS
              <div
                className={`mt-1 text-[10px] ${authorization === 'allowed' ? 'text-[#e4bd6b]' : 'text-neutral-300'}`}
              >
                {accessLabel}
              </div>
            </div>
          </div>
        </header>

        <div className="mt-7 grid border-l border-t border-grid lg:grid-cols-[1.45fr_0.75fr]">
          <main className="border-b border-r border-grid p-5 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[9px] tracking-[0.22em] text-[#d6a84b]">
                  PRIZE LOADOUT
                </div>
                <h2 className="mt-2 text-xl tracking-[0.12em] text-white">
                  CONFIGURE ROUND
                </h2>
              </div>
              {address ? (
                <div className="text-right text-[8px] tracking-[0.15em] text-neutral-600">
                  SPONSOR
                  <div className="mt-1 text-[10px] text-neutral-400">
                    {shortAddress(address)}
                  </div>
                </div>
              ) : (
                <WalletButton />
              )}
            </div>

            <fieldset className="mt-8">
              <legend className="text-[9px] tracking-[0.2em] text-neutral-500">
                TOKEN STANDARD
              </legend>
              <div className="mt-2 grid grid-cols-3 border-l border-t border-neutral-700">
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
                    className={`border-b border-r px-2 py-4 text-left transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-white disabled:cursor-wait motion-reduce:transition-none sm:px-4 ${
                      prizeKind === option.kind
                        ? 'border-[#d6a84b] bg-[#d6a84b]/10 text-white'
                        : 'border-neutral-700 text-neutral-500 hover:bg-neutral-950 hover:text-neutral-200'
                    }`}
                  >
                    <span className="block text-[10px] tracking-[0.16em] sm:text-xs">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-[7px] tracking-[0.18em] text-neutral-600">
                      {option.detail}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-7">
              <InputLabel htmlFor="jackpot-token-address">
                TOKEN CONTRACT
              </InputLabel>
              <input
                id="jackpot-token-address"
                value={tokenAddress}
                onChange={(event) => setTokenAddress(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                className="mt-2 w-full border border-neutral-700 bg-black px-4 py-3 text-xs text-white outline-none transition-colors placeholder:text-neutral-800 focus:border-[#d6a84b] disabled:cursor-wait motion-reduce:transition-none"
                placeholder="0x…"
              />
              {prizeKind === 'erc20' && config.strkTokenAddress ? (
                <button
                  type="button"
                  onClick={() => {
                    setTokenAddress(config.strkTokenAddress);
                    setDecimals('18');
                  }}
                  disabled={busy}
                  className="mt-2 border-b border-neutral-700 pb-0.5 text-[8px] tracking-[0.17em] text-neutral-500 transition-colors hover:border-[#d6a84b] hover:text-[#d6a84b] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  USE SEPOLIA STRK
                </button>
              ) : null}
            </div>

            <div
              className={`mt-7 grid gap-5 ${prizeKind === 'erc20' ? 'sm:grid-cols-[1fr_150px]' : prizeKind === 'erc1155' ? 'sm:grid-cols-2' : ''}`}
            >
              {prizeKind !== 'erc721' ? (
                <div>
                  <InputLabel htmlFor="jackpot-amount">
                    {prizeKind === 'erc20'
                      ? 'PRIZE AMOUNT'
                      : 'EDITION QUANTITY'}
                  </InputLabel>
                  <input
                    id="jackpot-amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode={prizeKind === 'erc20' ? 'decimal' : 'numeric'}
                    autoComplete="off"
                    disabled={busy}
                    className="mt-2 w-full border border-neutral-700 bg-black px-4 py-4 text-xl tabular-nums text-white outline-none transition-colors placeholder:text-neutral-800 focus:border-[#d6a84b] disabled:cursor-wait motion-reduce:transition-none"
                    placeholder="1"
                  />
                </div>
              ) : null}

              {prizeKind === 'erc20' ? (
                <div>
                  <InputLabel htmlFor="jackpot-decimals">
                    TOKEN DECIMALS
                  </InputLabel>
                  <input
                    id="jackpot-decimals"
                    value={decimals}
                    onChange={(event) => setDecimals(event.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    disabled={busy}
                    className="mt-2 w-full border border-neutral-700 bg-black px-4 py-4 text-xl tabular-nums text-white outline-none transition-colors focus:border-[#d6a84b] disabled:cursor-wait motion-reduce:transition-none"
                  />
                </div>
              ) : null}

              {prizeKind !== 'erc20' ? (
                <div>
                  <InputLabel htmlFor="jackpot-token-id">TOKEN ID</InputLabel>
                  <input
                    id="jackpot-token-id"
                    value={tokenId}
                    onChange={(event) => setTokenId(event.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    disabled={busy}
                    className="mt-2 w-full border border-neutral-700 bg-black px-4 py-4 text-xl tabular-nums text-white outline-none transition-colors focus:border-[#d6a84b] disabled:cursor-wait motion-reduce:transition-none"
                    placeholder="0"
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-8 border-t border-grid pt-7">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <InputLabel htmlFor="jackpot-duration">
                    ROUND LENGTH
                  </InputLabel>
                  <div className="mt-2 flex border border-neutral-700 focus-within:border-[#d6a84b]">
                    <input
                      id="jackpot-duration"
                      value={duration}
                      onChange={(event) => setDuration(event.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={busy}
                      className="w-28 min-w-0 bg-black px-4 py-3 text-lg tabular-nums text-white outline-none disabled:cursor-wait"
                    />
                    <select
                      aria-label="Jackpot duration unit"
                      value={durationUnit}
                      onChange={(event) =>
                        setDurationUnit(
                          event.target.value as JackpotDurationUnit
                        )
                      }
                      disabled={busy}
                      className="border-l border-neutral-700 bg-black px-3 text-[9px] tracking-[0.14em] text-neutral-300 outline-none disabled:cursor-wait"
                    >
                      <option value="minutes">MINUTES</option>
                      <option value="hours">HOURS</option>
                      <option value="days">DAYS</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setDuration(preset.value);
                        setDurationUnit(preset.unit);
                      }}
                      disabled={busy}
                      className="border border-neutral-700 px-3 py-2 text-[8px] tracking-[0.14em] text-neutral-500 transition-colors hover:border-[#d6a84b] hover:text-[#d6a84b] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 grid border-l border-t border-grid sm:grid-cols-3">
              <div className="border-b border-r border-grid px-4 py-3">
                <div className="text-[8px] tracking-[0.17em] text-neutral-600">
                  STANDARD
                </div>
                <div className="mt-1 text-[10px] text-neutral-300">
                  {standardLabel}
                </div>
              </div>
              <div className="border-b border-r border-grid px-4 py-3">
                <div className="text-[8px] tracking-[0.17em] text-neutral-600">
                  DURATION
                </div>
                <div className="mt-1 text-[10px] text-neutral-300">
                  {parsedForm.durationSeconds === null
                    ? '—'
                    : displayDuration(parsedForm.durationSeconds)}
                </div>
              </div>
              <div className="border-b border-r border-grid px-4 py-3">
                <div className="text-[8px] tracking-[0.17em] text-neutral-600">
                  ESCROW
                </div>
                <div className="mt-1 text-[10px] text-[#e4bd6b]">IMMEDIATE</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void submitJackpot()}
              disabled={Boolean(disabledReason) || busy}
              className="mt-5 w-full border border-[#d6a84b] bg-[#d6a84b] px-4 py-4 text-[10px] font-semibold tracking-[0.22em] text-black transition-colors hover:bg-black hover:text-[#e4bd6b] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-950 disabled:text-neutral-600 motion-reduce:transition-none"
            >
              {phase === 'submitting'
                ? 'AUTHORIZE APPROVAL + CREATION…'
                : phase === 'confirming'
                  ? 'CONFIRMING JACKPOT…'
                  : phase === 'confirmed'
                    ? 'JACKPOT ARMED'
                    : disabledReason || 'APPROVE PRIZE + CREATE JACKPOT'}
            </button>

            {parsedForm.error || authorizationError || submissionError ? (
              <p
                role="alert"
                className="mt-3 border-l border-amber-500 pl-3 text-[10px] leading-5 text-amber-400"
              >
                {submissionError || authorizationError || parsedForm.error}
              </p>
            ) : null}

            {lastTransactionHash ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-[#d6a84b]/40 bg-[#d6a84b]/[0.04] px-4 py-3 text-[9px] tracking-[0.14em]">
                <span className="text-[#e4bd6b]">
                  {phase === 'confirmed'
                    ? 'JACKPOT ACTIVE'
                    : 'TRANSACTION SENT'}
                </span>
                <a
                  href={voyagerTransactionUrl(lastTransactionHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="border-b border-neutral-600 pb-0.5 text-neutral-400 transition-colors hover:border-white hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  VIEW {shortAddress(lastTransactionHash)} ↗
                </a>
              </div>
            ) : null}
          </main>

          <aside className="border-b border-r border-grid bg-neutral-950/30 p-5 sm:p-8">
            <div className="text-[9px] tracking-[0.22em] text-neutral-500">
              ATOMIC ARMING SEQUENCE
            </div>
            <div className="relative mt-8 before:absolute before:bottom-5 before:left-5 before:top-5 before:w-px before:bg-neutral-800">
              <CircuitStep
                index="01"
                title="AUTHORIZE PRIZE"
                detail={
                  prizeKind === 'erc1155'
                    ? 'Grant the Jackpot contract operator approval for this collection.'
                    : 'Approve the selected amount or token ID for transfer.'
                }
                active={sequenceStep >= 1}
              />
              <CircuitStep
                index="02"
                title="LOCK ESCROW"
                detail="The Jackpot contract pulls and verifies the prize before the round activates."
                active={sequenceStep >= 2}
              />
              <CircuitStep
                index="03"
                title="OPEN SECTOR DRAW"
                detail="The timer starts in the same confirmed transaction. Gameplay continues."
                active={sequenceStep >= 3}
              />
            </div>

            <div className="mt-9 border border-neutral-800 p-4">
              <div className="text-[8px] tracking-[0.18em] text-neutral-600">
                JACKPOT SYSTEM
              </div>
              <div className="mt-2 break-all text-[9px] leading-5 text-neutral-400">
                {config.jackpotSystemAddress || 'NOT CONFIGURED'}
              </div>
            </div>

            <div className="mt-4 border-l border-[#d6a84b] bg-[#d6a84b]/[0.04] px-4 py-3">
              <div className="text-[8px] tracking-[0.18em] text-[#d6a84b]">
                ESCROW IS FINAL FOR THE ROUND
              </div>
              <p className="mt-2 text-[10px] leading-5 text-neutral-500">
                The prize leaves this wallet immediately. Only the selected
                winner can claim it after settlement. One active Jackpot is
                allowed globally.
              </p>
            </div>

            {prizeKind === 'erc1155' ? (
              <p className="mt-4 text-[9px] leading-5 text-neutral-600">
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
