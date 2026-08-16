import { useEffect, useMemo, useState } from 'react';
import { useProvider, useSendTransaction } from '@starknet-start/react';
import { TransactionExecutionStatus } from 'starknet';
import type {
  ChallengeParticipantStatus,
  ChallengeStatus,
  ControlPointStatus,
  PoolMemberInfo,
} from '../../types';
import { useControlPoints } from '../../contexts/ControlPointContext';
import { useWallet } from '../../contexts/WalletContext';
import { useTransactionToast } from '../../contexts/TransactionToastContext';
import { config } from '../../services/config';
import {
  getChallengeParticipantStatus,
  getChallengeStatus,
  getControlPointStatus,
  getOperatorStatus,
  getPoolMemberInfo,
  getStakingPoolInfo,
  getStrkBalance,
} from '../../services/starknet';
import {
  buildControlCall,
  buildSmartGameActionCalls,
  incrementalBidPower,
  stakeDeficit,
} from '../../services/smartCapture';
import {
  addressesMatch,
  formatStrk,
  parseStrk,
  shortAddress,
} from '../../utils/format';

interface CaptureControlProps {
  controlPoints: ControlPointStatus[];
  intent?: 'capture' | 'fortify';
}

type Phase = 'idle' | 'submitting' | 'confirming';
type Action = 'capture' | 'reinforce' | 'bid' | 'settle';

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
  const [challenge, setChallenge] = useState<ChallengeStatus | null>(null);
  const [participant, setParticipant] =
    useState<ChallengeParticipantStatus | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);

  const pointId = point?.id;
  const activeChallengeId = point?.activeChallengeId ?? 0n;
  const challenged = activeChallengeId !== 0n;
  const owned = Boolean(
    address && point && addressesMatch(point.controller, address)
  );
  const neutral = point?.capturePower === 0n;
  const expired = Boolean(
    challenged &&
      point.challengeDeadline &&
      point.challengeDeadline <= Date.now() / 1_000
  );
  const action: Action = expired
    ? 'settle'
    : challenged
      ? 'bid'
      : neutral
        ? 'capture'
        : owned || intent === 'fortify'
          ? 'reinforce'
          : 'bid';
  const availablePower = operatorStatus?.availablePower ?? 0n;
  const requiredPower = point?.requiredStake ?? 0n;
  const currentLeader = Boolean(
    address && challenge && addressesMatch(challenge.leader, address)
  );
  const suggestedAllocation =
    action === 'capture' || action === 'bid' ? requiredPower : 0n;

  useEffect(() => {
    setError(null);
    setCollateralId('');
    setAllocation(
      suggestedAllocation > 0n ? formatStrk(suggestedAllocation, 18) : ''
    );
  }, [action, point?.id, suggestedAllocation]);

  useEffect(() => {
    const controller = new AbortController();
    if (!challenged || pointId === undefined) {
      setChallenge(null);
      setParticipant(null);
      setChallengeLoading(false);
      return () => controller.abort();
    }
    setChallengeLoading(true);
    Promise.all([
      getChallengeStatus(activeChallengeId, controller.signal),
      address
        ? getChallengeParticipantStatus(
            activeChallengeId,
            address,
            controller.signal
          )
        : Promise.resolve(null),
    ])
      .then(([nextChallenge, nextParticipant]) => {
        setChallenge(nextChallenge);
        setParticipant(nextParticipant);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to read the open contest.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setChallengeLoading(false);
      });
    return () => controller.abort();
  }, [activeChallengeId, address, challenged, pointId]);

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
  const personalBid = participant?.joined ? participant.bidPower : 0n;
  const requestedPower = action === 'settle' ? 0n : (selectedAllocation ?? 0n);
  const additionalBidPower =
    action === 'bid'
      ? incrementalBidPower(requestedPower, personalBid)
      : requestedPower;
  const deficit = stakeDeficit(additionalBidPower, availablePower);
  const currentPosition =
    action === 'reinforce' ? (point?.capturePower ?? 0n) : 0n;
  const projectedCommitment = currentPosition + requestedPower;

  useEffect(() => {
    const controller = new AbortController();
    if (!address || deficit === 0n || action === 'settle') {
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
  }, [action, address, deficit]);

  const commonDisabledReason = useMemo(() => {
    if (controlPoints.length !== 1 || !point) return 'SELECT ONE CONTROL POINT';
    if (!isConnected || !address) return 'CONNECT OPERATOR';
    if (action === 'settle') return null;
    if (!operatorStatus) return 'WAITING FOR OPERATOR STATE';
    if (operatorStatus.retired) return 'ADDRESS PERMANENTLY RETIRED';
    if (operatorStatus.needsSync) return 'OPERATOR SYNC REQUIRED';
    if (challenged && challengeLoading) return 'READING OPEN CONTEST';
    if (action === 'bid' && currentLeader) return 'YOU ARE CURRENTLY LEADING';
    if (parsedAllocation.error) return 'ENTER A VALID STRK AMOUNT';
    if (deficit > 0n && !staking) return 'READING WALLET STRK';
    if (deficit > (staking?.walletBalance ?? 0n))
      return 'INSUFFICIENT WALLET STRK';
    return null;
  }, [
    action,
    address,
    challenged,
    challengeLoading,
    controlPoints.length,
    currentLeader,
    deficit,
    isConnected,
    operatorStatus,
    parsedAllocation.error,
    point,
    staking,
  ]);

  const primaryDisabledReason = useMemo(() => {
    if (commonDisabledReason) return commonDisabledReason;
    if (action === 'settle') return null;
    if (selectedAllocation === null || selectedAllocation === 0n)
      return 'ENTER STRK AMOUNT';
    if (
      (action === 'capture' || action === 'bid') &&
      selectedAllocation < requiredPower
    ) {
      return `BID AT LEAST ${formatStrk(requiredPower, 18)} STRK`;
    }
    return null;
  }, [action, commonDisabledReason, requiredPower, selectedAllocation]);

  const collateralCommonDisabledReason =
    commonDisabledReason === 'INSUFFICIENT WALLET STRK' ||
    commonDisabledReason === 'READING WALLET STRK'
      ? null
      : commonDisabledReason;

  const submit = async (withSacrifice = false) => {
    if (
      !point ||
      !address ||
      !config.controlSystemAddress ||
      (withSacrifice ? collateralCommonDisabledReason : primaryDisabledReason)
    ) {
      return;
    }
    const allocationAmount = selectedAllocation ?? 0n;
    setError(null);
    setPhase('submitting');
    setControlPointInteractionLocked(true);
    let hash: string | null = null;
    try {
      const freshPoint = await getControlPointStatus(point.id);
      let calls;
      let label: string;

      if (action === 'settle') {
        if (
          freshPoint.activeChallengeId === 0n ||
          !freshPoint.challengeDeadline ||
          freshPoint.challengeDeadline > Date.now() / 1_000
        ) {
          throw new Error(
            'The response window is still active or already settled.'
          );
        }
        calls = buildControlCall(
          config.controlSystemAddress,
          'settle_challenge',
          [String(point.id)]
        );
        label = 'CONTEST SETTLEMENT';
      } else {
        if (!operatorStatus) throw new Error('Operator state is unavailable.');
        const freshOperator = await getOperatorStatus(address);
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
        } else if (action === 'bid') {
          if (
            freshPoint.activeChallengeId !== 0n &&
            freshPoint.challengeDeadline &&
            freshPoint.challengeDeadline <= Date.now() / 1_000
          ) {
            throw new Error('The response window ended. Settle the contest.');
          }
          let previousPersonalBid = 0n;
          if (freshPoint.activeChallengeId !== 0n) {
            const freshChallenge = await getChallengeStatus(
              freshPoint.activeChallengeId
            );
            if (addressesMatch(freshChallenge.leader, address)) {
              throw new Error('You are already the current leader.');
            }
            const freshParticipant = await getChallengeParticipantStatus(
              freshPoint.activeChallengeId,
              address
            );
            if (freshParticipant.joined && !freshParticipant.resolved) {
              previousPersonalBid = freshParticipant.bidPower;
            }
          }

          let sacrificedPower = 0n;
          let source: number | null = null;
          if (withSacrifice) {
            source = Number(collateralId);
            if (
              !Number.isInteger(source) ||
              source < 0 ||
              source === point.id
            ) {
              throw new Error(
                'Enter a different owned Control Point ID to sacrifice.'
              );
            }
            const sourcePoint = await getControlPointStatus(source);
            if (
              !addressesMatch(sourcePoint.controller, address) ||
              sourcePoint.activeChallengeId !== 0n
            ) {
              throw new Error(
                'The sacrificed Control Point must be uncontested and owned by you.'
              );
            }
            sacrificedPower = sourcePoint.capturePower;
          }
          if (allocationAmount < freshPoint.requiredStake) {
            throw new Error(
              `Bid must exceed the current lead with at least ${formatStrk(
                freshPoint.requiredStake,
                18
              )} STRK.`
            );
          }
          const addedBidPower = incrementalBidPower(
            allocationAmount,
            previousPersonalBid
          );
          const allocationAfterSacrifice =
            addedBidPower > sacrificedPower
              ? addedBidPower - sacrificedPower
              : 0n;
          const member =
            stakeDeficit(
              allocationAfterSacrifice,
              freshOperator.availablePower
            ) > 0n
              ? await getPoolMemberInfo(address)
              : staking?.member;
          calls = buildSmartGameActionCalls({
            controlSystemAddress: config.controlSystemAddress,
            entrypoint: withSacrifice ? 'bid_with_sacrifice' : 'bid',
            calldata: withSacrifice
              ? [String(point.id), String(source), allocationAmount.toString()]
              : [String(point.id), allocationAmount.toString()],
            allocation: allocationAfterSacrifice,
            availablePower: freshOperator.availablePower,
            operatorAddress: address,
            poolAddress: config.stakingPoolAddress,
            strkTokenAddress: config.strkTokenAddress,
            isPoolMember: Boolean(member),
          });
          label = withSacrifice ? 'SACRIFICE + BID' : 'OPEN BID';
        } else {
          if (allocationAmount < freshPoint.requiredStake) {
            throw new Error(
              `Capture requires ${formatStrk(
                freshPoint.requiredStake,
                18
              )} STRK.`
            );
          }
          const member =
            stakeDeficit(allocationAmount, freshOperator.availablePower) > 0n
              ? await getPoolMemberInfo(address)
              : staking?.member;
          calls = buildSmartGameActionCalls({
            controlSystemAddress: config.controlSystemAddress,
            entrypoint: 'capture',
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

  const actionLabel =
    action === 'settle'
      ? 'SETTLE CONTEST'
      : action === 'bid'
        ? challenged
          ? 'TAKE THE LEAD'
          : 'ATTACK'
        : action.toUpperCase();
  const label =
    phase === 'submitting'
      ? 'AUTHORIZING…'
      : phase === 'confirming'
        ? 'CONFIRMING ON SEPOLIA…'
        : primaryDisabledReason ||
          (deficit > 0n && action !== 'settle'
            ? `STAKE ${formatStrk(deficit, 18)} + ${actionLabel}`
            : action === 'settle'
              ? actionLabel
              : `${actionLabel} WITH ${formatStrk(
                  selectedAllocation ?? 0n,
                  18
                )} STRK`);

  return (
    <section className="mt-4 border border-neutral-600 bg-neutral-950">
      <header className="border-b border-grid px-3 py-2 text-[10px] tracking-[0.18em] text-dim">
        {challenged
          ? 'OPEN STRK CONTEST'
          : neutral
            ? 'CAPTURE NEUTRAL POINT'
            : owned
              ? 'FORTIFY CONTROL POINT'
              : 'ATTACK CONTROL POINT'}
      </header>
      <div className="space-y-2 px-3 py-3 text-[9px] tracking-[0.12em] text-neutral-500">
        {action !== 'settle' && (
          <div className="flex justify-between gap-4">
            <span>READY STRK</span>
            <span className="text-fg">
              {formatStrk(availablePower, 18)} STRK
            </span>
          </div>
        )}
        {challenged && challenge && (
          <>
            <div className="flex justify-between gap-4">
              <span>CURRENT LEADER</span>
              <span className="text-fg">
                {addressesMatch(challenge.leader, address ?? '0x0')
                  ? 'YOU'
                  : shortAddress(challenge.leader)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span>LEADING BID</span>
              <span className="text-fg">
                {formatStrk(challenge.leadingBid, 18)} STRK
              </span>
            </div>
          </>
        )}
        {action !== 'settle' && (
          <>
            <label
              className="block pt-1 text-dim"
              htmlFor={`allocation-${point?.id ?? 'none'}`}
            >
              {action === 'reinforce'
                ? 'ADDITIONAL STRK'
                : action === 'bid'
                  ? 'PUBLIC BID'
                  : 'CAPTURE STRK'}
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
            {action === 'reinforce' && (
              <div className="flex justify-between gap-4">
                <span>RESULTING GARRISON</span>
                <span>{formatStrk(projectedCommitment, 18)} STRK</span>
              </div>
            )}
            {(action === 'capture' || action === 'bid') && (
              <div className="flex justify-between gap-4">
                <span>MINIMUM</span>
                <span>{formatStrk(requiredPower, 18)} STRK</span>
              </div>
            )}
            {action === 'bid' && (
              <>
                {personalBid > 0n && (
                  <div className="flex justify-between gap-4">
                    <span>YOUR CURRENT BID</span>
                    <span>{formatStrk(personalBid, 18)} STRK</span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span>ADDITIONAL LOCK</span>
                  <span>{formatStrk(additionalBidPower, 18)} STRK</span>
                </div>
                <p className="border-l-2 border-amber-400 pl-2 leading-relaxed text-amber-300">
                  Raising a previous bid locks only the difference. If you do
                  not win when the response window expires, your highest total
                  bid becomes permanently spent game power.
                </p>
              </>
            )}
          </>
        )}
        {challenged && point.challengeDeadline && (
          <div className="flex justify-between gap-4">
            <span>RESPONSE WINDOW</span>
            <span>
              {new Date(point.challengeDeadline * 1_000).toLocaleString()}
            </span>
          </div>
        )}
        {challenged && (
          <div className="flex justify-between gap-4">
            <span>PUBLIC BIDS</span>
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
        {action === 'bid' && !currentLeader && (
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
                  Boolean(collateralCommonDisabledReason) ||
                  !collateralId.trim() ||
                  phase !== 'idle'
                }
                className="border border-neutral-500 px-3 py-2 text-[9px] tracking-[0.14em] text-neutral-300 hover:border-white hover:text-white disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-700"
              >
                SACRIFICE + BID
              </button>
            </div>
            <p className="mt-2 leading-relaxed text-dim">
              The sacrificed point becomes neutral immediately and its garrison
              becomes available for this bid.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
