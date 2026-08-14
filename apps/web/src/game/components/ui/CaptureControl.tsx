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
  buildSmartBatchCaptureCalls,
  buildSmartBatchReinforceCalls,
  stakeDeficit,
} from '../../services/smartCapture';
import {
  chunkControlPointActions,
  MAX_CONTROL_POINT_SELECTION,
  requiresControlPointActionSplit,
} from '../../services/controlPointLimits';
import { addressesMatch, formatStrk } from '../../utils/format';
import {
  SplitTransactionModal,
  type SplitTransactionBatch,
} from './SplitTransactionModal';

interface CaptureControlProps {
  controlPoints: ControlPointStatus[];
  intent?: 'capture' | 'fortify';
}

type CapturePhase = 'idle' | 'submitting' | 'confirming';

interface StakingContext {
  member: PoolMemberInfo | null;
  walletBalance: bigint;
}

interface CompletedBatch {
  controlPoints: ControlPointStatus[];
  capturePower: bigint;
}

function errorMessage(error: unknown, intent: 'capture' | 'fortify'): string {
  return error instanceof Error
    ? error.message
    : `The ${intent} transaction could not be completed.`;
}

function highestRequiredPower(controlPoints: readonly ControlPointStatus[]) {
  return controlPoints.reduce(
    (highest, controlPoint) =>
      controlPoint.requiredStake > highest
        ? controlPoint.requiredStake
        : highest,
    0n
  );
}

function assertChunkIsActionable(
  controlPoints: ControlPointStatus[],
  intent: 'capture' | 'fortify',
  operatorAddress: string,
  livePower: bigint
) {
  for (const controlPoint of controlPoints) {
    const label = `CP-${controlPoint.id.toString().padStart(4, '0')}`;
    const controlledByOperator = addressesMatch(
      controlPoint.controller,
      operatorAddress
    );

    if (intent === 'fortify') {
      if (
        !controlledByOperator ||
        controlPoint.stale ||
        controlPoint.needsSync
      ) {
        throw new Error(`${label} is no longer eligible for fortification.`);
      }
      if (livePower <= controlPoint.capturePower) {
        throw new Error(
          `${label} already reflects the Operator's current staking power.`
        );
      }
    } else {
      if (controlledByOperator) {
        throw new Error(`${label} is already controlled by this Operator.`);
      }
      if (livePower < controlPoint.requiredStake) {
        throw new Error(
          `${label} now requires ${formatStrk(controlPoint.requiredStake, 18)} STRK.`
        );
      }
    }
  }
}

