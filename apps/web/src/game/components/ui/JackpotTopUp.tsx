import { useEffect, useRef, useState } from 'react';
import {
  useProvider,
  useSendTransaction,
} from '@starknetfoundation/starknet-start-react';
import { shortString, TransactionExecutionStatus } from 'starknet';
import { useTransactionToast } from '../../contexts/TransactionToastContext';
import { useWallet } from '../../contexts/WalletContext';
import { config } from '../../services/config';
import {
  buildTopUpJackpotCalls,
  isJackpotTopUpOpen,
  parseTokenUnits,
} from '../../services/jackpot';
import {
  canCreateJackpot,
  getJackpotPrizeAmount,
} from '../../services/starknet';
import type { Jackpot } from '../../types';
import { addressesMatch, formatStrk } from '../../utils/format';
import { voyagerTransactionUrl } from '../../utils/voyager';
import { WalletButton } from './WalletButton';

export function JackpotTopUp({
  jackpot,
  now,
  onConfirmed,
}: {
  jackpot: Jackpot;
  now: number;
  onConfirmed: (id: bigint, amount: bigint) => void;
}) {
  const { address, chainId, isConnected } = useWallet();
  const { provider } = useProvider();
  const transaction = useSendTransaction({});
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const [authorization, setAuthorization] = useState<
    'checking' | 'allowed' | 'denied' | 'error'
  >('checking');
  const [accessRevision, setAccessRevision] = useState(0);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedHash, setConfirmedHash] = useState<string | null>(null);
  const correctNetwork = Boolean(
    chainId &&
      addressesMatch(
        chainId,
        shortString.encodeShortString(config.starknetChainId)
      )
  );

  useEffect(() => {
    if (!address || !isConnected || !correctNetwork || jackpot.prizeKind === 2)
      return;
    const controller = new AbortController();
    setAuthorization('checking');
    canCreateJackpot(address, controller.signal)
      .then((allowed) => {
        if (!controller.signal.aborted)
          setAuthorization(allowed ? 'allowed' : 'denied');
      })
      .catch(() => {
        if (!controller.signal.aborted) setAuthorization('error');
      });
    return () => controller.abort();
  }, [address, isConnected, correctNetwork, accessRevision, jackpot.prizeKind]);

  const isStrk =
    jackpot.prizeKind === 1 &&
    addressesMatch(jackpot.token, config.strkTokenAddress);
  const unit = isStrk
    ? 'STRK'
    : jackpot.prizeKind === 3
      ? `UNITS OF #${jackpot.tokenId}`
      : 'BASE UNITS';
  const open = isJackpotTopUpOpen(jackpot, now);
  let added: bigint | null = null;
  let validationError: string | null = null;
  if (amount.trim()) {
    try {
      added = parseTokenUnits(amount, isStrk ? 18 : 0);
      buildTopUpJackpotCalls({
        jackpotSystemAddress: config.jackpotSystemAddress,
        jackpot,
        amount: added,
        now,
      });
    } catch (reason) {
      validationError =
        reason instanceof Error ? reason.message : 'Check the top-up amount.';
    }
  }

  const submit = async () => {
    if (
      submitting.current ||
      !address ||
      !isConnected ||
      !correctNetwork ||
      authorization !== 'allowed' ||
      added === null ||
      validationError
    )
      return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    setConfirmedHash(null);
    let hash: string | null = null;
    try {
      // Recheck the deadline at submission, even if the rendered countdown is stale.
      const calls = buildTopUpJackpotCalls({
        jackpotSystemAddress: config.jackpotSystemAddress,
        jackpot,
        amount: added,
      });
      const result = await transaction.sendAsync(calls);
      hash = result.transaction_hash;
      notifySubmitting(hash, 'JACKPOT TOP-UP');
      await provider.waitForTransaction(hash, {
        errorStates: [TransactionExecutionStatus.REVERTED],
      });
      notifyConfirmed(hash);
      setConfirmedHash(hash);
      setAmount('');
      try {
        onConfirmed(jackpot.id, await getJackpotPrizeAmount(jackpot.id));
      } catch {
        setError(
          'Top-up confirmed. Refresh the current jackpot to see the updated prize.'
        );
      }
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'Jackpot top-up failed.';
      setError(message);
      if (hash) notifyFailed(hash, message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  if (jackpot.prizeKind === 2) return null;
  return (
    <div className="mt-8 border-t border-grid pt-6">
      <h3 className="text-[10px] tracking-[0.18em] text-[#d6a84b]">
        INCREASE JACKPOT
      </h3>
      <p className="mt-2 text-[10px] leading-5 text-neutral-500">
        Add the same prize token from your wallet. The deadline and draw stay
        unchanged.
      </p>
      {!open ? (
        <p className="mt-3 text-[10px] text-neutral-500">
          Top-ups are closed for this draw.
        </p>
      ) : !isConnected || !address ? (
        <div className="mt-4">
          <WalletButton />
        </div>
      ) : !correctNetwork ? (
        <p className="mt-3 text-[10px] text-amber-400">
          Switch your wallet to {config.starknetChainId} to add funds.
        </p>
      ) : authorization === 'checking' ? (
        <p className="mt-3 text-[10px] text-neutral-500" role="status">
          Checking creator access…
        </p>
      ) : authorization === 'error' ? (
        <button
          type="button"
          onClick={() => setAccessRevision((value) => value + 1)}
          className="mt-3 text-[10px] text-amber-400 underline"
        >
          Creator access check failed. Retry
        </button>
      ) : authorization === 'denied' ? (
        <p className="mt-3 text-[10px] text-neutral-500">
          Top-ups require the admin or jackpot creator role.
        </p>
      ) : (
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label
            htmlFor="jackpot-top-up-amount"
            className="block text-[9px] tracking-[0.16em] text-neutral-400"
          >
            AMOUNT TO ADD ({unit})
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="jackpot-top-up-amount"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError(null);
              }}
              inputMode={isStrk ? 'decimal' : 'numeric'}
              autoComplete="off"
              placeholder="0"
              disabled={busy}
              aria-invalid={Boolean(validationError)}
              aria-describedby="jackpot-top-up-feedback"
              className="min-w-0 flex-1 border border-neutral-700 bg-black px-3 py-3 text-sm text-white outline-none focus:border-[#d6a84b] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || added === null || Boolean(validationError)}
              className="border border-[#d6a84b] px-5 py-3 text-[9px] tracking-[0.16em] text-[#d6a84b] transition-colors hover:bg-[#d6a84b] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'CONFIRMING…' : 'ADD TO JACKPOT'}
            </button>
          </div>
          {!isStrk && jackpot.prizeKind === 1 ? (
            <p className="mt-2 text-[9px] leading-5 text-neutral-500">
              Enter whole base units, the token’s smallest denomination.
            </p>
          ) : null}
          {added !== null && !validationError ? (
            <p className="mt-3 break-words text-[10px] text-neutral-300">
              NEW PRIZE:{' '}
              {isStrk
                ? formatStrk(jackpot.amount + added, 18)
                : (jackpot.amount + added).toLocaleString()}{' '}
              {unit}
            </p>
          ) : null}
        </form>
      )}
      <div id="jackpot-top-up-feedback" aria-live="polite">
        {validationError || error ? (
          <p className="mt-3 break-words text-[10px] leading-5 text-amber-400">
            {error ?? validationError}
          </p>
        ) : null}
        {confirmedHash ? (
          <a
            href={voyagerTransactionUrl(confirmedHash)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-[10px] text-[#d6a84b] underline"
          >
            Top-up confirmed · View transaction
          </a>
        ) : null}
      </div>
    </div>
  );
}
