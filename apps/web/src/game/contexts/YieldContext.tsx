import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useProvider, useSendTransaction } from '@starknet-start/react';
import { TransactionExecutionStatus } from 'starknet';
import type { YieldSummary } from '../types';
import { config } from '../services/config';
import { getPoolMemberInfo } from '../services/starknet';
import { getYieldClaims } from '../services/torii';
import { useTransactionToast } from './TransactionToastContext';
import { YieldContext } from './useYield';
import type { YieldContextValue } from './useYield';
import { useWallet } from './WalletContext';

type ClaimPhase = 'idle' | 'submitting' | 'confirming';

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function YieldProvider({ children }: PropsWithChildren) {
  const { address } = useWallet();
  const { provider } = useProvider();
  const transaction = useSendTransaction({});
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const [summary, setSummary] = useState<YieldSummary | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isOpen, setOpen] = useState(false);
  const [claimPhase, setClaimPhase] = useState<ClaimPhase>('idle');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const claimedFloor = useRef<bigint | null>(null);

  const refreshYield = useCallback(() => {
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
      claimedFloor.current = null;
      return () => controller.abort();
    }

    if (!config.stakingPoolAddress) {
      setSummary(null);
      setError('The StakeWars staking pool is not configured.');
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
    ])
      .then(([memberResult, claimsResult]) => {
        if (controller.signal.aborted) return;
        if (memberResult.status === 'rejected') {
          throw memberResult.reason;
        }

        const member = memberResult.value;
        const unclaimedRewards = member?.unclaimedRewards ?? 0n;

        if (claimsResult.status === 'rejected') {
          setHistoryError(
            messageFrom(
              claimsResult.reason,
              'Unable to read indexed reward claims.'
            )
          );
          setSummary({
            claimedRewards: null,
            unclaimedRewards,
            lifetimeRewards: null,
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
          claimedRewards,
          unclaimedRewards,
          lifetimeRewards: claimedRewards + unclaimedRewards,
          claimCount: claimsResult.value.length,
          rewardAddress: member?.rewardAddress ?? null,
          commissionBps: member?.commissionBps ?? null,
          claims: claimsResult.value,
        });
      })
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

  const openYield = useCallback(() => {
    setOpen(true);
    setClaimError(null);
  }, []);

  const closeYield = useCallback(() => {
    if (claimPhase === 'idle') setOpen(false);
  }, [claimPhase]);

  const claimYield = useCallback(async () => {
    if (
      !address ||
      !summary ||
      summary.unclaimedRewards === 0n ||
      claimPhase !== 'idle' ||
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
      refreshYield();
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
    refreshYield,
    summary,
    transaction,
  ]);

  const value = useMemo<YieldContextValue>(
    () => ({
      summary,
      isLoading,
      error,
      historyError,
      isOpen,
      claimPhase,
      claimError,
      openYield,
      closeYield,
      refreshYield,
      claimYield,
    }),
    [
      claimError,
      claimPhase,
      claimYield,
      closeYield,
      error,
      historyError,
      isLoading,
      isOpen,
      openYield,
      refreshYield,
      summary,
    ]
  );

  return (
    <YieldContext.Provider value={value}>{children}</YieldContext.Provider>
  );
}
