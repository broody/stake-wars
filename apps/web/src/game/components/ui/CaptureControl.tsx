import { useEffect, useMemo, useState } from 'react';
import { useProvider, useSendTransaction } from '@starknet-start/react';
import { TransactionExecutionStatus } from 'starknet';
import type { ControlPointStatus, PoolMemberInfo } from '../../types';
import { useControlPoints } from '../../contexts/ControlPointContext';
import { useWallet } from '../../contexts/WalletContext';
import { useTransactionToast } from '../../contexts/TransactionToastContext';
import { config } from '../../services/config';
import {
  getControlPointStatus,
  getOperatorStatus,
  getPoolMemberInfo,
  getStakingPoolInfo,
  getStrkBalance,
} from '../../services/starknet';
import {
  buildControlCall,
  buildSmartGameActionCalls,
  stakeDeficit,
} from '../../services/smartCapture';
import { addressesMatch, formatStrk, parseStrk } from '../../utils/format';

interface CaptureControlProps {
  controlPoints: ControlPointStatus[];
  intent?: 'capture' | 'fortify';
}

type Phase = 'idle' | 'submitting' | 'confirming';

interface StakingContext {
  member: PoolMemberInfo | null;
  walletBalance: bigint;
}

const MAX_U128 = (1n << 128n) - 1n;

