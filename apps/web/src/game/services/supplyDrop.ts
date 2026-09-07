import type { Call } from 'starknet';
import { config } from './config';
import { buildClaimJackpotCall } from './jackpot';
import { buildStakeCalls } from './staking';
import {
  getJackpot,
  getPoolMemberInfo,
  getStakingPoolInfo,
  getSupplyDropHold,
  getSupplyDropPolicy,
} from './starknet';
import { addressesMatch } from '../utils/format';

export function buildClaimAndStakeCalls({
  jackpotId,
  operator,
  stakingPool,
  token,
  amount,
  isPoolMember,
}: {
  jackpotId: bigint;
  operator: string;
  stakingPool: string;
  token: string;
  amount: bigint;
  isPoolMember: boolean;
}): Call[] {
  return [
    buildClaimJackpotCall({
      jackpotSystemAddress: config.jackpotSystemAddress,
      jackpotId,
      recipient: operator,
    }),
    ...buildStakeCalls({
      stakingPoolAddress: stakingPool,
      strkTokenAddress: token,
      operatorAddress: operator,
      amount,
      isPoolMember,
    }),
    {
      contractAddress: config.controlSystemAddress,
      entrypoint: 'sync_operator',
      calldata: [operator],
    },
  ];
}

export async function prepareSupplyDropClaim(
  jackpotId: bigint,
  operator: string
): Promise<Call[]> {
  const [jackpot, policy] = await Promise.all([
    getJackpot(jackpotId),
    getSupplyDropPolicy(jackpotId),
  ]);
  if (
    !addressesMatch(jackpot.winner, operator) ||
    jackpot.status !== 4 ||
    jackpot.claimed
  ) {
    throw new Error(
      'This Supply Drop is not claimable by the connected wallet.'
    );
  }
  if (!policy.stakingRequired) {
    return [
      buildClaimJackpotCall({
        jackpotSystemAddress: config.jackpotSystemAddress,
        jackpotId,
        recipient: operator,
      }),
    ];
  }
  const [hold, member, pool] = await Promise.all([
    getSupplyDropHold(operator),
    getPoolMemberInfo(operator, undefined, policy.stakingPool),
    getStakingPoolInfo(undefined, policy.stakingPool),
  ]);
  if (!hold)
    throw new Error(
      'Supply Drop staking is not available on this deployment yet.'
    );
  if (hold.held)
    throw new Error(
      'Stake your outstanding Supply Drop before claiming another.'
    );
  if (member && (member.unpoolAmount > 0n || member.unpoolTime !== null)) {
    throw new Error(
      'Complete your pending staking withdrawal before claiming and staking this Supply Drop.'
    );
  }
  if (
    jackpot.prizeKind !== 1 ||
    !addressesMatch(jackpot.token, pool.tokenAddress)
  ) {
    throw new Error('The Supply Drop token does not match its staking pool.');
  }
  if ((member?.amount ?? 0n) + jackpot.amount >= 1n << 128n) {
    throw new Error('The resulting stake exceeds the staking pool limit.');
  }
  return buildClaimAndStakeCalls({
    jackpotId,
    operator,
    stakingPool: policy.stakingPool,
    token: jackpot.token,
    amount: jackpot.amount,
    isPoolMember: Boolean(member),
  });
}

export async function prepareSupplyDropRecovery(
  operator: string
): Promise<Call[]> {
  const hold = await getSupplyDropHold(operator);
  if (!hold || !hold.held) return [];
  if (hold.exiting)
    throw new Error(
      'Complete your pending withdrawal first. Staking cannot reverse account retirement.'
    );
  const [member, pool] = await Promise.all([
    getPoolMemberInfo(operator, undefined, hold.stakingPool),
    getStakingPoolInfo(undefined, hold.stakingPool),
  ]);
  return [
    ...buildStakeCalls({
      stakingPoolAddress: hold.stakingPool,
      strkTokenAddress: pool.tokenAddress,
      operatorAddress: operator,
      amount: hold.remainingStake,
      isPoolMember: Boolean(member),
    }),
    {
      contractAddress: config.controlSystemAddress,
      entrypoint: 'sync_operator',
      calldata: [operator],
    },
  ];
}
