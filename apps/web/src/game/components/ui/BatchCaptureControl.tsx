import { useEffect, useMemo, useState } from 'react';
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
import { getSectorStatuses, getOperatorStatus } from '../../services/starknet';
import {
  buildBatchGameActionCalls,
  stakeDeficit,
} from '../../services/smartCapture';
import {
  chunkSectorActions,
  MAX_SECTOR_SELECTION,
  requiresSectorActionSplit,
} from '../../services/sectorLimits';
import {
  addressesMatch,
  formatStrk,
  isZeroAddress,
  parseStrk,
} from '../../utils/format';
import {
  SplitTransactionModal,
  type SplitTransactionBatch,
} from './SplitTransactionModal';

interface BatchCaptureControlProps {
  sectors: SectorStatus[];
  intent: 'capture' | 'fortify';
}

type Phase = 'idle' | 'submitting' | 'confirming';

interface CompletedBatch {
  sectors: SectorStatus[];
  allocation: bigint;
}

const MAX_U128 = (1n << 128n) - 1n;

function highestRequiredForce(sectors: readonly SectorStatus[]) {
  return sectors.reduce(
    (highest, sector) =>
      sector.requiredStake > highest ? sector.requiredStake : highest,
    0n
  );
}

function assertBatchIsActionable(
  sectors: readonly SectorStatus[],
  intent: 'capture' | 'fortify',
  operatorAddress: string,
  allocation: bigint
) {
  for (const sector of sectors) {
    const label = `SECTOR-${String(sector.id).padStart(4, '0')}`;
    if (sector.stale || sector.needsSync || sector.activeChallengeId !== 0n) {
      throw new Error(`${label} is no longer eligible for a batch action.`);
    }
    if (intent === 'capture') {
      if (!isZeroAddress(sector.controller)) {
        throw new Error(`${label} is no longer neutral.`);
      }
      if (allocation < sector.requiredStake) {
        throw new Error(
          `${label} now requires ${formatStrk(sector.requiredStake, 18)} FORCE.`
        );
      }
    } else if (!addressesMatch(sector.controller, operatorAddress)) {
      throw new Error(`${label} is no longer controlled by this Operator.`);
    }
  }
}

