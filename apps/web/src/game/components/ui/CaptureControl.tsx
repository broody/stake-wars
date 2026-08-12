import { useEffect, useMemo, useState } from 'react';
import { useProvider, useSendTransaction } from '@starknet-start/react';
import { TransactionExecutionStatus } from 'starknet';
import type { ControlPointStatus } from '../../types';
import { useControlPoints } from '../../contexts/ControlPointContext';
import { useWallet } from '../../contexts/WalletContext';
import { useTransactionToast } from '../../contexts/TransactionToastContext';
import { config } from '../../services/config';
import {
  getPoolMemberInfo,
  getStakingPoolInfo,
  getStrkBalance,
} from '../../services/starknet';
import {
  buildSmartBatchCaptureCalls,
  buildSmartBatchReinforceCalls,
  stakeDeficit,
} from '../../services/smartCapture';
import type { PoolMemberInfo, StakingPoolInfo } from '../../types';
import { formatStrk, parseStrk, shortAddress } from '../../utils/format';

interface CaptureControlProps {
  controlPoints: ControlPointStatus[];
  intent?: 'capture' | 'fortify';
}

type CapturePhase = 'idle' | 'submitting' | 'confirming';

interface StakingContext {
  member: PoolMemberInfo | null;
  pool: StakingPoolInfo;
  walletBalance: bigint;
}

