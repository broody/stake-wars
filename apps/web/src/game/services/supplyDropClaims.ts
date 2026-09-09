import type { Call } from 'starknet';
import { config } from './config';
import { buildClaimSupplyDropCall } from './supplyDrop';
import { buildStakeCalls } from './staking';
import {
  getSupplyDrop,
  getPoolMemberInfo,
  getStakingPoolInfo,
  getSupplyDropHold,
  getSupplyDropPolicy,
} from './starknet';
import { addressesMatch } from '../utils/format';

export function buildClaimAndStakeCalls({
  supplyDropId,
  operator,
  stakingPool,
  token,
  amount,
  isPoolMember,
}: {
  supplyDropId: bigint;
  operator: string;
  stakingPool: string;
  token: string;
  amount: bigint;
  isPoolMember: boolean;
}): Call[] {
  return [
    buildClaimSupplyDropCall({
      supplyDropSystemAddress: config.supplyDropSystemAddress,
      supplyDropId,
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
  supplyDropId: bigint,
  operator: string
): Promise<Call[]> {
  const [supplyDrop, policy] = await Promise.all([
    getSupplyDrop(supplyDropId),
    getSupplyDropPolicy(supplyDropId),
  ]);
  if (
    !addressesMatch(supplyDrop.winner, operator) ||
    supplyDrop.status !== 4 ||
    supplyDrop.claimed
  ) {
    throw new Error(
      'This Supply Drop is not claimable by the connected wallet.'
    );
  }
  if (!policy.stakingRequired) {
    return [
      buildClaimSupplyDropCall({
        supplyDropSystemAddress: config.supplyDropSystemAddress,
        supplyDropId,
        recipient: operator,
      }),
    ];
  }
  const [hold, member, pool] = await Promise.all([
    getSupplyDropHold(operator),
    getPoolMemberInfo(operator, undefined, policy.stakingPool),
    getStakingPoolInfo(undefined, policy.stakingPool),
  ]);
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
    supplyDrop.prizeKind !== 1 ||
    !addressesMatch(supplyDrop.token, pool.tokenAddress)
  ) {
    throw new Error('The Supply Drop token does not match its staking pool.');
  }
  if ((member?.amount ?? 0n) + supplyDrop.amount >= 1n << 128n) {
    throw new Error('The resulting stake exceeds the staking pool limit.');
  }
  return buildClaimAndStakeCalls({
    supplyDropId,
    operator,
    stakingPool: policy.stakingPool,
    token: supplyDrop.token,
    amount: supplyDrop.amount,
    isPoolMember: Boolean(member),
  });
}

export async function prepareSupplyDropRecovery(
  operator: string
): Promise<Call[]> {
  const hold = await getSupplyDropHold(operator);
  if (!hold.held) return [];
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