export function CaptureControl({
  controlPoints,
  intent = 'capture',
}: CaptureControlProps) {
  const isFortifying = intent === 'fortify';
  const { address, isConnected } = useWallet();
  const {
    operatorStatus,
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
  const currentPower = operatorStatus?.liveDelegatedAmount ?? 0n;
  const deficit = isFortifying ? 0n : stakeDeficit(requiredPower, currentPower);
  const projectedPower = currentPower + deficit;
  const controlPointKey = controlPoints
    .map((controlPoint) => controlPoint.id)
    .join('-');
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isSplitModalOpen, setSplitModalOpen] = useState(false);
  const [splitBatches, setSplitBatches] = useState<SplitTransactionBatch[]>([]);
  const [splitSelectionIdsToRemove, setSplitSelectionIdsToRemove] = useState<
    number[]
  >([]);
  const [stakingContext, setStakingContext] = useState<StakingContext | null>(
    null
  );
  const [stakingError, setStakingError] = useState<string | null>(null);
  const [isStakingLoading, setStakingLoading] = useState(false);
  const [stakingRevision, setStakingRevision] = useState(0);

  useEffect(() => {
    setCaptureError(null);
    setPhase('idle');
  }, [controlPointKey, intent]);

  useEffect(() => {
    if (!isSplitModalOpen) return;
    setControlPointInteractionLocked(true);
    return () => setControlPointInteractionLocked(false);
  }, [isSplitModalOpen, setControlPointInteractionLocked]);

  useEffect(() => {
    const controller = new AbortController();

    if (!address || isFortifying) {
      setStakingContext(null);
      setStakingError(null);
      setStakingLoading(false);
      return () => controller.abort();
    }

    if (!config.stakingPoolAddress || !config.strkTokenAddress) {
      setStakingContext(null);
      setStakingError('Sepolia staking contracts are not configured.');
      setStakingLoading(false);
      return () => controller.abort();
    }

    setStakingContext(null);
    setStakingError(null);
    setStakingLoading(true);

    Promise.all([
      getStakingPoolInfo(controller.signal),
      getPoolMemberInfo(address, controller.signal),
      getStrkBalance(address, controller.signal),
    ])
      .then(([, member, walletBalance]) => {
        setStakingContext({ member, walletBalance });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setStakingError(
            error instanceof Error
              ? error.message
              : 'Unable to read Sepolia staking state.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setStakingLoading(false);
        }
      });

    return () => controller.abort();
  }, [address, isFortifying, stakingRevision]);

  const disabledReason = useMemo(() => {
    if (controlPoints.length > MAX_CONTROL_POINT_SELECTION) {
      return `SELECT UP TO ${MAX_CONTROL_POINT_SELECTION} TO ${isFortifying ? 'FORTIFY' : 'CAPTURE'}`;
    }
    if (!isConnected) {
      return `CONNECT OPERATOR TO ${isFortifying ? 'FORTIFY' : 'CAPTURE'}`;
    }
    if (!operatorStatus) return 'WAITING FOR OPERATOR STATE';
    if (
      isFortifying &&
      controlPoints.some(
        (controlPoint) => currentPower <= controlPoint.capturePower
      )
    ) {
      return 'STAKE MORE STRK TO FORTIFY';
    }
    if (!isFortifying && deficit > 0n) {
      if (isStakingLoading) return 'READING WALLET STRK';
      if (stakingError || !stakingContext) return 'STAKING READ FAILED';
      if (deficit > stakingContext.walletBalance) {
        return 'INSUFFICIENT WALLET STRK';
      }
    }
    return null;
  }, [
    controlPoints,
    currentPower,
    deficit,
    isConnected,
    isFortifying,
    isStakingLoading,
    operatorStatus,
    stakingContext,
    stakingError,
  ]);

  const isBusy = phase !== 'idle';
  const actionLabel =
    phase === 'submitting'
      ? 'AUTHORIZING…'
      : phase === 'confirming'
        ? 'CONFIRMING ON SEPOLIA…'
        : disabledReason ||
          (isFortifying
            ? `FORTIFY WITH ${formatStrk(currentPower, 18)} STRK`
            : deficit > 0n
              ? `STAKE ${formatStrk(deficit, 18)} + CAPTURE`
              : `CAPTURE WITH ${formatStrk(currentPower, 18)} STRK`);

  const applyCompletedBatches = (
    completedBatches: CompletedBatch[],
    clearSelection: boolean
  ) => {
    completedBatches.forEach((batch, index) => {
      const clearAfterBatch =
        clearSelection && index === completedBatches.length - 1;
      if (isFortifying) {
        confirmReinforcedControlPoints(batch.controlPoints, batch.capturePower);
      } else if (address) {
        confirmCapturedControlPoints(
          batch.controlPoints,
          address,
          batch.capturePower,
          clearAfterBatch
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
      !operatorStatus ||
      !address ||
      !config.controlSystemAddress
    ) {
      if (!config.controlSystemAddress) {
        setCaptureError('The Control System address is not configured.');
      }
      return;
    }

    setCaptureError(null);
    setPhase('submitting');
    if (!showSplitProgress) setControlPointInteractionLocked(true);
    let submittedHash: string | null = null;
    let currentBatch = 0;
    const completedBatches: CompletedBatch[] = [];

    try {
      let isPoolMember = Boolean(stakingContext?.member);

      for (const [chunkIndex, requestedControlPoints] of chunks.entries()) {
        currentBatch = chunkIndex + 1;
        submittedHash = null;
        setPhase('submitting');
        if (showSplitProgress) {
          setSplitBatches((current) =>
            current.map((batch, index) =>
              index === chunkIndex ? { ...batch, status: 'preparing' } : batch
            )
          );
        }

        const [freshControlPoints, freshOperator] = await Promise.all([
          getControlPointStatuses(
            requestedControlPoints.map((controlPoint) => controlPoint.id)
          ),
          getOperatorStatus(address),
        ]);
        const freshRequiredPower = highestRequiredPower(freshControlPoints);
        const targetPower = isFortifying
          ? freshOperator.liveDelegatedAmount
          : freshRequiredPower > requiredPower
            ? freshRequiredPower
            : requiredPower;
        const chunkDeficit = isFortifying
          ? 0n
          : stakeDeficit(targetPower, freshOperator.liveDelegatedAmount);
        const resultingPower = freshOperator.liveDelegatedAmount + chunkDeficit;
        assertChunkIsActionable(
          freshControlPoints,
          intent,
          address,
          resultingPower
        );

        const calls = isFortifying
          ? buildSmartBatchReinforceCalls({
              controlPointIds: freshControlPoints.map(({ id }) => id),
              controlSystemAddress: config.controlSystemAddress,
            })
          : buildSmartBatchCaptureCalls({
              controlPointIds: freshControlPoints.map(({ id }) => id),
              controlSystemAddress: config.controlSystemAddress,
              isPoolMember,
              liveDelegatedAmount: freshOperator.liveDelegatedAmount,
              operatorAddress: address,
              poolAddress: config.stakingPoolAddress,
              requiredStake: targetPower,
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

        submittedHash = result.transaction_hash;
        if (showSplitProgress) {
          setSplitBatches((current) =>
            current.map((batch, index) =>
              index === chunkIndex
                ? {
                    ...batch,
                    hash: submittedHash ?? undefined,
                    status: 'confirming',
                  }
                : batch
            )
          );
        } else {
          notifySubmitting(
            submittedHash,
            controlPoints.length === 1
              ? `CP-${controlPoints[0].id.toString().padStart(4, '0')} ${isFortifying ? 'FORTIFICATION' : 'CAPTURE'}`
              : `${controlPoints.length} CONTROL POINT ${isFortifying ? 'FORTIFICATIONS' : 'CAPTURES'}`
          );
        }
        setPhase('confirming');
        await provider.waitForTransaction(submittedHash, {
          errorStates: [TransactionExecutionStatus.REVERTED],
        });
        if (showSplitProgress) {
          setSplitBatches((current) =>
            current.map((batch, index) =>
              index === chunkIndex ? { ...batch, status: 'confirmed' } : batch
            )
          );
        } else {
          notifyConfirmed(submittedHash);
        }
        completedBatches.push({
          capturePower: resultingPower,
          controlPoints: freshControlPoints,
        });
        if (chunkDeficit > 0n) isPoolMember = true;
      }

      applyCompletedBatches(completedBatches, !showSplitProgress);
      const completedIds = completedBatches.flatMap((batch) =>
        batch.controlPoints.map(({ id }) => id)
      );
      if (showSplitProgress) {
        setSplitSelectionIdsToRemove(completedIds);
      }
      if (!showSplitProgress) refreshControlPoint();
      refreshOperator();
      refreshControlPointIndex();
      setStakingRevision((revision) => revision + 1);
    } catch (error) {
      const completedCount = completedBatches.reduce(
        (total, batch) => total + batch.controlPoints.length,
        0
      );
      const baseMessage = errorMessage(error, intent);
      const message =
        completedCount > 0
          ? `${baseMessage} ${completedCount} of ${controlPoints.length} points were confirmed; the remaining selection can be retried.`
          : baseMessage;
      if (showSplitProgress && currentBatch > 0) {
        setSplitBatches((current) =>
          current.map((batch, index) =>
            index === currentBatch - 1
              ? {
                  ...batch,
                  error: baseMessage,
                  hash: submittedHash ?? batch.hash,
                  status: 'failed',
                }
              : batch
          )
        );
      } else if (submittedHash) {
        notifyFailed(submittedHash, message);
      }
      if (completedCount > 0) {
        applyCompletedBatches(completedBatches, false);
        const completedIds = completedBatches.flatMap((batch) =>
          batch.controlPoints.map(({ id }) => id)
        );
        if (showSplitProgress) {
          setSplitSelectionIdsToRemove(completedIds);
        } else {
          removeSelectedControlPoints(completedIds);
        }
        if (!showSplitProgress) refreshControlPoint();
        refreshOperator();
        refreshControlPointIndex();
        setStakingRevision((revision) => revision + 1);
      }
      setCaptureError(message);
    } finally {
      setPhase('idle');
      if (!showSplitProgress) setControlPointInteractionLocked(false);
    }
  };

  const requestSubmit = () => {
    if (
      disabledReason ||
      !operatorStatus ||
      !address ||
      !config.controlSystemAddress
    ) {
      if (!config.controlSystemAddress) {
        setCaptureError('The Control System address is not configured.');
      }
      return;
    }

    const chunks = chunkControlPointActions(controlPoints);
    if (requiresControlPointActionSplit(controlPoints.length)) {
      setCaptureError(null);
      setSplitSelectionIdsToRemove([]);
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

  const proceedWithSplit = () => {
    void executeTransactions(chunkControlPointActions(controlPoints), true);
  };

  const closeSplitModal = () => {
    if (isBusy) return;
    const didStart = splitBatches.some((batch) => batch.status !== 'queued');
    setSplitModalOpen(false);
    setSplitBatches([]);
    if (splitSelectionIdsToRemove.length > 0) {
      removeSelectedControlPoints(splitSelectionIdsToRemove);
      setSplitSelectionIdsToRemove([]);
    }
    if (didStart) refreshControlPoint();
  };

  return (
    <section className="mt-4 border border-neutral-600 bg-neutral-950">
      <header className="border-b border-grid px-3 py-2">
        <span className="text-[10px] tracking-[0.18em] text-dim">
          {controlPoints.length > 1
            ? `${isFortifying ? 'FORTIFY' : 'CAPTURE'} ${controlPoints.length} POINTS`
            : isFortifying
              ? 'FORTIFY CONTROL POINT'
              : controlPoints[0].capturePower === 0n
                ? 'CAPTURE NEUTRAL POINT'
                : 'CHALLENGE OWNER'}
        </span>
      </header>

      <div className="px-3 py-3">
        <div className="space-y-2 text-[9px] tracking-[0.12em] text-neutral-500">
          <div className="flex justify-between gap-4">
            <span>FULL OPERATOR POWER</span>
            <span className="text-fg">{formatStrk(currentPower, 18)} STRK</span>
          </div>
          {!isFortifying && (
            <div className="flex justify-between gap-4">
              <span>REQUIRED POWER</span>
              <span>{formatStrk(requiredPower, 18)} STRK</span>
            </div>
          )}
          {!isFortifying && deficit > 0n && (
            <div className="flex justify-between gap-4 border-t border-grid pt-2">
              <span>ADDITIONAL STRK TO STAKE</span>
              <span className="text-fg">{formatStrk(deficit, 18)} STRK</span>
            </div>
          )}
          {controlPoints.length > 1 && (
            <p className="border-l border-neutral-700 pl-2 leading-relaxed">
              The same full Operator power backs every selected Control Point.
            </p>
          )}
        </div>

        {address && isStakingLoading && !isFortifying && deficit > 0n && (
          <div className="mt-3 flex items-center gap-2 text-neutral-400">
            <span className="h-1.5 w-1.5 animate-pulse bg-white" />
            READING WALLET AND STAKING STATE…
          </div>
        )}

        {stakingContext && !isFortifying && deficit > 0n && (
          <div className="mt-3 space-y-1 border-l border-neutral-700 pl-2 text-[9px] tracking-[0.1em] text-neutral-500">
            <div className="flex justify-between gap-4">
              <span>WALLET</span>
              <span className="text-neutral-300">
                {formatStrk(stakingContext.walletBalance, 18)} STRK
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span>POWER AFTER STAKING</span>
              <span className="text-fg">
                {formatStrk(projectedPower, 18)} STRK
              </span>
            </div>
          </div>
        )}

        {stakingError && address && !isFortifying && deficit > 0n && (
          <button
            type="button"
            onClick={() => setStakingRevision((revision) => revision + 1)}
            className="mt-3 text-left text-amber-400 hover:text-amber-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            STAKING READ FAILED · RETRY
          </button>
        )}

        {captureError && (
          <div className="mt-3 border-l-2 border-amber-400 pl-2 leading-relaxed text-amber-400">
            {isFortifying ? 'FORTIFY' : 'CAPTURE'} FAILED · {captureError}
          </div>
        )}

        <button
          type="button"
          onClick={requestSubmit}
          disabled={Boolean(disabledReason) || isBusy}
          className="mt-4 w-full border border-white bg-white px-3 py-2.5 text-[10px] font-semibold tracking-[0.18em] text-black transition-colors hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-500"
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
        onProceed={proceedWithSplit}
      />
    </section>
  );
}
