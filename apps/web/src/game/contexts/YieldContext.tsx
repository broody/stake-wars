import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import {
  useProvider,
  useSendTransaction,
} from '@starknetfoundation/starknet-start-react';
import { TransactionExecutionStatus } from 'starknet';
import type { YieldSummary } from '../types';
import { config } from '../services/config';
import {
  getPoolMemberInfo,
  getStakingExitWaitWindow,
} from '../services/starknet';
import { getPoolMemberStart, getYieldClaims } from '../services/torii';
import {
  buildStakeCalls,
  buildUnstakeAllCalls,
  buildWithdrawUnstakedCall,
} from '../services/staking';
import { useTransactionToast } from './TransactionToastContext';
import { YieldContext } from './useYield';
import type { YieldContextValue } from './useYield';
import { useWallet } from './WalletContext';
import { useSectors } from './SectorContext';

type ClaimPhase = 'idle' | 'submitting' | 'confirming';

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function YieldProvider({ children }: PropsWithChildren) {
  const { address } = useWallet();
  const { operatorStatus, refreshSectorIndex, refreshOperator } = useSectors();
  const { provider } = useProvider();
  const transaction = useSendTransaction({});
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const [summary, setSummary] = useState<YieldSummary | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [stakePhase, setStakePhase] = useState<ClaimPhase>('idle');
  const [stakeError, setStakeError] = useState<string | null>(null);
  const [claimPhase, setClaimPhase] = useState<ClaimPhase>('idle');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [unstakePhase, setUnstakePhase] = useState<ClaimPhase>('idle');
  const [withdrawPhase, setWithdrawPhase] = useState<ClaimPhase>('idle');
  const [stakingError, setStakingError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const claimedFloor = useRef<bigint | null>(null);
  const pendingExitAmount = summary?.unpoolAmount ?? 0n;
  const pendingExitTime = summary?.unpoolTime ?? null;

  const refreshStaking = useCallback(() => {
    setRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    if (!address) {
      setSummary(null);
      setError(null);
      setHistoryError(null);
      setLoading(false);
      setClaimError(null);
      setClaimPhase('idle');
      setStakePhase('idle');
      setStakeError(null);
      setUnstakePhase('idle');
      setWithdrawPhase('idle');
      setStakingError(null);
      claimedFloor.current = null;
      return () => controller.abort();
    }

    if (!config.stakingPoolAddress) {
      setSummary(null);
      setError('The Stake Wars staking pool is not configured.');
      setHistoryError(null);
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);
    setError(null);
    setHistoryError(null);

    Promise.allSettled([
      getPoolMemberInfo(address, controller.signal),
      getYieldClaims(address, controller.signal),
      getPoolMemberStart(address, controller.signal),
      getStakingExitWaitWindow(controller.signal),
    ])
      .then(
        ([memberResult, claimsResult, memberStartResult, exitWindowResult]) => {
          if (controller.signal.aborted) return;
          if (memberResult.status === 'rejected') {
            throw memberResult.reason;
          }

          const member = memberResult.value;
          const unclaimedRewards = member?.unclaimedRewards ?? 0n;
          const memberSince =
            memberStartResult.status === 'fulfilled'
              ? memberStartResult.value
              : null;
          const exitWaitWindowSeconds =
            exitWindowResult.status === 'fulfilled'
              ? exitWindowResult.value
              : null;

          if (claimsResult.status === 'rejected') {
            setHistoryError(
              messageFrom(
                claimsResult.reason,
                'Unable to read indexed reward claims.'
              )
            );
            setSummary({
              stakedAmount: member?.amount ?? 0n,
              unpoolAmount: member?.unpoolAmount ?? 0n,
              unpoolTime: member?.unpoolTime ?? null,
              exitWaitWindowSeconds,
              claimedRewards: null,
              unclaimedRewards,
              lifetimeRewards: null,
              memberSince,
              claimCount: 0,
              rewardAddress: member?.rewardAddress ?? null,
              commissionBps: member?.commissionBps ?? null,
              claims: [],
            });
            return;
          }

          const indexedClaimedRewards = claimsResult.value.reduce(
            (total, claim) => total + claim.amount,
            0n
          );
          const floor = claimedFloor.current;
          const claimedRewards =
            floor !== null && floor > indexedClaimedRewards
              ? floor
              : indexedClaimedRewards;
          if (floor !== null && indexedClaimedRewards >= floor) {
            claimedFloor.current = null;
          }

          setSummary({
            stakedAmount: member?.amount ?? 0n,
            unpoolAmount: member?.unpoolAmount ?? 0n,
            unpoolTime: member?.unpoolTime ?? null,
            exitWaitWindowSeconds,
            claimedRewards,
            unclaimedRewards,
            lifetimeRewards: claimedRewards + unclaimedRewards,
            memberSince,
            claimCount: claimsResult.value.length,
            rewardAddress: member?.rewardAddress ?? null,
            commissionBps: member?.commissionBps ?? null,
            claims: claimsResult.value,
          });
        }
      )
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setSummary(null);
          setError(messageFrom(loadError, 'Unable to read staking rewards.'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [address, revision]);

  useEffect(() => {
    if (
      pendingExitAmount === 0n ||
      pendingExitTime !== null ||
      unstakePhase !== 'idle'
    ) {
      return;
    }
    const timeout = window.setTimeout(refreshStaking, 3_000);
    return () => window.clearTimeout(timeout);
  }, [pendingExitAmount, pendingExitTime, refreshStaking, unstakePhase]);

  const stake = useCallback(
    async (amount: bigint) => {
      if (
        !address ||
        amount <= 0n ||
        stakePhase !== 'idle' ||
        claimPhase !== 'idle' ||
        unstakePhase !== 'idle' ||
        withdrawPhase !== 'idle' ||
        operatorStatus?.retired ||
        operatorStatus?.exiting ||
        !config.stakingPoolAddress ||
        !config.strkTokenAddress
      ) {
        return;
      }

      let submittedHash: string | null = null;
      setStakeError(null);
      setStakePhase('submitting');

      try {
        const member = await getPoolMemberInfo(address);
        const result = await transaction.sendAsync(
          buildStakeCalls({
            stakingPoolAddress: config.stakingPoolAddress,
            strkTokenAddress: config.strkTokenAddress,
            operatorAddress: address,
            amount,
            isPoolMember: Boolean(member),
          })
        );
        submittedHash = result.transaction_hash;
        notifySubmitting(submittedHash, 'STRK STAKE');
        setStakePhase('confirming');

        await provider.waitForTransaction(submittedHash, {
          errorStates: [TransactionExecutionStatus.REVERTED],
        });
        notifyConfirmed(submittedHash);
        refreshOperator();
        refreshStaking();
      } catch (stakeFailure) {
        const message = messageFrom(
          stakeFailure,
          'The STRK stake could not be completed.'
        );
        if (submittedHash) notifyFailed(submittedHash, message);
        setStakeError(message);
      } finally {
        setStakePhase('idle');
      }
    },
    [
      address,
      claimPhase,
      notifyConfirmed,
      notifyFailed,
      notifySubmitting,
      operatorStatus?.exiting,
      operatorStatus?.retired,
      provider,
      refreshOperator,
      refreshStaking,
      stakePhase,
      transaction,
      unstakePhase,
      withdrawPhase,
    ]
  );

  const claimYield = useCallback(async () => {
    if (
      !address ||
      !summary ||
      summary.unclaimedRewards === 0n ||
      stakePhase !== 'idle' ||
      claimPhase !== 'idle' ||
      unstakePhase !== 'idle' ||
      withdrawPhase !== 'idle' ||
      !config.stakingPoolAddress
    ) {
      return;
    }

    const yieldBeforeClaim = summary;
    let submittedHash: string | null = null;
    setClaimError(null);
    setClaimPhase('submitting');

    try {
      const result = await transaction.sendAsync([
        {
          contractAddress: config.stakingPoolAddress,
          entrypoint: 'claim_rewards',
          calldata: [address],
        },
      ]);
      submittedHash = result.transaction_hash;
      notifySubmitting(submittedHash, 'YIELD CLAIM');
      setClaimPhase('confirming');

      await provider.waitForTransaction(submittedHash, {
        errorStates: [TransactionExecutionStatus.REVERTED],
      });
      notifyConfirmed(submittedHash);

      if (yieldBeforeClaim.claimedRewards !== null) {
        claimedFloor.current =
          yieldBeforeClaim.claimedRewards + yieldBeforeClaim.unclaimedRewards;
      }
      setSummary((current) => {
        if (!current) return current;
        const claimedRewards =
          current.claimedRewards === null
            ? null
            : current.claimedRewards + current.unclaimedRewards;
        return {
          ...current,
          claimedRewards,
          unclaimedRewards: 0n,
          lifetimeRewards:
            claimedRewards === null ? null : current.lifetimeRewards,
        };
      });
      refreshStaking();
    } catch (claimFailure) {
      const message = messageFrom(
        claimFailure,
        'The yield claim could not be completed.'
      );
      if (submittedHash) notifyFailed(submittedHash, message);
      setClaimError(message);
    } finally {
      setClaimPhase('idle');
    }
  }, [
    address,
    claimPhase,
    notifyConfirmed,
    notifyFailed,
    notifySubmitting,
    provider,
    refreshStaking,
    stakePhase,
    summary,
    transaction,
    unstakePhase,
    withdrawPhase,
  ]);

  const unstakeAll = useCallback(async () => {
    if (
      !address ||
      !summary ||
      summary.stakedAmount === 0n ||
      summary.unpoolAmount > 0n ||
      stakePhase !== 'idle' ||
      claimPhase !== 'idle' ||
      unstakePhase !== 'idle' ||
      withdrawPhase !== 'idle' ||
      !config.stakingPoolAddress
    ) {
      return;
    }

    const exitAmount = summary.stakedAmount;
    let submittedHash: string | null = null;
    setStakingError(null);
    setUnstakePhase('submitting');

    try {
      const result = await transaction.sendAsync(
        buildUnstakeAllCalls({
          controlSystemAddress: config.controlSystemAddress,
          stakingPoolAddress: config.stakingPoolAddress,
          amount: exitAmount,
        })
      );
      submittedHash = result.transaction_hash;
      notifySubmitting(submittedHash, 'UNSTAKE & RELINQUISH');
      setUnstakePhase('confirming');

      await provider.waitForTransaction(submittedHash, {
        errorStates: [TransactionExecutionStatus.REVERTED],
      });
      notifyConfirmed(submittedHash);
      setSummary((current) =>
        current
          ? {
              ...current,
              stakedAmount: 0n,
              unpoolAmount: current.unpoolAmount + exitAmount,
            }
          : current
      );
      refreshOperator();
      refreshSectorIndex();
      refreshStaking();
    } catch (unstakeFailure) {
      const message = messageFrom(
        unstakeFailure,
        'The staking exit could not be initiated.'
      );
      if (submittedHash) notifyFailed(submittedHash, message);
      setStakingError(message);
    } finally {
      setUnstakePhase('idle');
    }
  }, [
    address,
    claimPhase,
    notifyConfirmed,
    notifyFailed,
    notifySubmitting,
    provider,
    refreshSectorIndex,
    refreshOperator,
    refreshStaking,
    stakePhase,
    summary,
    transaction,
    unstakePhase,
    withdrawPhase,
  ]);

  const withdrawUnstaked = useCallback(async () => {
    if (
      !address ||
      !summary ||
      summary.unpoolAmount === 0n ||
      summary.unpoolTime === null ||
      summary.unpoolTime > Math.floor(Date.now() / 1_000) ||
      stakePhase !== 'idle' ||
      claimPhase !== 'idle' ||
      unstakePhase !== 'idle' ||
      withdrawPhase !== 'idle' ||
      !config.stakingPoolAddress
    ) {
      return;
    }

    let submittedHash: string | null = null;
    setStakingError(null);
    setWithdrawPhase('submitting');

    try {
      const result = await transaction.sendAsync([
        buildWithdrawUnstakedCall(config.stakingPoolAddress, address),
      ]);
      submittedHash = result.transaction_hash;
      notifySubmitting(submittedHash, 'WITHDRAW UNSTAKED STRK');
      setWithdrawPhase('confirming');

      await provider.waitForTransaction(submittedHash, {
        errorStates: [TransactionExecutionStatus.REVERTED],
      });
      notifyConfirmed(submittedHash);
      setSummary((current) =>
        current ? { ...current, unpoolAmount: 0n, unpoolTime: null } : current
      );
      refreshStaking();
    } catch (withdrawFailure) {
      const message = messageFrom(
        withdrawFailure,
        'The unstaked STRK could not be withdrawn.'
      );
      if (submittedHash) notifyFailed(submittedHash, message);
      setStakingError(message);
    } finally {
      setWithdrawPhase('idle');
    }
  }, [
    address,
    claimPhase,
    notifyConfirmed,
    notifyFailed,
    notifySubmitting,
    provider,
    refreshStaking,
    stakePhase,
    summary,
    transaction,
    unstakePhase,
    withdrawPhase,
  ]);

  const value = useMemo<YieldContextValue>(
    () => ({
      summary,
      isLoading,
      error,
      historyError,
      stakePhase,
      stakeError,
      claimPhase,
      claimError,
      unstakePhase,
      withdrawPhase,
      stakingError,
      refreshStaking,
      stake,
      claimYield,
      unstakeAll,
      withdrawUnstaked,
    }),
    [
      claimError,
      claimPhase,
      claimYield,
      error,
      historyError,
      isLoading,
      refreshStaking,
      stake,
      stakeError,
      stakePhase,
      stakingError,
      summary,
      unstakeAll,
      unstakePhase,
      withdrawPhase,
      withdrawUnstaked,
    ]
  );

  return (
    <YieldContext.Provider value={value}>{children}</YieldContext.Provider>
  );
}
