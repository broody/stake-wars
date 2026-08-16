import { useEffect, useMemo, useState } from 'react';
import { useProvider, useSendTransaction } from '@starknet-start/react';
import { TransactionExecutionStatus } from 'starknet';
import type { ControlPointStatus, PoolMemberInfo } from '../../types';
import { useControlPoints } from '../../contexts/ControlPointContext';
import { useWallet } from '../../contexts/WalletContext';
import { useTransactionToast } from '../../contexts/TransactionToastContext';
import { config } from '../../services/config';
import {
  getControlPointStatuses,
  getOperatorStatus,
  getPoolMemberInfo,
  getStakingPoolInfo,
  getStrkBalance,
} from '../../services/starknet';
import {
  buildSmartBatchGameActionCalls,
  stakeDeficit,
} from '../../services/smartCapture';
import {
  chunkControlPointActions,
  MAX_CONTROL_POINT_SELECTION,
  requiresControlPointActionSplit,
} from '../../services/controlPointLimits';
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
  controlPoints: ControlPointStatus[];
  intent: 'capture' | 'fortify';
}

type Phase = 'idle' | 'submitting' | 'confirming';

interface StakingContext {
  member: PoolMemberInfo | null;
  walletBalance: bigint;
}

interface CompletedBatch {
  controlPoints: ControlPointStatus[];
  allocation: bigint;
}

const MAX_U128 = (1n << 128n) - 1n;

function highestRequiredPower(controlPoints: readonly ControlPointStatus[]) {
  return controlPoints.reduce(
    (highest, point) =>
      point.requiredStake > highest ? point.requiredStake : highest,
    0n
  );
}

function assertBatchIsActionable(
  controlPoints: readonly ControlPointStatus[],
  intent: 'capture' | 'fortify',
  operatorAddress: string,
  allocation: bigint
) {
  for (const point of controlPoints) {
    const label = `CP-${String(point.id).padStart(4, '0')}`;
    if (point.stale || point.needsSync || point.activeChallengeId !== 0n) {
      throw new Error(`${label} is no longer eligible for a batch action.`);
    }
    if (intent === 'capture') {
      if (!isZeroAddress(point.controller)) {
        throw new Error(`${label} is no longer neutral.`);
      }
      if (allocation < point.requiredStake) {
        throw new Error(
          `${label} now requires ${formatStrk(point.requiredStake, 18)} STRK.`
        );
      }
    } else if (!addressesMatch(point.controller, operatorAddress)) {
      throw new Error(`${label} is no longer controlled by this Operator.`);
    }
  }
}

