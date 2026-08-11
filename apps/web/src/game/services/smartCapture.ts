import type { Call } from 'starknet';

interface SmartCaptureCallsOptions {
  controlSystemAddress: string;
  controlPointId: number;
  allocation: bigint;
  availableStake: bigint;
  operatorAddress: string;
  poolAddress: string;
  strkTokenAddress: string;
  isPoolMember: boolean;
}

const U128_MODULUS = 1n << 128n;

export function stakeDeficit(
  allocation: bigint,
  availableStake: bigint
): bigint {
  return allocation > availableStake ? allocation - availableStake : 0n;
}

export function encodeU256(value: bigint): [string, string] {
  if (value < 0n || value >= 1n << 256n) {
    throw new RangeError('Value does not fit in a u256');
  }

  return [(value % U128_MODULUS).toString(), (value / U128_MODULUS).toString()];
}

export function buildSmartCaptureCalls({
  controlSystemAddress,
  controlPointId,
  allocation,
  availableStake,
  operatorAddress,
  poolAddress,
  strkTokenAddress,
  isPoolMember,
}: SmartCaptureCallsOptions): Call[] {
  const deficit = stakeDeficit(allocation, availableStake);
  const captureCall: Call = {
    contractAddress: controlSystemAddress,
    entrypoint: 'capture',
    calldata: [controlPointId.toString(), allocation.toString()],
  };

  if (deficit === 0n) return [captureCall];

  const [deficitLow, deficitHigh] = encodeU256(deficit);
  const stakeCall: Call = isPoolMember
    ? {
        contractAddress: poolAddress,
        entrypoint: 'add_to_delegation_pool',
        calldata: [operatorAddress, deficit.toString()],
      }
    : {
        contractAddress: poolAddress,
        entrypoint: 'enter_delegation_pool',
        calldata: [operatorAddress, deficit.toString()],
      };

  return [
    {
      contractAddress: strkTokenAddress,
      entrypoint: 'approve',
      calldata: [poolAddress, deficitLow, deficitHigh],
    },
    stakeCall,
    captureCall,
  ];
}
