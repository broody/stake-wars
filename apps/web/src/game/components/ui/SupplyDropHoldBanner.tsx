import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useProvider,
  useSendTransaction,
} from '@starknetfoundation/starknet-start-react';
import { TransactionExecutionStatus } from 'starknet';
import { useWallet } from '../../contexts/WalletContext';
import { useSectors } from '../../contexts/SectorContext';
import { useYield } from '../../contexts/useYield';
import { useTransactionToast } from '../../contexts/TransactionToastContext';
import {
  getSupplyDropHold,
  type SupplyDropHold,
} from '../../services/starknet';
import { prepareSupplyDropRecovery } from '../../services/supplyDropClaims';
import { formatStrk } from '../../utils/format';

export function SupplyDropHoldBanner() {
  const { address } = useWallet();
  const { operatorStatus, refreshOperator } = useSectors();
  const { refreshStaking } = useYield();
  const { provider } = useProvider();
  const transaction = useSendTransaction({});
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const [hold, setHold] = useState<SupplyDropHold | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    setHold(null);
    setError(null);
    if (!address) return;
    const controller = new AbortController();
    getSupplyDropHold(address, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setHold(value);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Could not verify the Supply Drop hold.'
          );
      });
    return () => controller.abort();
  }, [address, revision]);

  useEffect(() => {
    if (!address) return;
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener('supply-drop-updated', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('supply-drop-updated', refresh);
    };
  }, [address, refresh]);

  async function recover() {
    if (!address || pending) return;
    setPending(true);
    setError(null);
    let hash: string | null = null;
    try {
      const calls = await prepareSupplyDropRecovery(address);
      if (calls.length > 0) {
        const result = await transaction.sendAsync(calls);
        hash = result.transaction_hash;
        notifySubmitting(hash, 'STAKE SUPPLY DROP');
        await provider.waitForTransaction(hash, {
          errorStates: [TransactionExecutionStatus.REVERTED],
        });
        notifyConfirmed(hash);
        refreshOperator();
        refreshStaking();
      }
      refresh();
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : 'Could not stake your Supply Drop.';
      setError(message);
      if (hash) notifyFailed(hash, message);
    } finally {
      setPending(false);
    }
  }

  if (!address || (!hold?.held && !error)) return null;
  const retired = Boolean(operatorStatus?.retired);
  return (
    <aside
      aria-label="Supply Drop staking requirement"
      className="absolute left-4 right-4 top-20 z-30 border border-[#d6a84b]/60 bg-black/95 p-4 text-[10px] leading-5 text-neutral-300 sm:left-auto sm:w-96"
    >
      {hold?.held ? (
        <>
          <h2 className="font-bold tracking-widest text-[#d6a84b]">
            SUPPLY DROP · STAKING REQUIRED
          </h2>
          <p className="mt-2">
            Stake {formatStrk(hold.remainingStake, 6)} more STRK to clear your
            Drop hold. Sector actions and image changes are paused; opponents
            can still challenge your Sectors.
          </p>
          <p className="mt-1 text-neutral-500">
            {formatStrk(hold.liveStake, 6)} /{' '}
            {formatStrk(hold.requiredStake, 6)} STRK staked
          </p>
          {retired || hold.exiting ? (
            <p className="mt-2 text-amber-400">
              This account is retired or exiting. Clearing a Drop hold cannot
              restore gameplay.
            </p>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => void recover()}
              className="mt-3 border border-[#d6a84b] px-3 py-2 text-[#d6a84b] disabled:opacity-50"
            >
              {pending ? 'STAKING…' : 'STAKE REMAINING DROP'}
            </button>
          )}
          <Link to="/staking" className="ml-3 underline">
            View staking
          </Link>
        </>
      ) : (
        <h2 className="font-bold text-amber-400">
          Supply Drop status unavailable
        </h2>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-amber-400">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="mt-2 block text-neutral-400 underline"
      >
        Refresh status
      </button>
    </aside>
  );
}
