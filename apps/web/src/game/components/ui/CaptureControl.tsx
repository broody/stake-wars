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
import { addressesMatch, formatStrk } from '../../utils/format';

interface CaptureControlProps {
  controlPoints: ControlPointStatus[];
  intent?: 'capture' | 'fortify';
}

type Phase = 'idle' | 'submitting' | 'confirming';

interface StakingContext {
  member: PoolMemberInfo | null;
  walletBalance: bigint;
}

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
  const deficit =
    action === 'capture' || action === 'challenge'
      ? stakeDeficit(requiredPower, existingCommitment, availablePower)
      : 0n;
  const projectedCommitment = existingCommitment + availablePower + deficit;

  useEffect(() => {
    setError(null);
    setCollateralId('');
  }, [point?.id, action]);

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
    if (controlPoints.length !== 1) return 'SELECT ONE CONTROL POINT';
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
    if (action === 'reinforce' && availablePower === 0n)
      return 'STAKE MORE STRK TO FORTIFY';
    if (deficit > 0n && !staking) return 'READING WALLET STRK';
    if (deficit > (staking?.walletBalance ?? 0n))
      return 'INSUFFICIENT WALLET STRK';
    return null;
  }, [
    action,
    address,
    availablePower,
    controlPoints.length,
    deficit,
    expired,
    holdsHighGround,
    isConnected,
    operatorStatus,
    point.activeChallengeId,
    staking,
  ]);

  const submit = async (withCollateral = false) => {
    if (
      !point ||
      !address ||
      !operatorStatus ||
      disabledReason ||
      !config.controlSystemAddress
    ) {
      return;
    }
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
        calls = buildControlCall(config.controlSystemAddress, 'reinforce', [
          String(point.id),
        ]);
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
        calls = buildSmartGameActionCalls({
          controlSystemAddress: config.controlSystemAddress,
          entrypoint: 'challenge_with_collateral',
          calldata: [String(point.id), String(source)],
          requiredPower: freshPoint.requiredStake,
          existingCommitment: freshExisting,
          availablePower:
            freshOperator.availablePower + sourcePoint.capturePower,
          operatorAddress: address,
          poolAddress: config.stakingPoolAddress,
          strkTokenAddress: config.strkTokenAddress,
          isPoolMember: Boolean(staking?.member),
        });
        label = 'COLLATERAL CHALLENGE';
      } else {
        const entrypoint = action === 'capture' ? 'capture' : 'challenge';
        const freshExisting =
          freshOperator.activeChallengeId === freshPoint.activeChallengeId
            ? freshOperator.activeChallengeCommitment
            : 0n;
        calls = buildSmartGameActionCalls({
          controlSystemAddress: config.controlSystemAddress,
          entrypoint,
          calldata: [String(point.id)],
          requiredPower: freshPoint.requiredStake,
          existingCommitment: freshExisting,
          availablePower: freshOperator.availablePower,
          operatorAddress: address,
          poolAddress: config.stakingPoolAddress,
          strkTokenAddress: config.strkTokenAddress,
          isPoolMember: Boolean(staking?.member),
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
        : disabledReason ||
          (expired
            ? 'SETTLE CHALLENGE'
            : action === 'reinforce'
              ? `FORTIFY WITH ${formatStrk(availablePower, 18)} STRK`
              : deficit > 0n
                ? `STAKE ${formatStrk(deficit, 18)} + ${action.toUpperCase()}`
                : `${action.toUpperCase()} WITH ${formatStrk(availablePower, 18)} STRK`);

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
        {(action === 'capture' || action === 'challenge') && !expired && (
          <>
            <div className="flex justify-between gap-4">
              <span>CURRENT COMMITMENT</span>
              <span>{formatStrk(existingCommitment, 18)} STRK</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>REQUIRED TOTAL</span>
              <span>{formatStrk(requiredPower, 18)} STRK</span>
            </div>
            <div className="flex justify-between gap-4 border-t border-grid pt-2">
              <span>RESULTING COMMITMENT</span>
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
          disabled={Boolean(disabledReason) || phase !== 'idle'}
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
                  Boolean(operatorStatus?.retired)
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