export function CaptureControl({ controlPoints, intent }: CaptureControlProps) {
  const point = controlPoints[0];
  const { address, isConnected } = useWallet();
  const {
    operatorStatus,
    refreshControlPoint,
    refreshOperator,
    refreshControlPointIndex,
    setControlPointInteractionLocked,
  } = useControlPoints();
  const { provider } = useProvider();
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const transaction = useSendTransaction({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [staking, setStaking] = useState<StakingContext | null>(null);
  const [allocation, setAllocation] = useState('');
  const [collateralId, setCollateralId] = useState('');

  const challenged = point?.activeChallengeId !== 0n;
  const owned = Boolean(
    address && point && addressesMatch(point.controller, address)
  );
  const neutral = point?.capturePower === 0n;
  const action = challenged
    ? 'challenge'
    : neutral
      ? 'capture'
      : owned || intent === 'fortify'
        ? 'reinforce'
        : 'challenge';
  const expired = Boolean(
    challenged &&
      point.challengeDeadline &&
      point.challengeDeadline <= Date.now() / 1_000
  );
  const existingCommitment =
    operatorStatus &&
    point &&
    operatorStatus.activeChallengeId === point.activeChallengeId
      ? operatorStatus.activeChallengeCommitment
      : 0n;
  const holdsHighGround = Boolean(
    address && challenged && addressesMatch(point.challengeLeader, address)
  );
  const availablePower = operatorStatus?.availablePower ?? 0n;
  const requiredPower = point?.requiredStake ?? 0n;
  const suggestedAllocation =
    action === 'capture'
      ? requiredPower
      : action === 'challenge' && requiredPower > existingCommitment
        ? requiredPower - existingCommitment
        : 0n;

  useEffect(() => {
    setError(null);
    setCollateralId('');
    setAllocation(
      suggestedAllocation > 0n ? formatStrk(suggestedAllocation, 18) : ''
    );
  }, [action, point?.id, suggestedAllocation]);

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
  const deficit =
    selectedAllocation === null
      ? 0n
      : stakeDeficit(selectedAllocation, availablePower);
  const currentPosition =
    action === 'reinforce' ? (point?.capturePower ?? 0n) : existingCommitment;
  const projectedCommitment =
    currentPosition + (selectedAllocation === null ? 0n : selectedAllocation);

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

  const commonDisabledReason = useMemo(() => {
    if (controlPoints.length !== 1 || !point) return 'SELECT ONE CONTROL POINT';
    if (!isConnected || !address) return 'CONNECT OPERATOR';
    if (!operatorStatus) return 'WAITING FOR OPERATOR STATE';
    if (operatorStatus.retired) return 'ADDRESS PERMANENTLY RETIRED';
    if (operatorStatus.needsSync) return 'OPERATOR SYNC REQUIRED';
    if (expired) return null;
    if (holdsHighGround) return 'YOU HOLD THE HIGH GROUND';
    if (
      operatorStatus.activeChallengeId !== 0n &&
      operatorStatus.activeChallengeId !== point.activeChallengeId
    ) {
      return 'ALREADY IN ANOTHER CHALLENGE';
    }
    if (parsedAllocation.error) return 'ENTER A VALID ALLOCATION';
    if (deficit > 0n && !staking) return 'READING WALLET STRK';
    if (deficit > (staking?.walletBalance ?? 0n))
      return 'INSUFFICIENT WALLET STRK';
    return null;
  }, [
    address,
    controlPoints.length,
    deficit,
    expired,
    holdsHighGround,
    isConnected,
    operatorStatus,
    parsedAllocation.error,
    point,
    staking,
  ]);

  const primaryDisabledReason = useMemo(() => {
    if (commonDisabledReason || expired) return commonDisabledReason;
    if (selectedAllocation === null || selectedAllocation === 0n)
      return 'ENTER ALLOCATION';
    if (action === 'capture' && selectedAllocation < requiredPower) {
      return `ALLOCATE AT LEAST ${formatStrk(requiredPower, 18)} STRK`;
    }
    if (
      action === 'challenge' &&
      existingCommitment + selectedAllocation < requiredPower
    ) {
      return `ALLOCATE AT LEAST ${formatStrk(
        requiredPower - existingCommitment,
        18
      )} STRK`;
    }
    return null;
  }, [
    action,
    commonDisabledReason,
    existingCommitment,
    expired,
    requiredPower,
    selectedAllocation,
  ]);

  const submit = async (withCollateral = false) => {
    if (
      !point ||
      !address ||
      !operatorStatus ||
      commonDisabledReason ||
      (!withCollateral && primaryDisabledReason) ||
      !config.controlSystemAddress
    ) {
      return;
    }
    const allocationAmount = selectedAllocation ?? 0n;
    setError(null);
    setPhase('submitting');
    setControlPointInteractionLocked(true);
    let hash: string | null = null;
    try {
      const [freshPoint, freshOperator] = await Promise.all([
        getControlPointStatus(point.id),
        getOperatorStatus(address),
      ]);
      const freshChallenged = freshPoint.activeChallengeId !== 0n;
      const shouldSettle = Boolean(
        freshChallenged &&
          freshPoint.challengeDeadline &&
          freshPoint.challengeDeadline <= Date.now() / 1_000
      );
      const needsStake =
        !shouldSettle &&
        stakeDeficit(allocationAmount, freshOperator.availablePower) > 0n;
      const member = needsStake
        ? await getPoolMemberInfo(address)
        : staking?.member;
      let calls;
      let label: string;
      if (shouldSettle) {
        calls = buildControlCall(
          config.controlSystemAddress,
          'settle_challenge',
          [String(point.id)]
        );
        label = 'CHALLENGE SETTLEMENT';
      } else if (action === 'reinforce') {
        if (allocationAmount === 0n) {
          throw new Error('Enter the additional STRK allocation.');
        }
        calls = buildSmartGameActionCalls({
          controlSystemAddress: config.controlSystemAddress,
          entrypoint: 'reinforce',
          calldata: [String(point.id), allocationAmount.toString()],
          allocation: allocationAmount,
          availablePower: freshOperator.availablePower,
          operatorAddress: address,
          poolAddress: config.stakingPoolAddress,
          strkTokenAddress: config.strkTokenAddress,
          isPoolMember: Boolean(member),
        });
        label = 'FORTIFICATION';
      } else if (withCollateral) {
        const source = Number(collateralId);
        if (!Number.isInteger(source) || source < 0 || source === point.id) {
          throw new Error(
            'Enter a different owned Control Point ID as collateral.'
          );
        }
        const sourcePoint = await getControlPointStatus(source);
        if (
          !addressesMatch(sourcePoint.controller, address) ||
          sourcePoint.activeChallengeId !== 0n
        ) {
          throw new Error(
            'Collateral must be an uncontested Control Point you own.'
          );
        }
        const freshExisting =
          freshOperator.activeChallengeId === freshPoint.activeChallengeId
            ? freshOperator.activeChallengeCommitment
            : 0n;
        if (
          freshExisting + allocationAmount + sourcePoint.capturePower <
          freshPoint.requiredStake
        ) {
          throw new Error(
            `Collateral plus allocation must reach ${formatStrk(
              freshPoint.requiredStake,
              18
            )} STRK.`
          );
        }
        calls = buildSmartGameActionCalls({
          controlSystemAddress: config.controlSystemAddress,
          entrypoint: 'challenge_with_collateral',
          calldata: [
            String(point.id),
            String(source),
            allocationAmount.toString(),
          ],
          allocation: allocationAmount,
          availablePower: freshOperator.availablePower,
          operatorAddress: address,
          poolAddress: config.stakingPoolAddress,
          strkTokenAddress: config.strkTokenAddress,
          isPoolMember: Boolean(member),
        });
        label = 'COLLATERAL CHALLENGE';
      } else {
        const entrypoint = action === 'capture' ? 'capture' : 'challenge';
        const freshExisting =
          freshOperator.activeChallengeId === freshPoint.activeChallengeId
            ? freshOperator.activeChallengeCommitment
            : 0n;
        if (
          (entrypoint === 'capture' &&
            allocationAmount < freshPoint.requiredStake) ||
          (entrypoint === 'challenge' &&
            freshExisting + allocationAmount < freshPoint.requiredStake)
        ) {
          throw new Error(
            `Allocation no longer reaches the required ${formatStrk(
              freshPoint.requiredStake,
              18
            )} STRK commitment.`
          );
        }
        calls = buildSmartGameActionCalls({
          controlSystemAddress: config.controlSystemAddress,
          entrypoint,
          calldata: [String(point.id), allocationAmount.toString()],
          allocation: allocationAmount,
          availablePower: freshOperator.availablePower,
          operatorAddress: address,
          poolAddress: config.stakingPoolAddress,
          strkTokenAddress: config.strkTokenAddress,
          isPoolMember: Boolean(member),
        });
        label = action === 'capture' ? 'CAPTURE' : 'CHALLENGE';
      }

      const result = await transaction.sendAsync(calls);
      hash = result.transaction_hash;
      notifySubmitting(
        hash,
        `CP-${String(point.id).padStart(4, '0')} ${label}`
      );
      setPhase('confirming');
      await provider.waitForTransaction(hash, {
        errorStates: [TransactionExecutionStatus.REVERTED],
      });
      notifyConfirmed(hash);
      refreshControlPoint();
      refreshOperator();
      refreshControlPointIndex();
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'Transaction failed.';
      setError(message);
      if (hash) notifyFailed(hash, message);
    } finally {
      setPhase('idle');
      setControlPointInteractionLocked(false);
    }
  };

  const label =
    phase === 'submitting'
      ? 'AUTHORIZING…'
      : phase === 'confirming'
        ? 'CONFIRMING ON SEPOLIA…'
        : primaryDisabledReason ||
          (expired
            ? 'SETTLE CHALLENGE'
            : deficit > 0n
              ? `STAKE ${formatStrk(deficit, 18)} + ${action.toUpperCase()}`
              : `${action.toUpperCase()} WITH ${formatStrk(
                  selectedAllocation ?? 0n,
                  18
                )} STRK`);

  return (
    <section className="mt-4 border border-neutral-600 bg-neutral-950">
      <header className="border-b border-grid px-3 py-2 text-[10px] tracking-[0.18em] text-dim">
        {challenged
          ? 'ACTIVE CHALLENGE'
          : neutral
            ? 'CAPTURE NEUTRAL POINT'
            : owned
              ? 'FORTIFY CONTROL POINT'
              : 'CHALLENGE OWNER'}
      </header>
      <div className="space-y-2 px-3 py-3 text-[9px] tracking-[0.12em] text-neutral-500">
        <div className="flex justify-between gap-4">
          <span>AVAILABLE POWER</span>
          <span className="text-fg">{formatStrk(availablePower, 18)} STRK</span>
        </div>
        {!expired && (
          <>
            <label
              className="block pt-1 text-dim"
              htmlFor={`allocation-${point?.id ?? 'none'}`}
            >
              {action === 'reinforce'
                ? 'ADDITIONAL ALLOCATION'
                : action === 'challenge'
                  ? 'ADDITIONAL CHALLENGE POWER'
                  : 'POINT ALLOCATION'}
            </label>
            <div className="flex items-center border border-neutral-700 bg-black focus-within:border-white">
              <input
                id={`allocation-${point?.id ?? 'none'}`}
                value={allocation}
                onChange={(event) => setAllocation(event.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-fg outline-none"
              />
              <span className="px-2 text-dim">STRK</span>
            </div>
            {parsedAllocation.error && (
              <div className="leading-relaxed text-amber-400">
                {parsedAllocation.error}
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span>CURRENT COMMITMENT</span>
              <span>{formatStrk(currentPosition, 18)} STRK</span>
            </div>
            {(action === 'capture' || action === 'challenge') && (
              <div className="flex justify-between gap-4">
                <span>REQUIRED TOTAL</span>
                <span>{formatStrk(requiredPower, 18)} STRK</span>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t border-grid pt-2">
              <span>
                {action === 'challenge'
                  ? 'RESULT BEFORE COLLATERAL'
                  : 'RESULTING COMMITMENT'}
              </span>
              <span className="text-fg">
                {formatStrk(projectedCommitment, 18)} STRK
              </span>
            </div>
          </>
        )}
        {challenged && point.challengeDeadline && (
          <div className="flex justify-between gap-4">
            <span>DEADLINE</span>
            <span>
              {new Date(point.challengeDeadline * 1_000).toLocaleString()}
            </span>
          </div>
        )}
        {error && (
          <div className="border-l-2 border-amber-400 pl-2 leading-relaxed text-amber-400">
            ACTION FAILED · {error}
          </div>
        )}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={Boolean(primaryDisabledReason) || phase !== 'idle'}
          className="mt-2 w-full border border-white bg-white px-3 py-2.5 text-[10px] font-semibold tracking-[0.18em] text-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-500"
        >
          {label}
        </button>
        {action === 'challenge' && !expired && (
          <div className="border-t border-grid pt-3">
            <label
              className="block text-dim"
              htmlFor={`collateral-${point.id}`}
            >
              SACRIFICE OWNED CP ID
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id={`collateral-${point.id}`}
                value={collateralId}
                onChange={(event) => setCollateralId(event.target.value)}
                inputMode="numeric"
                placeholder="e.g. 0042"
                className="min-w-0 flex-1 border border-neutral-700 bg-black px-2 py-2 text-fg outline-none focus:border-white"
              />
              <button
                type="button"
                onClick={() => void submit(true)}
                disabled={
                  !collateralId ||
                  phase !== 'idle' ||
                  Boolean(commonDisabledReason)
                }
                className="border border-neutral-600 px-3 text-fg hover:border-white disabled:text-neutral-600"
              >
                SACRIFICE + CHALLENGE
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
