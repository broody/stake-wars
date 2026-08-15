import type { Call } from 'starknet';

interface SmartGameActionCallsOptions {
  controlSystemAddress: string;
  entrypoint:
    | 'capture'
    | 'reinforce'
    | 'submit_sealed_bid'
    | 'submit_sealed_bid_with_collateral';
  calldata: string[];
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
  const deficit = stakeDeficit(allocation, availablePower);
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
  entrypoint: 'release',
  calldata: string[]
): Call[] {
  return [{ contractAddress: controlSystemAddress, entrypoint, calldata }];
}
