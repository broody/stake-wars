import { describe, expect, it } from 'vitest';
import {
  buildSmartBatchCaptureCalls,
  buildSmartBatchReinforceCalls,
  buildSmartCaptureCalls,
  encodeU256,
  stakeDeficit,
} from './smartCapture';

const baseOptions = {
  controlSystemAddress: '0xcontrol',
  controlPointId: 42,
  allocation: 10n,
  availableStake: 0n,
  operatorAddress: '0xoperator',
  poolAddress: '0xpool',
  strkTokenAddress: '0xstrk',
  isPoolMember: false,
};

describe('Capture transaction calls', () => {
  it('calculates only the missing delegated stake', () => {
    expect(stakeDeficit(10n, 4n)).toBe(6n);
    expect(stakeDeficit(10n, 10n)).toBe(0n);
    expect(stakeDeficit(10n, 20n)).toBe(0n);
  });

  it('captures directly when delegated stake is already available', () => {
    expect(
      buildSmartCaptureCalls({ ...baseOptions, availableStake: 10n })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'capture',
        calldata: ['42', '10'],
      },
    ]);
  });

  it('approves, enters the pool, and captures for a new member', () => {
    const calls = buildSmartCaptureCalls(baseOptions);

    expect(calls.map((call) => call.entrypoint)).toEqual([
      'approve',
      'enter_delegation_pool',
      'capture',
    ]);
    expect(calls[0]?.calldata).toEqual(['0xpool', '10', '0']);
    expect(calls[1]?.calldata).toEqual(['0xoperator', '10']);
  });

  it('adds to the pool for an existing member', () => {
    const calls = buildSmartCaptureCalls({
      ...baseOptions,
      availableStake: 4n,
      isPoolMember: true,
    });

    expect(calls[1]).toEqual({
      contractAddress: '0xpool',
      entrypoint: 'add_to_delegation_pool',
      calldata: ['0xoperator', '6'],
    });
  });

  it('delegates the combined deficit and captures every selected point', () => {
    const calls = buildSmartBatchCaptureCalls({
      ...baseOptions,
      captures: [
        { controlPointId: 42, allocation: 10n },
        { controlPointId: 43, allocation: 12n },
      ],
      availableStake: 4n,
    });

    expect(calls.map((call) => call.entrypoint)).toEqual([
      'approve',
      'enter_delegation_pool',
      'capture_many',
    ]);
    expect(calls[0]?.calldata).toEqual(['0xpool', '18', '0']);
    expect(calls[2]?.calldata).toEqual(['2', '42', '10', '43', '12']);
  });

  it('rejects an empty capture batch', () => {
    expect(() =>
      buildSmartBatchCaptureCalls({
        ...baseOptions,
        captures: [],
      })
    ).toThrow('At least one Control Point is required');
  });

  it('rejects a capture batch above the contract limit', () => {
    expect(() =>
      buildSmartBatchCaptureCalls({
        ...baseOptions,
        captures: Array.from({ length: 21 }, (_, controlPointId) => ({
          controlPointId,
          allocation: 10n,
        })),
      })
    ).toThrow('At most 20 Control Points can be captured at once');
  });

  it('stakes the deficit and fortifies every selected owned point', () => {
    const calls = buildSmartBatchReinforceCalls({
      ...baseOptions,
      reinforcements: [
        { controlPointId: 42, additionalAllocation: 2n },
        { controlPointId: 43, additionalAllocation: 3n },
      ],
      availableStake: 1n,
      isPoolMember: true,
    });

    expect(calls.map((call) => call.entrypoint)).toEqual([
      'approve',
      'add_to_delegation_pool',
      'reinforce_many',
    ]);
    expect(calls[0]?.calldata).toEqual(['0xpool', '4', '0']);
    expect(calls[2]?.calldata).toEqual(['2', '42', '2', '43', '3']);
  });

  it('fortifies directly when enough stake is available', () => {
    expect(
      buildSmartBatchReinforceCalls({
        ...baseOptions,
        reinforcements: [{ controlPointId: 42, additionalAllocation: 2n }],
        availableStake: 2n,
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'reinforce',
        calldata: ['42', '2'],
      },
    ]);
  });

  it('rejects empty and oversized reinforcement batches', () => {
    expect(() =>
      buildSmartBatchReinforceCalls({
        ...baseOptions,
        reinforcements: [],
      })
    ).toThrow('At least one Control Point is required');

    expect(() =>
      buildSmartBatchReinforceCalls({
        ...baseOptions,
        reinforcements: Array.from({ length: 21 }, (_, controlPointId) => ({
          controlPointId,
          additionalAllocation: 10n,
        })),
      })
    ).toThrow('At most 20 Control Points can be reinforced at once');
  });

  it('encodes u256 values as low and high words', () => {
    expect(encodeU256((1n << 128n) + 7n)).toEqual(['7', '1']);
  });
});
