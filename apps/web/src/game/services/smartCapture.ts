import type { Call } from 'starknet';
import { MAX_CONTROL_ACTION_BATCH } from './sectorLimits';

interface GameActionCallsOptions {
  controlSystemAddress: string;
  entrypoint: 'capture' | 'reinforce';
  calldata: string[];
}

interface BatchGameAction {
  entrypoint: 'capture' | 'reinforce';
  calldata: string[];
}

interface BatchGameActionCallsOptions {
  actions: BatchGameAction[];
  controlSystemAddress: string;
}

export function stakeDeficit(
  allocation: bigint,
  availableForce: bigint
): bigint {
  return allocation > availableForce ? allocation - availableForce : 0n;
}

export function buildGameActionCalls({
  controlSystemAddress,
  entrypoint,
  calldata,
}: GameActionCallsOptions): Call[] {
  return [{ contractAddress: controlSystemAddress, entrypoint, calldata }];
}

export function buildBatchGameActionCalls({
  actions,
  controlSystemAddress,
}: BatchGameActionCallsOptions): Call[] {
  if (actions.length === 0) {
    throw new RangeError('At least one Sector action is required');
  }
  if (actions.length > MAX_CONTROL_ACTION_BATCH) {
    throw new RangeError(
      `At most ${MAX_CONTROL_ACTION_BATCH} Sector actions are allowed`
    );
  }
  const entrypoint = actions[0].entrypoint;
  if (actions.some((action) => action.entrypoint !== entrypoint)) {
    throw new RangeError('Batch Sector actions must have the same type');
  }
  if (actions.some((action) => action.calldata.length !== 2)) {
    throw new RangeError('Batch Sector actions require two calldata values');
  }

  return [
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
}
