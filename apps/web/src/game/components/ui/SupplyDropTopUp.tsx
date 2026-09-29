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
  buildTopUpSupplyDropCalls,
  isSupplyDropTopUpOpen,
  parseTokenUnits,
} from '../../services/supplyDrop';
import {
  canCreateSupplyDrop,
  getSupplyDropPrizeAmount,
} from '../../services/starknet';
import type { SupplyDrop } from '../../types';
import { addressesMatch, formatStrk } from '../../utils/format';
import { voyagerTransactionUrl } from '../../utils/voyager';
import { WalletButton } from './WalletButton';
import { Button, Callout, ExternalLink, textLinkStyles } from '../../../ui';

export function SupplyDropTopUp({
  supplyDrop,
  now,
  onConfirmed,
}: {
  supplyDrop: SupplyDrop;
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
    if (
      !address ||
      !isConnected ||
      !correctNetwork ||
      supplyDrop.prizeKind === 2
    )
      return;
    const controller = new AbortController();
    setAuthorization('checking');
    canCreateSupplyDrop(address, controller.signal)
      .then((allowed) => {
        if (!controller.signal.aborted)
          setAuthorization(allowed ? 'allowed' : 'denied');
      })
      .catch(() => {
        if (!controller.signal.aborted) setAuthorization('error');
      });
    return () => controller.abort();
  }, [
    address,
    isConnected,
    correctNetwork,
    accessRevision,
    supplyDrop.prizeKind,
  ]);

  const isStrk =
    supplyDrop.prizeKind === 1 &&
    addressesMatch(supplyDrop.token, config.strkTokenAddress);
  const unit = isStrk
    ? 'STRK'
    : supplyDrop.prizeKind === 3
      ? `UNITS OF #${supplyDrop.tokenId}`
      : 'BASE UNITS';
  const open = isSupplyDropTopUpOpen(supplyDrop, now);
  let added: bigint | null = null;
  let validationError: string | null = null;
  if (amount.trim()) {
    try {
      added = parseTokenUnits(amount, isStrk ? 18 : 0);
      buildTopUpSupplyDropCalls({
        supplyDropSystemAddress: config.supplyDropSystemAddress,
        supplyDrop,
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
      const calls = buildTopUpSupplyDropCalls({
        supplyDropSystemAddress: config.supplyDropSystemAddress,
        supplyDrop,
        amount: added,
      });
      const result = await transaction.sendAsync(calls);
      hash = result.transaction_hash;
      notifySubmitting(hash, 'SUPPLY_DROP TOP-UP');
      await provider.waitForTransaction(hash, {
        errorStates: [TransactionExecutionStatus.REVERTED],
      });
      notifyConfirmed(hash);
      setConfirmedHash(hash);
      setAmount('');
      try {
        onConfirmed(
          supplyDrop.id,
          await getSupplyDropPrizeAmount(supplyDrop.id)
        );
      } catch {
        setError(
          'Top-up confirmed. Refresh the current supply drop to see the updated prize.'
        );
      }
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'SupplyDrop top-up failed.';
      setError(message);
      if (hash) notifyFailed(hash, message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  if (supplyDrop.prizeKind === 2) return null;
  return (
    <div className="mt-8 border-t border-line pt-6">
      <h3 className="text-label text-gold">INCREASE SUPPLY_DROP</h3>
      <p className="mt-2 text-caption text-fg-subtle">
        Add the same prize token from your wallet. The deadline and draw stay
        unchanged.
      </p>
      {!open ? (
        <p className="mt-3 text-caption text-fg-subtle">
          Top-ups are closed for this draw.
        </p>
      ) : !isConnected || !address ? (
        <div className="mt-4">
          <WalletButton />
        </div>
      ) : !correctNetwork ? (
        <p className="mt-3 text-caption text-warning">
          Switch your wallet to {config.starknetChainId} to add funds.
        </p>
      ) : authorization === 'checking' ? (
        <p className="mt-3 text-caption text-fg-subtle" role="status">
          Checking creator access…
        </p>
      ) : authorization === 'error' ? (
        <button
          type="button"
          onClick={() => setAccessRevision((value) => value + 1)}
          className={textLinkStyles('warning', 'mt-3 text-caption')}
        >
          Creator access check failed. Retry
        </button>
      ) : authorization === 'denied' ? (
        <p className="mt-3 text-caption text-fg-subtle">
          Top-ups require the admin or supplyDrop creator role.
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
            htmlFor="supply-drop-top-up-amount"
            className="block text-label text-fg-muted"
          >
            AMOUNT TO ADD ({unit})
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="supply-drop-top-up-amount"
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
              aria-describedby="supply-drop-top-up-feedback"
              className="min-w-0 flex-1 border border-line-strong bg-surface px-3 py-3 text-body text-fg outline-none focus:border-gold disabled:opacity-50"
            />
            <Button
              type="submit"
              variant="outline"
              tone="gold"
              disabled={added === null || Boolean(validationError)}
              busy={busy}
              className="px-5"
            >
              {busy ? 'CONFIRMING…' : 'ADD TO SUPPLY_DROP'}
            </Button>
          </div>
          {!isStrk && supplyDrop.prizeKind === 1 ? (
            <p className="mt-2 text-caption text-fg-subtle">
              Enter whole base units, the token’s smallest denomination.
            </p>
          ) : null}
          {added !== null && !validationError ? (
            <p className="mt-3 break-words text-caption text-fg-secondary">
              NEW PRIZE:{' '}
              {isStrk
                ? formatStrk(supplyDrop.amount + added, 18)
                : (supplyDrop.amount + added).toLocaleString()}{' '}
              {unit}
            </p>
          ) : null}
        </form>
      )}
      <div id="supply-drop-top-up-feedback" aria-live="polite">
        {validationError || error ? (
          <Callout tone="warning" className="mt-3 break-words">
            {error ?? validationError}
          </Callout>
        ) : null}
        {confirmedHash ? (
          <ExternalLink
            href={voyagerTransactionUrl(confirmedHash)}
            tone="gold"
            className="mt-3 inline-block text-caption"
          >
            Top-up confirmed · View transaction
          </ExternalLink>
        ) : null}
      </div>
    </div>
  );
}