function errorMessage(error: unknown, intent: 'capture' | 'fortify'): string {
  return error instanceof Error
    ? error.message
    : `The ${intent} transaction could not be completed.`;
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
    confirmCapturedControlPoints,
    confirmReinforcedControlPoints,
  } = useControlPoints();
  const { provider } = useProvider();
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const transaction = useSendTransaction({});
  const highestRequiredStake = controlPoints.reduce(
    (highest, controlPoint) =>
      controlPoint.requiredStake > highest
        ? controlPoint.requiredStake
        : highest,
    0n
  );
  const suggestedFortification = controlPoints.reduce(
    (highest, controlPoint) => {
      const increase =
        controlPoint.requiredStake > controlPoint.allocatedStake
          ? controlPoint.requiredStake - controlPoint.allocatedStake
          : 1n;
      return increase > highest ? increase : highest;
    },
    0n
  );
  const initialStake = isFortifying
    ? suggestedFortification
    : highestRequiredStake;
  const controlPointKey = controlPoints
    .map((controlPoint) => controlPoint.id)
    .join('-');
  const [allocation, setAllocation] = useState(() =>
    formatStrk(initialStake, 18)
  );
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [stakingContext, setStakingContext] = useState<StakingContext | null>(
    null
  );
  const [stakingError, setStakingError] = useState<string | null>(null);
  const [isStakingLoading, setStakingLoading] = useState(false);
  const [stakingRevision, setStakingRevision] = useState(0);

  useEffect(() => {
    setAllocation(formatStrk(initialStake, 18));
    setCaptureError(null);
    setPhase('idle');
  }, [controlPointKey, initialStake]);

  useEffect(() => {
    const controller = new AbortController();

    if (!address) {
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
      .then(([pool, member, walletBalance]) => {
        setStakingContext({ member, pool, walletBalance });
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
  }, [address, stakingRevision]);

  const parsedAllocation = useMemo(() => {
    try {
      return parseStrk(allocation);
    } catch {
      return null;
    }
  }, [allocation]);

  const totalAllocation = useMemo(
    () =>
      parsedAllocation === null
        ? null
        : parsedAllocation * BigInt(controlPoints.length),
    [controlPoints.length, parsedAllocation]
  );

  const deficit = useMemo(() => {
    if (totalAllocation === null || !operatorStatus) return null;
    return stakeDeficit(totalAllocation, operatorStatus.availableStake);
  }, [operatorStatus, totalAllocation]);

  const disabledReason = useMemo(() => {
    if (!isConnected) {
      return `CONNECT OPERATOR TO ${isFortifying ? 'FORTIFY' : 'CAPTURE'}`;
    }
    if (!operatorStatus) return 'WAITING FOR OPERATOR STATE';
    if (parsedAllocation === null || parsedAllocation === 0n) {
      return 'ENTER A VALID ALLOCATION';
    }
    if (!isFortifying && parsedAllocation < highestRequiredStake) {
      return 'INCREASE TO REQUIRED STAKE';
    }
    if (deficit !== null && deficit > 0n) {
      if (isStakingLoading) return 'READING WALLET STRK';
      if (stakingError || !stakingContext) return 'STAKING READ FAILED';
      if (deficit > stakingContext.walletBalance) {
        return 'INSUFFICIENT WALLET STRK';
      }
    }
    return null;
  }, [
    deficit,
    highestRequiredStake,
    isConnected,
    isFortifying,
    isStakingLoading,
    operatorStatus,
    parsedAllocation,
    stakingContext,
    stakingError,
  ]);

  const isBusy = phase !== 'idle';
  const actionLabel =
    phase === 'submitting'
      ? `AUTHORIZING ${isFortifying ? 'FORTIFICATION' : 'CAPTURE'}…`
      : phase === 'confirming'
        ? 'CONFIRMING ON SEPOLIA…'
        : disabledReason ||
          `STAKE ${formatStrk(totalAllocation ?? 0n, 18)} TO ${isFortifying ? 'FORTIFY' : 'CAPTURE'}`;

  const submit = async () => {
    if (
      disabledReason ||
      parsedAllocation === null ||
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
    setControlPointInteractionLocked(true);
    let submittedHash: string | null = null;

    try {
      const sharedCallOptions = {
        availableStake: operatorStatus.availableStake,
        controlSystemAddress: config.controlSystemAddress,
        isPoolMember: Boolean(stakingContext?.member),
        operatorAddress: address,
        poolAddress: config.stakingPoolAddress,
        strkTokenAddress: config.strkTokenAddress,
      };
      const calls = isFortifying
        ? buildSmartBatchReinforceCalls({
            ...sharedCallOptions,
            reinforcements: controlPoints.map((controlPoint) => ({
              additionalAllocation: parsedAllocation,
              controlPointId: controlPoint.id,
            })),
          })
        : buildSmartBatchCaptureCalls({
            ...sharedCallOptions,
            captures: controlPoints.map((controlPoint) => ({
              allocation: parsedAllocation,
              controlPointId: controlPoint.id,
            })),
          });
      const result = await transaction.sendAsync(calls);

      submittedHash = result.transaction_hash;
      notifySubmitting(
        submittedHash,
        controlPoints.length === 1
          ? `CP-${controlPoints[0].id.toString().padStart(4, '0')} ${isFortifying ? 'FORTIFICATION' : 'CAPTURE'}`
          : `${controlPoints.length} CONTROL POINT ${isFortifying ? 'FORTIFICATIONS' : 'CAPTURES'}`
      );
      setPhase('confirming');
      await provider.waitForTransaction(submittedHash, {
        errorStates: [TransactionExecutionStatus.REVERTED],
      });
      notifyConfirmed(submittedHash);
      if (isFortifying) {
        confirmReinforcedControlPoints(controlPoints, parsedAllocation);
      } else {
        confirmCapturedControlPoints(controlPoints, address, parsedAllocation);
      }
      refreshControlPoint();
      refreshOperator();
      refreshControlPointIndex();
      setStakingRevision((revision) => revision + 1);
    } catch (error) {
      const message = errorMessage(error, intent);
      if (submittedHash) {
        notifyFailed(submittedHash, message);
      }
      setCaptureError(message);
    } finally {
      setPhase('idle');
      setControlPointInteractionLocked(false);
    }
  };

  return (
    <section className="mt-4 border border-neutral-600 bg-neutral-950">
      <header className="flex items-center justify-between border-b border-grid px-3 py-2">
        <span className="text-[10px] tracking-[0.18em] text-dim">
          {controlPoints.length > 1
            ? `${isFortifying ? 'FORTIFY' : 'CAPTURE'} ${controlPoints.length} POINTS`
            : isFortifying
              ? 'FORTIFY CONTROL POINT'
              : controlPoints[0].allocatedStake === 0n
                ? 'CAPTURE NEUTRAL POINT'
                : 'CHALLENGE OWNER'}
        </span>
        <span className="text-[9px] tracking-[0.14em] text-neutral-500">
          {config.starknetChainId.replace('SN_', '')}
        </span>
      </header>

      <div className="px-3 py-3">
        <label
          htmlFor={`${intent}-allocation-${controlPointKey}`}
          className="text-[9px] tracking-[0.18em] text-dim"
        >
          {isFortifying ? 'ADDITIONAL STRK' : 'STRK TO STAKE'}{' '}
          {controlPoints.length > 1 ? 'PER POINT' : ''}
        </label>
        <div className="mt-1 flex border border-neutral-600 bg-black focus-within:border-white">
          <input
            id={`${intent}-allocation-${controlPointKey}`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={allocation}
            disabled={isBusy}
            onChange={(event) => {
              setAllocation(event.target.value);
              setCaptureError(null);
            }}
            aria-describedby={`${intent}-requirement-${controlPointKey}`}
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-fg outline-none disabled:text-neutral-500"
          />
          <span className="border-l border-grid px-3 py-2 text-[10px] tracking-widest text-dim">
            STRK
          </span>
        </div>

        <div
          id={`${intent}-requirement-${controlPointKey}`}
          className="mt-2 flex justify-between gap-4 text-[9px] tracking-[0.12em] text-neutral-500"
        >
          <span>
            {isFortifying ? 'SUGGESTED EACH' : 'MIN EACH'}{' '}
            {formatStrk(
              isFortifying ? suggestedFortification : highestRequiredStake,
              18
            )}
          </span>
          <span>
            AVAILABLE STAKE{' '}
            {formatStrk(operatorStatus?.availableStake ?? 0n, 18)}
          </span>
        </div>

        {controlPoints.length > 1 && totalAllocation !== null ? (
          <div className="mt-2 flex justify-between border-t border-grid pt-2 text-[9px] tracking-[0.12em] text-neutral-400">
            <span>
              {isFortifying ? 'TOTAL ADDITIONAL STAKE' : 'TOTAL STAKE'}
            </span>
            <span className="text-fg">
              {formatStrk(totalAllocation, 18)} STRK
            </span>
          </div>
        ) : null}

        {address && isStakingLoading && (
          <div className="mt-3 flex items-center gap-2 text-neutral-400">
            <span className="h-1.5 w-1.5 animate-pulse bg-white" />
            READING VALIDATOR AND WALLET…
          </div>
        )}

        {stakingContext && (
          <div className="mt-3 space-y-1 border-l border-neutral-700 pl-2 text-[9px] tracking-[0.1em] text-neutral-500">
            <div className="flex justify-between gap-4">
              <span>WALLET</span>
              <span className="text-neutral-300">
                {formatStrk(stakingContext.walletBalance, 18)} STRK
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span>TO STAKE</span>
              <span className={deficit && deficit > 0n ? 'text-fg' : ''}>
                {formatStrk(deficit ?? 0n, 18)} STRK
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span>VALIDATOR</span>
              <span
                className="text-neutral-300"
                title={stakingContext.pool.validatorAddress}
              >
                {shortAddress(stakingContext.pool.validatorAddress)} ·{' '}
                {(stakingContext.member?.commissionBps ??
                  stakingContext.pool.commissionBps) / 100}
                % FEE
              </span>
            </div>
          </div>
        )}

        {stakingError && address && (
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
          onClick={() => void submit()}
          disabled={Boolean(disabledReason) || isBusy}
          className="mt-4 w-full border border-white bg-white px-3 py-2.5 text-[10px] font-semibold tracking-[0.18em] text-black transition-colors hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-500"
        >
          {actionLabel}
        </button>
      </div>
    </section>
  );
}
