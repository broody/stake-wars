import type { Call } from 'starknet';

interface SmartGameActionCallsOptions {
  controlSystemAddress: string;
  entrypoint:
    | 'capture'
    | 'reinforce'
    | 'challenge'
    | 'challenge_with_sacrifice';
  calldata: string[];
  allocation: bigint;
  availablePower: bigint;
  operatorAddress: string;
  poolAddress: string;
  strkTokenAddress: string;
  isPoolMember: boolean;
}

interface BatchGameAction {
  entrypoint: 'capture' | 'reinforce';
  calldata: string[];
}

interface SmartBatchGameActionCallsOptions {
  actions: BatchGameAction[];
  controlSystemAddress: string;
  allocation: bigint;
  availablePower: bigint;
  operatorAddress: string;
  poolAddress: string;
  strkTokenAddress: string;
  isPoolMember: boolean;
}

const U128_MODULUS = 1n << 128n;

export function stakeDeficit(
  allocation: bigint,
  availablePower: bigint
): bigint {
  return allocation > availablePower ? allocation - availablePower : 0n;
}

export function incrementalCommittedPower(
  newCommitment: bigint,
  previousCommitment: bigint
): bigint {
  return newCommitment > previousCommitment
    ? newCommitment - previousCommitment
    : 0n;
}

export function encodeU256(value: bigint): [string, string] {
  if (value < 0n || value >= 1n << 256n) {
    throw new RangeError('Value does not fit in a u256');
  }
  return [(value % U128_MODULUS).toString(), (value / U128_MODULUS).toString()];
}

export function buildSmartGameActionCalls({
  controlSystemAddress,
  entrypoint,
  calldata,
  allocation,
  availablePower,
  operatorAddress,
  poolAddress,
  strkTokenAddress,
  isPoolMember,
}: SmartGameActionCallsOptions): Call[] {
  const actionCall: Call = {
    contractAddress: controlSystemAddress,
    entrypoint,
    calldata,
  };
  return buildStakedGameActionCalls({
    actionCalls: [actionCall],
    allocation,
    availablePower,
    operatorAddress,
    poolAddress,
    strkTokenAddress,
    isPoolMember,
  });
}

export function buildSmartBatchGameActionCalls({
  actions,
  controlSystemAddress,
  allocation,
  availablePower,
  operatorAddress,
  poolAddress,
  strkTokenAddress,
  isPoolMember,
}: SmartBatchGameActionCallsOptions): Call[] {
  if (actions.length === 0) {
    throw new RangeError('At least one Control Point action is required');
  }

  return buildStakedGameActionCalls({
    actionCalls: actions.map(({ entrypoint, calldata }) => ({
      contractAddress: controlSystemAddress,
      entrypoint,
      calldata,
    })),
    allocation,
    availablePower,
    operatorAddress,
    poolAddress,
    strkTokenAddress,
    isPoolMember,
  });
}

interface StakedGameActionCallsOptions {
  actionCalls: Call[];
  allocation: bigint;
  availablePower: bigint;
  operatorAddress: string;
  poolAddress: string;
  strkTokenAddress: string;
  isPoolMember: boolean;
}

function buildStakedGameActionCalls({
  actionCalls,
  allocation,
  availablePower,
  operatorAddress,
  poolAddress,
  strkTokenAddress,
  isPoolMember,
}: StakedGameActionCallsOptions): Call[] {
  const deficit = stakeDeficit(allocation, availablePower);
  if (deficit === 0n) return actionCalls;

  const [deficitLow, deficitHigh] = encodeU256(deficit);
  return [
    {
      contractAddress: strkTokenAddress,
      entrypoint: 'approve',
      calldata: [poolAddress, deficitLow, deficitHigh],
    },
    isPoolMember
      ? {
          contractAddress: poolAddress,
          entrypoint: 'add_to_delegation_pool',
          calldata: [operatorAddress, deficit.toString()],
        }
      : {
          contractAddress: poolAddress,
          entrypoint: 'enter_delegation_pool',
          calldata: [operatorAddress, deficit.toString()],
        },
    ...actionCalls,
  ];
}

export function buildControlCall(
  controlSystemAddress: string,
  entrypoint: 'release' | 'settle_challenge' | 'resolve_challenge_position',
  calldata: string[]
): Call[] {
  return [{ contractAddress: controlSystemAddress, entrypoint, calldata }];
}