export function BatchCaptureControl({
  sectors,
  intent,
}: BatchCaptureControlProps) {
  const isFortifying = intent === 'fortify';
  const { address, isConnected } = useWallet();
  const {
    operatorStatus,
    isSectorInteractionLocked,
    refreshSector,
    refreshOperator,
    refreshSectorIndex,
    setSectorInteractionLocked,
    removeSelectedSectors,
    confirmCapturedSectors,
    confirmReinforcedSectors,
  } = useSectors();
  const { provider } = useProvider();
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const transaction = useSendTransaction({});
  const requiredForce = highestRequiredForce(sectors);
  const sectorKey = sectors.map(({ id }) => id).join('-');
  const [allocation, setAllocation] = useState(() =>
    formatStrk(isFortifying ? 0n : requiredForce, 18)
  );
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isSplitModalOpen, setSplitModalOpen] = useState(false);
  const [splitBatches, setSplitBatches] = useState<SplitTransactionBatch[]>([]);
  const [completedSelectionIds, setCompletedSelectionIds] = useState<number[]>(
    []
  );

  useEffect(() => {
    setAllocation(formatStrk(isFortifying ? 0n : requiredForce, 18));
    setError(null);
    setPhase('idle');
  }, [sectorKey, isFortifying, requiredForce]);

  useEffect(() => {
    if (!isSplitModalOpen) return;
    setSectorInteractionLocked(true);
    return () => setSectorInteractionLocked(false);
  }, [isSplitModalOpen, setSectorInteractionLocked]);

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
  const totalAllocation =
    selectedAllocation === null
      ? 0n
      : selectedAllocation * BigInt(sectors.length);
  const availableForce = operatorStatus?.availableForce ?? 0n;
  const deficit = stakeDeficit(totalAllocation, availableForce);

  const disabledReason = useMemo(() => {
    if (sectors.length === 0) return 'NO ELIGIBLE SECTORS';
    if (sectors.length > MAX_SECTOR_SELECTION) {
      return `SELECT UP TO ${MAX_SECTOR_SELECTION} SECTORS`;
    }
    if (!isConnected || !address) return 'CONNECT OPERATOR';
    if (isSectorInteractionLocked && phase === 'idle' && !isSplitModalOpen) {
      return 'ANOTHER SECTOR ACTION IS IN PROGRESS';
    }
    if (!operatorStatus) return 'WAITING FOR OPERATOR STATE';
    if (operatorStatus.retired) return 'ADDRESS PERMANENTLY RETIRED';
    if (operatorStatus.needsSync) return 'OPERATOR SYNC REQUIRED';
    if (parsedAllocation.error) return 'ENTER A VALID ALLOCATION';
    if (selectedAllocation === null || selectedAllocation === 0n)
      return 'ENTER ALLOCATION PER POINT';
    if (!isFortifying && selectedAllocation < requiredForce)
      return `ALLOCATE AT LEAST ${formatStrk(requiredForce, 18)} FORCE EACH`;
    return null;
  }, [
    address,
    sectors.length,
    isConnected,
    isSectorInteractionLocked,
    isFortifying,
    isSplitModalOpen,
    operatorStatus,
    phase,
    parsedAllocation.error,
    requiredForce,
    selectedAllocation,
  ]);

  const isBusy = phase !== 'idle';

  const applyCompletedBatches = (
    completed: readonly CompletedBatch[],
    clearSelection: boolean
  ) => {
    completed.forEach((batch, index) => {
      const shouldClear = clearSelection && index === completed.length - 1;
      if (isFortifying) {
        batch.sectors.forEach((sector) =>
          confirmReinforcedSectors(
            [sector],
            sector.captureForce + batch.allocation
          )
        );
      } else if (address) {
        confirmCapturedSectors(
          batch.sectors,
          address,
          batch.allocation,
          shouldClear
        );
      }
    });
  };

  const executeTransactions = async (
    chunks: SectorStatus[][],
    showSplitProgress: boolean
  ) => {
    if (
      disabledReason ||
      selectedAllocation === null ||
      !operatorStatus ||
      !address ||
      !config.controlSystemAddress
    ) {
      return;
    }

    setError(null);
    setPhase('submitting');
    if (!showSplitProgress) setSectorInteractionLocked(true);
    let hash: string | null = null;
    let currentBatch = 0;
    const completed: CompletedBatch[] = [];

    try {
      for (const [chunkIndex, requestedSectors] of chunks.entries()) {
        currentBatch = chunkIndex + 1;
        hash = null;
        setPhase('submitting');
        if (showSplitProgress) {
          setSplitBatches((current) =>
            current.map((batch, index) =>
              index === chunkIndex ? { ...batch, status: 'preparing' } : batch
            )
          );
        }

        const [freshSectors, freshOperator] = await Promise.all([
          getSectorStatuses(requestedSectors.map(({ id }) => id)),
          getOperatorStatus(address),
        ]);
        if (freshOperator.retired || freshOperator.needsSync) {
          throw new Error('Operator is no longer eligible for batch actions.');
        }
        assertBatchIsActionable(
          freshSectors,
          intent,
          address,
          selectedAllocation
        );

        const chunkAllocation =
          selectedAllocation * BigInt(freshSectors.length);
        const chunkDeficit = stakeDeficit(
          chunkAllocation,
          freshOperator.availableForce
        );
        if (chunkDeficit > 0n) {
          throw new Error(
            `Generate ${formatStrk(chunkDeficit, 18)} more FORCE before continuing.`
          );
        }
        const calls = buildBatchGameActionCalls({
          actions: freshSectors.map(({ id }) => ({
            entrypoint: isFortifying ? 'reinforce' : 'capture',
            calldata: [id.toString(), selectedAllocation.toString()],
          })),
          controlSystemAddress: config.controlSystemAddress,
        });

        if (showSplitProgress) {
          setSplitBatches((current) =>
            current.map((batch, index) =>
              index === chunkIndex ? { ...batch, status: 'authorizing' } : batch
            )
          );
        }
        const result = await transaction.sendAsync(calls);
        hash = result.transaction_hash;
        if (showSplitProgress) {
          setSplitBatches((current) =>
            current.map((batch, index) =>
              index === chunkIndex
                ? { ...batch, hash: hash ?? undefined, status: 'confirming' }
                : batch
            )
          );
        } else {
          notifySubmitting(
            hash,
            `${freshSectors.length} SECTOR ${isFortifying ? 'FORTIFICATIONS' : 'CAPTURES'}`
          );
        }
        setPhase('confirming');
        await provider.waitForTransaction(hash, {
          errorStates: [TransactionExecutionStatus.REVERTED],
        });
        if (showSplitProgress) {
          setSplitBatches((current) =>
            current.map((batch, index) =>
              index === chunkIndex ? { ...batch, status: 'confirmed' } : batch
            )
          );
        } else {
          notifyConfirmed(hash);
        }
        completed.push({
          allocation: selectedAllocation,
          sectors: freshSectors,
        });
      }

      applyCompletedBatches(completed, !showSplitProgress);
      if (showSplitProgress && !isFortifying) {
        setCompletedSelectionIds(
          completed.flatMap((batch) => batch.sectors.map(({ id }) => id))
        );
      }
      if (!showSplitProgress) refreshSector();
      refreshOperator();
      refreshSectorIndex();
    } catch (reason) {
      const baseMessage =
        reason instanceof Error ? reason.message : 'Batch transaction failed.';
      const completedCount = completed.reduce(
        (count, batch) => count + batch.sectors.length,
        0
      );
      const message =
        completedCount > 0
          ? `${baseMessage} ${completedCount} of ${sectors.length} sectors were confirmed.`
          : baseMessage;
      if (showSplitProgress && currentBatch > 0) {
        setSplitBatches((current) =>
          current.map((batch, index) =>
            index === currentBatch - 1
              ? {
                  ...batch,
                  error: baseMessage,
                  hash: hash ?? batch.hash,
                  status: 'failed',
                }
              : batch
          )
        );
      } else if (hash) {
        notifyFailed(hash, message);
      }
      if (completedCount > 0) {
        applyCompletedBatches(completed, false);
        const completedIds = completed.flatMap((batch) =>
          batch.sectors.map(({ id }) => id)
        );
        if (showSplitProgress && !isFortifying) {
          setCompletedSelectionIds(completedIds);
        } else if (!isFortifying) {
          removeSelectedSectors(completedIds);
        }
        refreshSector();
        refreshOperator();
        refreshSectorIndex();
      }
      setError(message);
    } finally {
      setPhase('idle');
      if (!showSplitProgress) setSectorInteractionLocked(false);
    }
  };

  const requestSubmit = () => {
    if (disabledReason) return;
    const chunks = chunkSectorActions(sectors);
    if (requiresSectorActionSplit(sectors.length)) {
      setError(null);
      setCompletedSelectionIds([]);
      setSplitBatches(
        chunks.map((chunk) => ({
          sectorCount: chunk.length,
          status: 'queued',
        }))
      );
      setSplitModalOpen(true);
      return;
    }
    void executeTransactions(chunks, false);
  };

  const closeSplitModal = () => {
    if (isBusy) return;
    setSplitModalOpen(false);
    setSplitBatches([]);
    if (completedSelectionIds.length > 0) {
      removeSelectedSectors(completedSelectionIds);
      setCompletedSelectionIds([]);
    }
    refreshSector();
  };

  const actionLabel =
    phase === 'submitting'
      ? 'AUTHORIZING…'
      : phase === 'confirming'
        ? 'CONFIRMING ON SEPOLIA…'
        : disabledReason ||
          `${isFortifying ? 'FORTIFY' : 'CAPTURE'} ${sectors.length} WITH ${formatStrk(totalAllocation, 18)} FORCE`;

  return (
    <section className="mt-4 border border-neutral-600 bg-neutral-950">
      <header className="border-b border-grid px-3 py-2 text-[10px] tracking-[0.18em] text-dim">
        {isFortifying ? 'FORTIFY' : 'CAPTURE'} {sectors.length} SELECTED POINT
        {sectors.length === 1 ? '' : 'S'}
      </header>
      <div className="space-y-2 px-3 py-3 text-[9px] tracking-[0.12em] text-neutral-500">
        <div className="flex justify-between gap-4">
          <span>AVAILABLE FORCE</span>
          <span className="text-fg">
            {formatStrk(availableForce, 18)} FORCE
          </span>
        </div>
        <label
          className="block pt-1 text-dim"
          htmlFor={`${intent}-batch-allocation-${sectorKey}`}
        >
          {isFortifying ? 'ADDITIONAL ALLOCATION' : 'POINT ALLOCATION'} · EACH
        </label>
        <div className="flex items-center border border-neutral-700 bg-black focus-within:border-white">
          <input
            id={`${intent}-batch-allocation-${sectorKey}`}
            value={allocation}
            onChange={(event) => {
              setAllocation(event.target.value);
              setError(null);
            }}
            inputMode="decimal"
            placeholder="0"
            disabled={isBusy}
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-fg outline-none disabled:text-neutral-600"
          />
          <span className="px-2 text-dim">FORCE</span>
        </div>
        {parsedAllocation.error && (
          <div className="leading-relaxed text-amber-400">
            {parsedAllocation.error}
          </div>
        )}
        {!isFortifying && (
          <>
            <div className="flex justify-between gap-4">
              <span>MINIMUM EACH</span>
              <span>{formatStrk(requiredForce, 18)} FORCE</span>
            </div>
          </>
        )}
        <div className="flex justify-between gap-4 border-t border-grid pt-2">
          <span>TOTAL COMMITMENT</span>
          <span className="text-fg">
            {formatStrk(totalAllocation, 18)} FORCE
          </span>
        </div>
        {error && (
          <div className="border-l-2 border-amber-400 pl-2 leading-relaxed text-amber-400">
            BATCH ACTION FAILED · {error}
          </div>
        )}
        {deficit > 0n && !disabledReason ? (
          <Link
            to="/staking"
            className="force-alert-button mt-2 block w-full border px-3 py-2.5 text-center text-[10px] font-semibold tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2"
          >
            GENERATE {formatStrk(deficit, 18)} MORE FORCE
          </Link>
        ) : (
          <button
            type="button"
            onClick={requestSubmit}
            disabled={Boolean(disabledReason) || isBusy}
            className="mt-2 w-full border border-white bg-white px-3 py-2.5 text-[10px] font-semibold tracking-[0.18em] text-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-500"
          >
            {actionLabel}
          </button>
        )}
      </div>
      <SplitTransactionModal
        batches={splitBatches}
        intent={intent}
        isOpen={isSplitModalOpen}
        isRunning={isBusy}
        sectorCount={sectors.length}
        onClose={closeSplitModal}
        onProceed={() =>
          void executeTransactions(chunkSectorActions(sectors), true)
        }
      />
    </section>
  );
}
