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

interface CaptureAllocation {
  controlPointId: number;
  allocation: bigint;
}

interface ReinforcementAllocation {
  controlPointId: number;
  additionalAllocation: bigint;
}

interface SmartBatchCaptureCallsOptions
  extends Omit<SmartCaptureCallsOptions, 'controlPointId' | 'allocation'> {
  captures: CaptureAllocation[];
}

interface SmartBatchReinforceCallsOptions
  extends Omit<SmartCaptureCallsOptions, 'controlPointId' | 'allocation'> {
  reinforcements: ReinforcementAllocation[];
}

const U128_MODULUS = 1n << 128n;
export const MAX_CONTROL_ACTION_BATCH = 50;

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
  return buildSmartBatchCaptureCalls({
    captures: [{ controlPointId, allocation }],
    availableStake,
    controlSystemAddress,
    isPoolMember,
    operatorAddress,
    poolAddress,
    strkTokenAddress,
  });
}

export function buildSmartBatchCaptureCalls({
  captures,
  availableStake,
  controlSystemAddress,
  isPoolMember,
  operatorAddress,
  poolAddress,
  strkTokenAddress,
}: SmartBatchCaptureCallsOptions): Call[] {
  if (captures.length === 0) {
    throw new RangeError('At least one Control Point is required');
  }
  if (captures.length > MAX_CONTROL_ACTION_BATCH) {
    throw new RangeError(
      `At most ${MAX_CONTROL_ACTION_BATCH} Control Points can be captured at once`
    );
  }

  const actionCalls: Call[] = [
    captures.length === 1
      ? {
          contractAddress: controlSystemAddress,
          entrypoint: 'capture',
          calldata: [
            captures[0].controlPointId.toString(),
            captures[0].allocation.toString(),
          ],
        }
      : {
          contractAddress: controlSystemAddress,
          entrypoint: 'capture_many',
          calldata: [
            captures.length.toString(),
            ...captures.flatMap(({ controlPointId, allocation }) => [
              controlPointId.toString(),
              allocation.toString(),
            ]),
          ],
        },
  ];

  return buildStakedControlCalls({
    actionCalls,
    additionalStake: captures.reduce(
      (total, capture) => total + capture.allocation,
      0n
    ),
    availableStake,
    isPoolMember,
    operatorAddress,
    poolAddress,
    strkTokenAddress,
  });
}

export function buildSmartBatchReinforceCalls({
  reinforcements,
  availableStake,
  controlSystemAddress,
  isPoolMember,
  operatorAddress,
  poolAddress,
  strkTokenAddress,
}: SmartBatchReinforceCallsOptions): Call[] {
  if (reinforcements.length === 0) {
    throw new RangeError('At least one Control Point is required');
  }
  if (reinforcements.length > MAX_CONTROL_ACTION_BATCH) {
    throw new RangeError(
      `At most ${MAX_CONTROL_ACTION_BATCH} Control Points can be reinforced at once`
    );
  }

  const actionCalls: Call[] = [
    reinforcements.length === 1
      ? {
          contractAddress: controlSystemAddress,
          entrypoint: 'reinforce',
          calldata: [
            reinforcements[0].controlPointId.toString(),
            reinforcements[0].additionalAllocation.toString(),
          ],
        }
      : {
          contractAddress: controlSystemAddress,
          entrypoint: 'reinforce_many',
          calldata: [
            reinforcements.length.toString(),
            ...reinforcements.flatMap(
              ({ controlPointId, additionalAllocation }) => [
                controlPointId.toString(),
                additionalAllocation.toString(),
              ]
            ),
          ],
        },
  ];

  return buildStakedControlCalls({
    actionCalls,
    additionalStake: reinforcements.reduce(
      (total, reinforcement) => total + reinforcement.additionalAllocation,
      0n
    ),
    availableStake,
    isPoolMember,
    operatorAddress,
    poolAddress,
    strkTokenAddress,
  });
}

interface StakedControlCallsOptions {
  actionCalls: Call[];
  additionalStake: bigint;
  availableStake: bigint;
  operatorAddress: string;
  poolAddress: string;
  strkTokenAddress: string;
  isPoolMember: boolean;
}

function buildStakedControlCalls({
  actionCalls,
  additionalStake,
  availableStake,
  operatorAddress,
  poolAddress,
  strkTokenAddress,
  isPoolMember,
}: StakedControlCallsOptions): Call[] {
  const deficit = stakeDeficit(additionalStake, availableStake);

  if (deficit === 0n) return actionCalls;

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
    ...actionCalls,
  ];
}
