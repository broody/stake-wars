import type { Call } from 'starknet';

const U128_MODULUS = 1n << 128n;

function encodeU256(value: bigint): [string, string] {
  if (value < 0n || value >= 1n << 256n) {
    throw new RangeError('Value does not fit in a u256');
  }
  return [(value % U128_MODULUS).toString(), (value / U128_MODULUS).toString()];
}

export function buildStakeCalls({
  stakingPoolAddress,
  strkTokenAddress,
  operatorAddress,
  amount,
  isPoolMember,
}: {
  stakingPoolAddress: string;
  strkTokenAddress: string;
  operatorAddress: string;
  amount: bigint;
  isPoolMember: boolean;
}): Call[] {
  if (!stakingPoolAddress || !strkTokenAddress || !operatorAddress) {
    throw new Error('The staking contracts are not configured');
  }
  if (amount <= 0n) {
    throw new RangeError('The staking amount must be positive');
  }

  const [amountLow, amountHigh] = encodeU256(amount);
  return [
    {
      contractAddress: strkTokenAddress,
      entrypoint: 'approve',
      calldata: [stakingPoolAddress, amountLow, amountHigh],
    },
    isPoolMember
      ? {
          contractAddress: stakingPoolAddress,
          entrypoint: 'add_to_delegation_pool',
          calldata: [operatorAddress, amount.toString()],
        }
      : {
          contractAddress: stakingPoolAddress,
          entrypoint: 'enter_delegation_pool',
          calldata: [operatorAddress, amount.toString()],
        },
  ];
}

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
      entrypoint: 'retire',
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
