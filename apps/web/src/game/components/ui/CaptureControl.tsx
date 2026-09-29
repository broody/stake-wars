import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  useProvider,
  useSendTransaction,
} from '@starknetfoundation/starknet-start-react';
import { Link } from 'react-router-dom';
import { TransactionExecutionStatus } from 'starknet';
import type { SectorStatus } from '../../types';
import { useSectors } from '../../contexts/SectorContext';
import { useWallet } from '../../contexts/WalletContext';
import { useTransactionToast } from '../../contexts/TransactionToastContext';
import { config } from '../../services/config';
import { getSectorStatus, getOperatorStatus } from '../../services/starknet';
import {
  buildGameActionCalls,
  stakeDeficit,
} from '../../services/smartCapture';
import {
  addressesMatch,
  formatStrk,
  isZeroAddress,
  parseStrk,
} from '../../utils/format';
import { stakeRequestSearch } from '../../utils/stakingRequest';
import { ActionBrief, type ActionBriefKind } from './ActionBrief';
import { WalletButton } from './WalletButton';

interface CaptureControlProps {
  sectors: SectorStatus[];
}

type Phase = 'idle' | 'submitting' | 'confirming';
type Action = ActionBriefKind;

const MAX_U128 = (1n << 128n) - 1n;

const ACTION_COPY: Record<
  Action,
  { title: string; verb: string; toast: string; gerund: string }
> = {
  capture: {
    title: 'CAPTURE SECTOR',
    verb: 'CAPTURE',
    toast: 'CAPTURE',
    gerund: 'capturing',
  },
  takeover: {
    title: 'TAKE OVER SECTOR',
    verb: 'TAKE OVER',
    toast: 'TAKEOVER',
    gerund: 'taking over',
  },
  reinforce: {
    title: 'REINFORCE SECTOR',
    verb: 'REINFORCE',
    toast: 'REINFORCEMENT',
    gerund: 'reinforcing',
  },
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span>{label}</span>
      <span className="text-right tabular-nums text-neutral-300">
        {children}
      </span>
    </div>
  );
}

