import type { Call } from 'starknet';
import { MAX_CONTROL_ACTION_BATCH } from './controlPointLimits';

export { MAX_CONTROL_ACTION_BATCH } from './controlPointLimits';

interface SmartCaptureCallsOptions {
  controlSystemAddress: string;
  controlPointId: number;
  requiredStake: bigint;
  liveDelegatedAmount: bigint;
  operatorAddress: string;
  poolAddress: string;
  strkTokenAddress: string;
  isPoolMember: boolean;
}

interface SmartBatchCaptureCallsOptions
  extends Omit<SmartCaptureCallsOptions, 'controlPointId'> {
  controlPointIds: number[];
}

interface BatchReinforceCallsOptions {
  controlSystemAddress: string;
  controlPointIds: number[];
}

const U128_MODULUS = 1n << 128n;

export function stakeDeficit(
  requiredStake: bigint,
  liveDelegatedAmount: bigint
): bigint {
  return requiredStake > liveDelegatedAmount
    ? requiredStake - liveDelegatedAmount
    : 0n;
}

export function encodeU256(value: bigint): [string, string] {
  if (value < 0n || value >= 1n << 256n) {
    throw new RangeError('Value does not fit in a u256');
  }

  return [(value % U128_MODULUS).toString(), (value / U128_MODULUS).toString()];
}

export function buildSmartCaptureCalls({
  controlPointId,
  ...options
}: SmartCaptureCallsOptions): Call[] {
  return buildSmartBatchCaptureCalls({
    ...options,
    controlPointIds: [controlPointId],
  });
}

export function buildSmartBatchCaptureCalls({
  controlPointIds,
  requiredStake,
  liveDelegatedAmount,
  controlSystemAddress,
  isPoolMember,
  operatorAddress,
  poolAddress,
  strkTokenAddress,
}: SmartBatchCaptureCallsOptions): Call[] {
  assertActionBatch(controlPointIds, 'captured');

  const actionCall: Call =
    controlPointIds.length === 1
      ? {
          contractAddress: controlSystemAddress,
          entrypoint: 'capture',
          calldata: [controlPointIds[0].toString()],
        }
      : {
          contractAddress: controlSystemAddress,
          entrypoint: 'capture_many',
          calldata: [
            controlPointIds.length.toString(),
            ...controlPointIds.map(String),
          ],
        };
  const deficit = stakeDeficit(requiredStake, liveDelegatedAmount);

  if (deficit === 0n) return [actionCall];

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
    actionCall,
  ];
}

export function buildSmartBatchReinforceCalls({
  controlPointIds,
  controlSystemAddress,
}: BatchReinforceCallsOptions): Call[] {
  assertActionBatch(controlPointIds, 'reinforced');

  return [
    controlPointIds.length === 1
      ? {
          contractAddress: controlSystemAddress,
          entrypoint: 'reinforce',
          calldata: [controlPointIds[0].toString()],
        }
      : {
          contractAddress: controlSystemAddress,
          entrypoint: 'reinforce_many',
          calldata: [
            controlPointIds.length.toString(),
            ...controlPointIds.map(String),
          ],
        },
  ];
}

function assertActionBatch(
  controlPointIds: readonly number[],
  action: 'captured' | 'reinforced'
) {
  if (controlPointIds.length === 0) {
    throw new RangeError('At least one Control Point is required');
  }
  if (controlPointIds.length > MAX_CONTROL_ACTION_BATCH) {
    throw new RangeError(
      `At most ${MAX_CONTROL_ACTION_BATCH} Control Points can be ${action} at once`
    );
  }
}
