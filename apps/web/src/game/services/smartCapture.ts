import type { Call } from 'starknet';

interface SmartGameActionCallsOptions {
  controlSystemAddress: string;
  entrypoint: 'capture' | 'challenge' | 'challenge_with_collateral';
  calldata: string[];
  requiredPower: bigint;
  existingCommitment: bigint;
  availablePower: bigint;
  operatorAddress: string;
  poolAddress: string;
  strkTokenAddress: string;
  isPoolMember: boolean;
}

const U128_MODULUS = 1n << 128n;

export function stakeDeficit(
  requiredPower: bigint,
  existingCommitment: bigint,
  availablePower: bigint
): bigint {
  const immediatelyCommitted = existingCommitment + availablePower;
  return requiredPower > immediatelyCommitted
    ? requiredPower - immediatelyCommitted
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
  requiredPower,
  existingCommitment,
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
  const deficit = stakeDeficit(
    requiredPower,
    existingCommitment,
    availablePower
  );
  if (deficit === 0n) return [actionCall];

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
    actionCall,
  ];
}

export function buildControlCall(
  controlSystemAddress: string,
  entrypoint: 'reinforce' | 'release' | 'settle_challenge',
  calldata: string[]
): Call[] {
  return [{ contractAddress: controlSystemAddress, entrypoint, calldata }];
}