export function CaptureControl({ sectors }: CaptureControlProps) {
  const sector = sectors[0];
  const { address, isConnected } = useWallet();
  const {
    operatorStatus,
    refreshSector,
    refreshOperator,
    refreshSectorIndex,
    setSectorInteractionLocked,
  } = useSectors();
  const { provider } = useProvider();
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const transaction = useSendTransaction({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [allocation, setAllocation] = useState('');

  const action: Action =
    !sector || isZeroAddress(sector.controller)
      ? 'capture'
      : address && addressesMatch(sector.controller, address)
        ? 'reinforce'
        : 'takeover';
  const copy = ACTION_COPY[action];
  const availableForce = operatorStatus?.availableForce ?? 0n;
  const requiredForce = sector?.requiredStake ?? 0n;
  const suggestedAllocation = action === 'reinforce' ? 0n : requiredForce;

  useEffect(() => {
    setError(null);
    setAllocation(
      suggestedAllocation > 0n ? formatStrk(suggestedAllocation, 18) : ''
    );
  }, [action, sector?.id, suggestedAllocation]);

  const parsedAllocation = useMemo(() => {
    if (!allocation.trim()) return { value: 0n, error: null };
    try {
      const value = parseStrk(allocation, 'FORCE');
      return value > MAX_U128
        ? { value: null, error: 'Allocation is too large.' }
        : { value, error: null };
    } catch (reason) {
      return {
        value: null,
        error:
          reason instanceof Error ? reason.message : 'Enter a valid amount.',
      };
    }
  }, [allocation]);
  const selectedAllocation = parsedAllocation.value;
  const requestedForce = selectedAllocation ?? 0n;
  const deficit = stakeDeficit(requestedForce, availableForce);

  const disabledReason = useMemo(() => {
    if (sectors.length !== 1 || !sector) return 'SELECT ONE SECTOR';
    if (!isConnected || !address) return 'CONNECT WALLET';
    if (!operatorStatus) return 'WAITING FOR OPERATOR STATE';
    if (operatorStatus.retired) return 'ADDRESS PERMANENTLY RETIRED';
    if (operatorStatus.needsSync) return 'OPERATOR SYNC REQUIRED';
    if (parsedAllocation.error) return 'ENTER A VALID FORCE AMOUNT';
    if (selectedAllocation === null || selectedAllocation === 0n)
      return 'ENTER FORCE AMOUNT';
    if (action !== 'reinforce' && selectedAllocation < requiredForce) {
      return `COMMIT AT LEAST ${formatStrk(requiredForce, 18)} FORCE`;
    }
    return null;
  }, [
    action,
    address,
    isConnected,
    operatorStatus,
    parsedAllocation.error,
    requiredForce,
    sector,
    sectors.length,
    selectedAllocation,
  ]);

  const submit = async () => {
    if (
      !sector ||
      !address ||
      !config.controlSystemAddress ||
      disabledReason ||
      selectedAllocation === null
    ) {
      return;
    }
    setError(null);
    setPhase('submitting');
    setSectorInteractionLocked(true);
    let hash: string | null = null;
    try {
      const [freshSector, freshOperator] = await Promise.all([
        getSectorStatus(sector.id),
        getOperatorStatus(address),
      ]);
      const freshlyOwned =
        !isZeroAddress(freshSector.controller) &&
        addressesMatch(freshSector.controller, address);
      if (action === 'reinforce' && !freshlyOwned) {
        throw new Error('You no longer control this Sector.');
      }
      if (action !== 'reinforce' && freshlyOwned) {
        throw new Error('You already control this Sector.');
      }
      if (
        action !== 'reinforce' &&
        selectedAllocation < freshSector.requiredStake
      ) {
        throw new Error(
          `This Sector now needs at least ${formatStrk(
            freshSector.requiredStake,
            18
          )} FORCE.`
        );
      }
      const freshDeficit = stakeDeficit(
        selectedAllocation,
        freshOperator.availableForce
      );
      if (freshDeficit > 0n) {
        throw new Error(
          `Stake ${formatStrk(freshDeficit, 18)} more STRK before ${copy.gerund}.`
        );
      }

      const calls = buildGameActionCalls({
        controlSystemAddress: config.controlSystemAddress,
        entrypoint: action === 'reinforce' ? 'reinforce' : 'capture',
        calldata: [String(sector.id), selectedAllocation.toString()],
      });
      const result = await transaction.sendAsync(calls);
      hash = result.transaction_hash;
      notifySubmitting(
        hash,
        `SECTOR-${String(sector.id).padStart(4, '0')} ${copy.toast}`
      );
      setPhase('confirming');
      await provider.waitForTransaction(hash, {
        errorStates: [TransactionExecutionStatus.REVERTED],
      });
      notifyConfirmed(hash);
      refreshSector();
      refreshOperator();
      refreshSectorIndex();
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'Transaction failed.';
      setError(message);
      if (hash) notifyFailed(hash, message);
    } finally {
      setPhase('idle');
      setSectorInteractionLocked(false);
    }
  };

  const label =
    phase === 'submitting'
      ? 'AUTHORIZING…'
      : phase === 'confirming'
        ? 'CONFIRMING…'
        : disabledReason
          ? `${copy.verb} · ${disabledReason}`
          : `${copy.verb} · ${formatStrk(requestedForce, 18)} FORCE`;

  return (
    <section className="mt-4 border border-neutral-600 bg-neutral-950">
      <header className="flex items-center justify-between gap-3 border-b border-grid px-3 py-2 text-[10px] tracking-[0.18em] text-neutral-300">
        <span>{copy.title}</span>
        <span className="text-[8px] text-dim">FORCE ACTION</span>
      </header>
      <ActionBrief kind={action} />
      <div className="space-y-2 px-3 py-3 text-[9px] tracking-[0.12em] text-neutral-500">
        <label
          className="block pt-1 text-dim"
          htmlFor={`allocation-${sector?.id ?? 'none'}`}
        >
          {action === 'reinforce' ? 'ADD FORCE' : 'YOUR DEFENSE'}
        </label>
        <div className="flex items-center border border-neutral-700 bg-black focus-within:border-white">
          <input
            id={`allocation-${sector?.id ?? 'none'}`}
            value={allocation}
            onChange={(event) => setAllocation(event.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-fg outline-none"
          />
          <span className="px-2 text-dim">FORCE</span>
        </div>
        {parsedAllocation.error && (
          <div className="leading-relaxed text-amber-400">
            {parsedAllocation.error}
          </div>
        )}
        {action === 'reinforce' ? (
          <Row label="RESULTING DEFENSE">
            {formatStrk((sector?.captureForce ?? 0n) + requestedForce, 18)}{' '}
            FORCE
          </Row>
        ) : (
          <Row label="MINIMUM">{formatStrk(requiredForce, 18)} FORCE</Row>
        )}
        <Row label="AVAILABLE">{formatStrk(availableForce, 18)} FORCE</Row>
        {error && (
          <div className="border-l-2 border-amber-400 pl-2 leading-relaxed text-amber-400">
            ACTION FAILED · {error}
          </div>
        )}
        {!isConnected || !address ? (
          <div className="mt-2">
            <WalletButton
              variant="block"
              label={`CONNECT WALLET TO ${copy.verb}`}
            />
          </div>
        ) : deficit > 0n && !disabledReason ? (
          <Link
            to={{
              pathname: '/staking',
              search: stakeRequestSearch(deficit),
            }}
            className="force-alert-button mt-2 block w-full border px-3 py-2.5 text-center text-[10px] font-semibold tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2"
          >
            STAKE {formatStrk(deficit, 18)} STRK TO {copy.verb}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={Boolean(disabledReason) || phase !== 'idle'}
            className="mt-2 w-full border border-white bg-white px-3 py-2.5 text-[10px] font-semibold tracking-[0.18em] text-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-500"
          >
            {label}
          </button>
        )}
      </div>
    </section>
  );
}
