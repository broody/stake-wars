import { useEffect, useMemo, useState } from 'react';
import { useProvider, useSendTransaction } from '@starknet-start/react';
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
  buildSmartCaptureCalls,
  stakeDeficit,
} from '../../services/smartCapture';
import type { PoolMemberInfo, StakingPoolInfo } from '../../types';
import { formatStrk, parseStrk, shortAddress } from '../../utils/format';

interface CaptureControlProps {
  controlPoint: ControlPointStatus;
}

type CapturePhase = 'idle' | 'submitting' | 'confirming';

interface StakingContext {
  member: PoolMemberInfo | null;
  pool: StakingPoolInfo;
  walletBalance: bigint;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The capture transaction could not be completed.';
}

export function CaptureControl({ controlPoint }: CaptureControlProps) {
  const { address, isConnected } = useWallet();
  const { operatorStatus, refreshControlPoint, refreshOperator } =
    useControlPoints();
  const { provider } = useProvider();
  const { notifySubmitted, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const transaction = useSendTransaction({});
  const [allocation, setAllocation] = useState(() =>
    formatStrk(controlPoint.requiredStake, 18)
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
    setAllocation(formatStrk(controlPoint.requiredStake, 18));
    setCaptureError(null);
    setPhase('idle');
  }, [controlPoint.id, controlPoint.requiredStake]);

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

  const deficit = useMemo(() => {
    if (parsedAllocation === null || !operatorStatus) return null;
    return stakeDeficit(parsedAllocation, operatorStatus.availableStake);
  }, [operatorStatus, parsedAllocation]);

  const disabledReason = useMemo(() => {
    if (!isConnected) return 'CONNECT OPERATOR TO CAPTURE';
    if (!operatorStatus) return 'WAITING FOR OPERATOR STATE';
    if (parsedAllocation === null || parsedAllocation === 0n) {
      return 'ENTER A VALID ALLOCATION';
    }
    if (parsedAllocation < controlPoint.requiredStake) {
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
    controlPoint.requiredStake,
    deficit,
    isConnected,
    isStakingLoading,
    operatorStatus,
    parsedAllocation,
    stakingContext,
    stakingError,
  ]);

  const isBusy = phase !== 'idle';
  const actionLabel =
    phase === 'submitting'
      ? 'AUTHORIZE SMART CAPTURE…'
      : phase === 'confirming'
        ? 'CONFIRMING ON SEPOLIA…'
        : disabledReason ||
          (deficit && deficit > 0n
            ? `DELEGATE ${formatStrk(deficit, 18)} + CAPTURE`
            : 'ALLOCATE AND CAPTURE');

  const capture = async () => {
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
    let submittedHash: string | null = null;

    try {
      const calls = buildSmartCaptureCalls({
        allocation: parsedAllocation,
        availableStake: operatorStatus.availableStake,
        controlPointId: controlPoint.id,
        controlSystemAddress: config.controlSystemAddress,
        isPoolMember: Boolean(stakingContext?.member),
        operatorAddress: address,
        poolAddress: config.stakingPoolAddress,
        strkTokenAddress: config.strkTokenAddress,
      });
      const result = await transaction.sendAsync(calls);

      submittedHash = result.transaction_hash;
      notifySubmitted(
        submittedHash,
        `CP-${controlPoint.id.toString().padStart(4, '0')} CAPTURE`
      );
      setPhase('confirming');
      await provider.waitForTransaction(submittedHash);
      notifyConfirmed(submittedHash);
      refreshControlPoint();
      refreshOperator();
      setStakingRevision((revision) => revision + 1);
      setPhase('idle');
    } catch (error) {
      const message = errorMessage(error);
      if (submittedHash) {
        notifyFailed(submittedHash, message);
      }
      setCaptureError(message);
      setPhase('idle');
    }
  };

  return (
    <section className="mt-4 border border-neutral-600 bg-neutral-950">
      <header className="flex items-center justify-between border-b border-grid px-3 py-2">
        <span className="text-[10px] tracking-[0.18em] text-dim">
          {controlPoint.allocatedStake === 0n
            ? 'CAPTURE NEUTRAL POINT'
            : 'CHALLENGE CONTROLLER'}
        </span>
        <span className="text-[9px] tracking-[0.14em] text-neutral-500">
          {config.starknetChainId.replace('SN_', '')}
        </span>
      </header>

      <div className="px-3 py-3">
        <label
          htmlFor={`capture-allocation-${controlPoint.id}`}
          className="text-[9px] tracking-[0.18em] text-dim"
        >
          STRK ALLOCATION
        </label>
        <div className="mt-1 flex border border-neutral-600 bg-black focus-within:border-white">
          <input
            id={`capture-allocation-${controlPoint.id}`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={allocation}
            disabled={isBusy}
            onChange={(event) => {
              setAllocation(event.target.value);
              setCaptureError(null);
            }}
            aria-describedby={`capture-requirement-${controlPoint.id}`}
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-fg outline-none disabled:text-neutral-500"
          />
          <span className="border-l border-grid px-3 py-2 text-[10px] tracking-widest text-dim">
            STRK
          </span>
        </div>

        <div
          id={`capture-requirement-${controlPoint.id}`}
          className="mt-2 flex justify-between gap-4 text-[9px] tracking-[0.12em] text-neutral-500"
        >
          <span>MIN {formatStrk(controlPoint.requiredStake, 18)}</span>
          <span>
            DELEGATED AVAILABLE{' '}
            {formatStrk(operatorStatus?.availableStake ?? 0n, 18)}
          </span>
        </div>

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
              <span>TO DELEGATE</span>
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

        <p className="mt-3 leading-relaxed text-neutral-400">
          {!address
            ? 'Connect an Operator wallet to calculate the delegation route.'
            : !operatorStatus
              ? 'Reading delegated STRK command power…'
              : deficit && deficit > 0n
                ? `One atomic transaction approves ${formatStrk(deficit, 18)} STRK, ${
                    stakingContext?.member ? 'tops up' : 'enters'
                  } the validator pool, then captures this point.`
                : 'Uses your existing delegated STRK command power; no token transfer is needed.'}{' '}
          Staking stays under your account. Network fees and the staking exit
          delay apply.
        </p>

        {captureError && (
          <div className="mt-3 border-l-2 border-amber-400 pl-2 leading-relaxed text-amber-400">
            CAPTURE FAILED · {captureError}
          </div>
        )}

        <button
          type="button"
          onClick={() => void capture()}
          disabled={Boolean(disabledReason) || isBusy}
          className="mt-4 w-full border border-white bg-white px-3 py-2.5 text-[10px] font-semibold tracking-[0.18em] text-black transition-colors hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-500"
        >
          {actionLabel}
        </button>
      </div>
    </section>
  );
}
