import type { Call } from 'starknet';
import { MAX_CONTROL_ACTION_BATCH } from './controlPointLimits';

interface SmartGameActionCallsOptions {
  controlSystemAddress: string;
  entrypoint:
    | 'capture'
    | 'reinforce'
    | 'challenge'
    | 'challenge_with_sacrifice';
  calldata: string[];
  allocation: bigint;
  availableForce: bigint;
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
  availableForce: bigint;
  operatorAddress: string;
  poolAddress: string;
  strkTokenAddress: string;
  isPoolMember: boolean;
}

const U128_MODULUS = 1n << 128n;

export function stakeDeficit(
  allocation: bigint,
  availableForce: bigint
): bigint {
  return allocation > availableForce ? allocation - availableForce : 0n;
}

export function incrementalCommittedForce(
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
  availableForce,
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
    availableForce,
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
  availableForce,
  operatorAddress,
  poolAddress,
  strkTokenAddress,
  isPoolMember,
}: SmartBatchGameActionCallsOptions): Call[] {
  if (actions.length === 0) {
    throw new RangeError('At least one Control Point action is required');
  }
  if (actions.length > MAX_CONTROL_ACTION_BATCH) {
    throw new RangeError(
      `At most ${MAX_CONTROL_ACTION_BATCH} Control Point actions are allowed`
    );
  }
  const entrypoint = actions[0].entrypoint;
  if (actions.some((action) => action.entrypoint !== entrypoint)) {
    throw new RangeError('Batch Control Point actions must have the same type');
  }
  if (actions.some((action) => action.calldata.length !== 2)) {
    throw new RangeError(
      'Batch Control Point actions require two calldata values'
    );
  }

  const actionCalls: Call[] = [
    actions.length === 1
      ? {
          contractAddress: controlSystemAddress,
          entrypoint,
          calldata: actions[0].calldata,
        }
      : {
          contractAddress: controlSystemAddress,
          entrypoint:
            entrypoint === 'capture' ? 'capture_many' : 'reinforce_many',
          calldata: [
            actions.length.toString(),
            ...actions.flatMap(({ calldata }) => calldata),
          ],
        },
  ];

  return buildStakedGameActionCalls({
    actionCalls,
    allocation,
    availableForce,
    operatorAddress,
    poolAddress,
    strkTokenAddress,
    isPoolMember,
  });
}

interface StakedGameActionCallsOptions {
  actionCalls: Call[];
  allocation: bigint;
  availableForce: bigint;
  operatorAddress: string;
  poolAddress: string;
  strkTokenAddress: string;
  isPoolMember: boolean;
}

function buildStakedGameActionCalls({
  actionCalls,
  allocation,
  availableForce,
  operatorAddress,
  poolAddress,
  strkTokenAddress,
  isPoolMember,
}: StakedGameActionCallsOptions): Call[] {
  const deficit = stakeDeficit(allocation, availableForce);
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
