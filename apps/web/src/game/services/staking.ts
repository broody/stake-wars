import type { Call } from 'starknet';

export function buildUnstakeAllCalls({
  controlSystemAddress,
  stakingPoolAddress,
  amount,
}: {
  controlSystemAddress: string;
  stakingPoolAddress: string;
  amount: bigint;
}): Call[] {
  if (!controlSystemAddress || !stakingPoolAddress) {
    throw new Error('The staking exit contracts are not configured');
  }
  if (amount <= 0n) {
    throw new RangeError('The staking exit amount must be positive');
  }

  return [
    {
      contractAddress: controlSystemAddress,
      entrypoint: 'relinquish_all',
      calldata: [],
    },
    {
      contractAddress: stakingPoolAddress,
      entrypoint: 'exit_delegation_pool_intent',
      calldata: [amount.toString()],
    },
  ];
}

export function buildWithdrawUnstakedCall(
  stakingPoolAddress: string,
  operator: string
): Call {
  if (!stakingPoolAddress || !operator) {
    throw new Error('The staking withdrawal is not configured');
  }
  return {
    contractAddress: stakingPoolAddress,
    entrypoint: 'exit_delegation_pool_action',
    calldata: [operator],
  };
}
