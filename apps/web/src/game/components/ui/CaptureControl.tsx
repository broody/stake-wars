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
import { WalletButton } from './WalletButton';
import { Button, Callout, Panel, buttonStyles } from '../../../ui';

interface CaptureControlProps {
  sectors: SectorStatus[];
}

type Phase = 'idle' | 'submitting' | 'confirming';
type Action = 'capture' | 'takeover' | 'reinforce';

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
      <span className="min-w-0 break-words text-right tabular-nums text-fg-secondary">
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
    rememberSectorStatus,
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
  }, [action, sector?.id]);

  useEffect(() => {
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
      // The panel reads Torii, which may trail the chain; show what the chain
      // says before deciding anything.
      rememberSectorStatus(freshSector);
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
      if (
        action !== 'reinforce' &&
        freshSector.requiredStake < sector.requiredStake &&
        selectedAllocation > freshSector.requiredStake
      ) {
        throw new Error(
          `This Sector now needs only ${formatStrk(
            freshSector.requiredStake,
            18
          )} FORCE. Check the amount and try again.`
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
    <Panel tone="strong" className="mt-4 bg-surface-raised">
      <header className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 text-label text-fg-secondary">
        <span>{copy.title}</span>
        <span className="text-tag text-fg-subtle">FORCE ACTION</span>
      </header>
      <div className="space-y-2 px-3 py-3 text-label text-fg-subtle">
        {action === 'reinforce' ? (
          <label
            className="block pt-1 text-fg-subtle"
            htmlFor={`allocation-${sector?.id ?? 'none'}`}
          >
            ADD FORCE
          </label>
        ) : null}
        <div className="flex items-center border border-line-strong bg-surface focus-within:border-fg">
          <input
            id={`allocation-${sector?.id ?? 'none'}`}
            aria-label={action === 'reinforce' ? undefined : 'FORCE to commit'}
            value={allocation}
            onChange={(event) => setAllocation(event.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-fg outline-none"
          />
          <span className="px-2 text-fg-subtle">FORCE</span>
        </div>
        {parsedAllocation.error && (
          <div className="text-caption text-warning">
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
        {error && <Callout tone="warning">ACTION FAILED · {error}</Callout>}
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
            className={buttonStyles({
              variant: 'solid',
              tone: 'danger',
              fullWidth: true,
              className: 'mt-2 font-semibold',
            })}
          >
            STAKE {formatStrk(deficit, 18)} STRK TO {copy.verb}
          </Link>
        ) : (
          <Button
            variant="solid"
            fullWidth
            onClick={() => void submit()}
            disabled={Boolean(disabledReason)}
            busy={phase !== 'idle'}
            className="mt-2 font-semibold"
          >
            {label}
          </Button>
        )}
      </div>
    </Panel>
  );
}
