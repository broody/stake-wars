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
  buildSmartGameActionCalls,
  stakeDeficit,
} from '../../services/smartCapture';
import { prepareSealedBid } from '../../services/sealedBids';
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
  const bidSubmitted = Boolean(
    challenged &&
      operatorStatus?.activeChallengeId === point.activeChallengeId &&
      operatorStatus.activeChallengeBidSubmitted
  );
  const availablePower = operatorStatus?.availablePower ?? 0n;
  const requiredPower = point?.requiredStake ?? 0n;
  const pointPowerIncluded = challenged && owned ? point.capturePower : 0n;
  const minimumBidPower =
    challenged && owned ? point.capturePower : requiredPower;
  const bidBacking = availablePower + pointPowerIncluded;
  const suggestedAllocation =
    action === 'capture'
      ? requiredPower
      : action === 'challenge'
        ? minimumBidPower
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
  const selectedAdditionalPower =
    action === 'challenge' && selectedAllocation !== null
      ? selectedAllocation > pointPowerIncluded
        ? selectedAllocation - pointPowerIncluded
        : 0n
      : (selectedAllocation ?? 0n);
  const deficit =
    selectedAllocation === null
      ? 0n
      : stakeDeficit(selectedAdditionalPower, availablePower);
  const currentPosition =
    action === 'reinforce' ? (point?.capturePower ?? 0n) : 0n;
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
    if (expired) return 'AWAITING AUTOMATIC SETTLEMENT';
    if (bidSubmitted) return 'SEALED BID ALREADY SUBMITTED';
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
    bidSubmitted,
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
    if (action === 'challenge' && selectedAllocation < minimumBidPower) {
      return `ALLOCATE AT LEAST ${formatStrk(minimumBidPower, 18)} STRK`;
    }
    return null;
  }, [
    action,
    commonDisabledReason,
    expired,
    minimumBidPower,
    requiredPower,
    selectedAllocation,
  ]);

  const collateralCommonDisabledReason =
    commonDisabledReason === 'INSUFFICIENT WALLET STRK' ||
    commonDisabledReason === 'READING WALLET STRK'
      ? null
      : commonDisabledReason;

  const submit = async (withCollateral = false) => {
    if (
      !point ||
      !address ||
      !operatorStatus ||
      (withCollateral
        ? collateralCommonDisabledReason
        : commonDisabledReason) ||
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
      let calls;
      let label: string;
      if (action === 'reinforce') {
        if (allocationAmount === 0n) {
          throw new Error('Enter the additional STRK allocation.');
        }
        const member =
          stakeDeficit(allocationAmount, freshOperator.availablePower) > 0n
            ? await getPoolMemberInfo(address)
            : staking?.member;
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
      } else if (action === 'challenge') {
        if (
          freshPoint.challengeDeadline &&
          freshPoint.challengeDeadline <= Date.now() / 1_000
        ) {
          throw new Error('Bidding has closed. Settlement is automatic.');
        }
        if (
          freshOperator.activeChallengeId === freshPoint.activeChallengeId &&
          freshOperator.activeChallengeBidSubmitted
        ) {
          throw new Error('You already submitted a sealed bid.');
        }
        const freshPointIncluded = addressesMatch(
          freshPoint.controller,
          address
        )
          ? freshPoint.capturePower
          : 0n;
        let collateralPower = 0n;
        let source: number | null = null;
        if (withCollateral) {
          source = Number(collateralId);
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
          collateralPower = sourcePoint.capturePower;
        }
        const freshMinimumBid = freshPointIncluded
          ? freshPoint.capturePower
          : freshPoint.requiredStake;
        if (allocationAmount < freshMinimumBid) {
          throw new Error(
            `Maximum bid must be at least ${formatStrk(
              freshMinimumBid,
              18
            )} STRK.`
          );
        }
        const nonAvailableBacking = freshPointIncluded + collateralPower;
        const additionalNeeded =
          allocationAmount > nonAvailableBacking
            ? allocationAmount - nonAvailableBacking
            : 0n;
        const member =
          stakeDeficit(additionalNeeded, freshOperator.availablePower) > 0n
            ? await getPoolMemberInfo(address)
            : staking?.member;
        const sealed = await prepareSealedBid(
          point.id,
          address,
          allocationAmount
        );
        const entrypoint = withCollateral
          ? 'submit_sealed_bid_with_collateral'
          : 'submit_sealed_bid';
        calls = buildSmartGameActionCalls({
          controlSystemAddress: config.controlSystemAddress,
          entrypoint,
          calldata: withCollateral
            ? [String(point.id), String(source), sealed.commitment.toString()]
            : [String(point.id), sealed.commitment.toString()],
          allocation: additionalNeeded,
          availablePower: freshOperator.availablePower,
          operatorAddress: address,
          poolAddress: config.stakingPoolAddress,
          strkTokenAddress: config.strkTokenAddress,
          isPoolMember: Boolean(member),
        });
        label = withCollateral ? 'SEALED COLLATERAL BID' : 'SEALED BID';
      } else {
        const entrypoint = 'capture';
        if (allocationAmount < freshPoint.requiredStake) {
          throw new Error(
            `Allocation no longer reaches the required ${formatStrk(
              freshPoint.requiredStake,
              18
            )} STRK commitment.`
          );
        }
        const member =
          stakeDeficit(allocationAmount, freshOperator.availablePower) > 0n
            ? await getPoolMemberInfo(address)
            : staking?.member;
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
        label = 'CAPTURE';
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
            ? 'AWAITING SETTLEMENT'
            : deficit > 0n
              ? `STAKE ${formatStrk(deficit, 18)} + ${
                  action === 'challenge' ? 'SEAL BID' : action.toUpperCase()
                }`
              : `${action === 'challenge' ? 'SEAL BID' : action.toUpperCase()} WITH ${formatStrk(
                  selectedAllocation ?? 0n,
                  18
                )} STRK`);

  return (
    <section className="mt-4 border border-neutral-600 bg-neutral-950">
      <header className="border-b border-grid px-3 py-2 text-[10px] tracking-[0.18em] text-dim">
        {challenged
          ? 'SEALED VICKREY CHALLENGE'
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
                  ? 'PRIVATE MAXIMUM BID'
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
            {action !== 'challenge' && (
              <div className="flex justify-between gap-4">
                <span>CURRENT COMMITMENT</span>
                <span>{formatStrk(currentPosition, 18)} STRK</span>
              </div>
            )}
            {(action === 'capture' || action === 'challenge') && (
              <div className="flex justify-between gap-4">
                <span>REQUIRED TOTAL</span>
                <span>
                  {formatStrk(
                    action === 'challenge' ? minimumBidPower : requiredPower,
                    18
                  )}{' '}
                  STRK
                </span>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t border-grid pt-2">
              <span>
                {action === 'challenge'
                  ? 'MAXIMUM BID (ENCRYPTED)'
                  : 'RESULTING COMMITMENT'}
              </span>
              <span className="text-fg">
                {formatStrk(projectedCommitment, 18)} STRK
              </span>
            </div>
            {action === 'challenge' && (
              <>
                <div className="flex justify-between gap-4">
                  <span>PUBLIC BID COLLATERAL</span>
                  <span>{formatStrk(bidBacking + deficit, 18)} STRK</span>
                </div>
                <p className="leading-relaxed text-dim">
                  Your maximum stays encrypted. All available delegation is
                  locked until settlement; the winner commits only the clearing
                  price. Fresh staking remains public and may hint at your
                  maximum.
                </p>
              </>
            )}
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
        {challenged && (
          <div className="flex justify-between gap-4">
            <span>SEALED POSITIONS</span>
            <span>{point.challengeBidCount}</span>
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
                  Boolean(collateralCommonDisabledReason)
                }
                className="border border-neutral-600 px-3 text-fg hover:border-white disabled:text-neutral-600"
              >
                SACRIFICE + SEAL BID
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