export function BatchCaptureControl({
  controlPoints,
  intent,
}: BatchCaptureControlProps) {
  const isFortifying = intent === 'fortify';
  const { address, isConnected } = useWallet();
  const {
    operatorStatus,
    isControlPointInteractionLocked,
    refreshControlPoint,
    refreshOperator,
    refreshControlPointIndex,
    setControlPointInteractionLocked,
    removeSelectedControlPoints,
    confirmCapturedControlPoints,
    confirmReinforcedControlPoints,
  } = useControlPoints();
  const { provider } = useProvider();
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const transaction = useSendTransaction({});
  const requiredPower = highestRequiredPower(controlPoints);
  const controlPointKey = controlPoints.map(({ id }) => id).join('-');
  const [allocation, setAllocation] = useState(() =>
    formatStrk(isFortifying ? 0n : requiredPower, 18)
  );
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [staking, setStaking] = useState<StakingContext | null>(null);
  const [isSplitModalOpen, setSplitModalOpen] = useState(false);
  const [splitBatches, setSplitBatches] = useState<SplitTransactionBatch[]>([]);
  const [completedSelectionIds, setCompletedSelectionIds] = useState<number[]>(
    []
  );

  useEffect(() => {
    setAllocation(formatStrk(isFortifying ? 0n : requiredPower, 18));
    setError(null);
    setPhase('idle');
  }, [controlPointKey, isFortifying, requiredPower]);

  useEffect(() => {
    if (!isSplitModalOpen) return;
    setControlPointInteractionLocked(true);
    return () => setControlPointInteractionLocked(false);
  }, [isSplitModalOpen, setControlPointInteractionLocked]);

  const parsedAllocation = useMemo(() => {
    if (!allocation.trim()) return { value: 0n, error: null };
    try {
      const value = parseStrk(allocation);
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
      : selectedAllocation * BigInt(controlPoints.length);
  const availablePower = operatorStatus?.availablePower ?? 0n;
  const deficit = stakeDeficit(totalAllocation, availablePower);

  useEffect(() => {
    const controller = new AbortController();
    if (!address || deficit === 0n) {
      setStaking(null);
      return () => controller.abort();
    }
    Promise.all([
      getStakingPoolInfo(controller.signal),
      getPoolMemberInfo(address, controller.signal),
      getStrkBalance(address, controller.signal),
    ])
      .then(([, member, walletBalance]) =>
        setStaking({ member, walletBalance })
      )
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to read staking state.'
          );
        }
      });
    return () => controller.abort();
  }, [address, deficit]);

  const disabledReason = useMemo(() => {
    if (controlPoints.length === 0) return 'NO ELIGIBLE CONTROL POINTS';
    if (controlPoints.length > MAX_CONTROL_POINT_SELECTION) {
      return `SELECT UP TO ${MAX_CONTROL_POINT_SELECTION} POINTS`;
    }
    if (!isConnected || !address) return 'CONNECT OPERATOR';
    if (
      isControlPointInteractionLocked &&
      phase === 'idle' &&
      !isSplitModalOpen
    ) {
      return 'ANOTHER CONTROL POINT ACTION IS IN PROGRESS';
    }
    if (!operatorStatus) return 'WAITING FOR OPERATOR STATE';
    if (operatorStatus.retired) return 'ADDRESS PERMANENTLY RETIRED';
    if (operatorStatus.needsSync) return 'OPERATOR SYNC REQUIRED';
    if (operatorStatus.activeChallengeId !== 0n)
      return 'ACTIVE CHALLENGE MUST SETTLE FIRST';
    if (parsedAllocation.error) return 'ENTER A VALID ALLOCATION';
    if (selectedAllocation === null || selectedAllocation === 0n)
      return 'ENTER ALLOCATION PER POINT';
    if (!isFortifying && selectedAllocation < requiredPower)
      return `ALLOCATE AT LEAST ${formatStrk(requiredPower, 18)} STRK EACH`;
    if (deficit > 0n && !staking) return 'READING WALLET STRK';
    if (deficit > (staking?.walletBalance ?? 0n))
      return 'INSUFFICIENT WALLET STRK';
    return null;
  }, [
    address,
    controlPoints.length,
    deficit,
    isConnected,
    isControlPointInteractionLocked,
    isFortifying,
    isSplitModalOpen,
    operatorStatus,
    phase,
    parsedAllocation.error,
    requiredPower,
    selectedAllocation,
    staking,
  ]);

  const isBusy = phase !== 'idle';

  const applyCompletedBatches = (
    completed: readonly CompletedBatch[],
    clearSelection: boolean
  ) => {
    completed.forEach((batch, index) => {
      const shouldClear = clearSelection && index === completed.length - 1;
      if (isFortifying) {
        batch.controlPoints.forEach((point) =>
          confirmReinforcedControlPoints(
            [point],
            point.capturePower + batch.allocation
          )
        );
      } else if (address) {
        confirmCapturedControlPoints(
          batch.controlPoints,
          address,
          batch.allocation,
          shouldClear
        );
      }
    });
  };

  const executeTransactions = async (
    chunks: ControlPointStatus[][],
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
    if (!showSplitProgress) setControlPointInteractionLocked(true);
    let hash: string | null = null;
    let currentBatch = 0;
    const completed: CompletedBatch[] = [];

    try {
      for (const [chunkIndex, requestedPoints] of chunks.entries()) {
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

        const [freshPoints, freshOperator] = await Promise.all([
          getControlPointStatuses(requestedPoints.map(({ id }) => id)),
          getOperatorStatus(address),
        ]);
        if (
          freshOperator.retired ||
          freshOperator.needsSync ||
          freshOperator.activeChallengeId !== 0n
        ) {
          throw new Error('Operator is no longer eligible for batch actions.');
        }
        assertBatchIsActionable(
          freshPoints,
          intent,
          address,
          selectedAllocation
        );

        const chunkAllocation = selectedAllocation * BigInt(freshPoints.length);
        const chunkDeficit = stakeDeficit(
          chunkAllocation,
          freshOperator.availablePower
        );
        const member =
          chunkDeficit > 0n
            ? await getPoolMemberInfo(address)
            : staking?.member;
        const calls = buildSmartBatchGameActionCalls({
          actions: freshPoints.map(({ id }) => ({
            entrypoint: isFortifying ? 'reinforce' : 'capture',
            calldata: [id.toString(), selectedAllocation.toString()],
          })),
          allocation: chunkAllocation,
          availablePower: freshOperator.availablePower,
          controlSystemAddress: config.controlSystemAddress,
          isPoolMember: Boolean(member),
          operatorAddress: address,
          poolAddress: config.stakingPoolAddress,
          strkTokenAddress: config.strkTokenAddress,
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
            `${freshPoints.length} CONTROL POINT ${isFortifying ? 'FORTIFICATIONS' : 'CAPTURES'}`
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
          controlPoints: freshPoints,
        });
      }

      applyCompletedBatches(completed, !showSplitProgress);
      if (showSplitProgress && !isFortifying) {
        setCompletedSelectionIds(
          completed.flatMap((batch) => batch.controlPoints.map(({ id }) => id))
        );
      }
      if (!showSplitProgress) refreshControlPoint();
      refreshOperator();
      refreshControlPointIndex();
    } catch (reason) {
      const baseMessage =
        reason instanceof Error ? reason.message : 'Batch transaction failed.';
      const completedCount = completed.reduce(
        (count, batch) => count + batch.controlPoints.length,
        0
      );
      const message =
        completedCount > 0
          ? `${baseMessage} ${completedCount} of ${controlPoints.length} points were confirmed.`
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
          batch.controlPoints.map(({ id }) => id)
        );
        if (showSplitProgress && !isFortifying) {
          setCompletedSelectionIds(completedIds);
        } else if (!isFortifying) {
          removeSelectedControlPoints(completedIds);
        }
        refreshControlPoint();
        refreshOperator();
        refreshControlPointIndex();
      }
      setError(message);
    } finally {
      setPhase('idle');
      if (!showSplitProgress) setControlPointInteractionLocked(false);
    }
  };

  const requestSubmit = () => {
    if (disabledReason) return;
    const chunks = chunkControlPointActions(controlPoints);
    if (requiresControlPointActionSplit(controlPoints.length)) {
      setError(null);
      setCompletedSelectionIds([]);
      setSplitBatches(
        chunks.map((chunk) => ({
          pointCount: chunk.length,
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
      removeSelectedControlPoints(completedSelectionIds);
      setCompletedSelectionIds([]);
    }
    refreshControlPoint();
  };

  const actionLabel =
    phase === 'submitting'
      ? 'AUTHORIZING…'
      : phase === 'confirming'
        ? 'CONFIRMING ON SEPOLIA…'
        : disabledReason ||
          (deficit > 0n
            ? `STAKE ${formatStrk(deficit, 18)} + ${isFortifying ? 'FORTIFY' : 'CAPTURE'} ${controlPoints.length}`
            : `${isFortifying ? 'FORTIFY' : 'CAPTURE'} ${controlPoints.length} WITH ${formatStrk(totalAllocation, 18)} STRK`);

  return (
    <section className="mt-4 border border-neutral-600 bg-neutral-950">
      <header className="border-b border-grid px-3 py-2 text-[10px] tracking-[0.18em] text-dim">
        {isFortifying ? 'FORTIFY' : 'CAPTURE'} {controlPoints.length} SELECTED
        POINT{controlPoints.length === 1 ? '' : 'S'}
      </header>
      <div className="space-y-2 px-3 py-3 text-[9px] tracking-[0.12em] text-neutral-500">
        <div className="flex justify-between gap-4">
          <span>AVAILABLE POWER</span>
          <span className="text-fg">{formatStrk(availablePower, 18)} STRK</span>
        </div>
        <label
          className="block pt-1 text-dim"
          htmlFor={`${intent}-batch-allocation-${controlPointKey}`}
        >
          {isFortifying ? 'ADDITIONAL ALLOCATION' : 'POINT ALLOCATION'} · EACH
        </label>
        <div className="flex items-center border border-neutral-700 bg-black focus-within:border-white">
          <input
            id={`${intent}-batch-allocation-${controlPointKey}`}
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
          <span className="px-2 text-dim">STRK</span>
        </div>
        {parsedAllocation.error && (
          <div className="leading-relaxed text-amber-400">
            {parsedAllocation.error}
          </div>
        )}
        {!isFortifying && (
          <div className="flex justify-between gap-4">
            <span>MINIMUM EACH</span>
            <span>{formatStrk(requiredPower, 18)} STRK</span>
          </div>
        )}
        <div className="flex justify-between gap-4 border-t border-grid pt-2">
          <span>TOTAL COMMITMENT</span>
          <span className="text-fg">
            {formatStrk(totalAllocation, 18)} STRK
          </span>
        </div>
        {deficit > 0n && (
          <div className="flex justify-between gap-4">
            <span>ADDITIONAL STRK TO STAKE</span>
            <span>{formatStrk(deficit, 18)} STRK</span>
          </div>
        )}
        {error && (
          <div className="border-l-2 border-amber-400 pl-2 leading-relaxed text-amber-400">
            BATCH ACTION FAILED · {error}
          </div>
        )}
        <button
          type="button"
          onClick={requestSubmit}
          disabled={Boolean(disabledReason) || isBusy}
          className="mt-2 w-full border border-white bg-white px-3 py-2.5 text-[10px] font-semibold tracking-[0.18em] text-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-500"
        >
          {actionLabel}
        </button>
      </div>
      <SplitTransactionModal
        batches={splitBatches}
        intent={intent}
        isOpen={isSplitModalOpen}
        isRunning={isBusy}
        pointCount={controlPoints.length}
        onClose={closeSplitModal}
        onProceed={() =>
          void executeTransactions(
            chunkControlPointActions(controlPoints),
            true
          )
        }
      />
    </section>
  );
}
