import { describe, expect, it } from 'vitest';
import {
  buildSmartBatchCaptureCalls,
  buildSmartBatchReinforceCalls,
  buildSmartCaptureCalls,
  encodeU256,
  stakeDeficit,
} from './smartCapture';

const shared = {
  controlSystemAddress: '0xcontrol',
  liveDelegatedAmount: 1_000n,
  operatorAddress: '0xoperator',
  poolAddress: '0xpool',
  strkTokenAddress: '0xstrk',
  isPoolMember: true,
};

describe('full-stake capture calls', () => {
  it('captures with the current live stake without allocating an amount', () => {
    expect(
      buildSmartCaptureCalls({
        ...shared,
        controlPointId: 7,
        requiredStake: 900n,
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'capture',
        calldata: ['7'],
      },
    ]);
  });

  it('stakes only the deficit before capturing', () => {
    expect(
      buildSmartCaptureCalls({
        ...shared,
        controlPointId: 7,
        requiredStake: 1_100n,
      })
    ).toEqual([
      {
        contractAddress: '0xstrk',
        entrypoint: 'approve',
        calldata: ['0xpool', '100', '0'],
      },
      {
        contractAddress: '0xpool',
        entrypoint: 'add_to_delegation_pool',
        calldata: ['0xoperator', '100'],
      },
      {
        contractAddress: '0xcontrol',
        entrypoint: 'capture',
        calldata: ['7'],
      },
    ]);
  });

  it('uses one full stake balance for every point in a batch', () => {
    const calls = buildSmartBatchCaptureCalls({
      ...shared,
      controlPointIds: [7, 8],
      requiredStake: 1_100n,
    });

    expect(calls[calls.length - 1]).toEqual({
      contractAddress: '0xcontrol',
      entrypoint: 'capture_many',
      calldata: ['2', '7', '8'],
    });
    expect(calls[0].calldata).toEqual(['0xpool', '100', '0']);
  });

  it('fortifies selected points to the current live stake', () => {
    expect(
      buildSmartBatchReinforceCalls({
        controlPointIds: [7, 8],
        controlSystemAddress: '0xcontrol',
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'reinforce_many',
        calldata: ['2', '7', '8'],
      },
    ]);
  });

  it('rejects empty and oversized batches', () => {
    expect(() =>
      buildSmartBatchCaptureCalls({
        ...shared,
        controlPointIds: [],
        requiredStake: 1n,
      })
    ).toThrow('At least one Control Point is required');
    expect(() =>
      buildSmartBatchReinforceCalls({
        controlPointIds: Array.from({ length: 201 }, (_, index) => index),
        controlSystemAddress: '0xcontrol',
      })
    ).toThrow('At most 200 Control Points can be reinforced at once');
  });
});

describe('staking arithmetic', () => {
  it('calculates only the additional live stake required', () => {
    expect(stakeDeficit(1_100n, 1_000n)).toBe(100n);
    expect(stakeDeficit(1_000n, 1_000n)).toBe(0n);
  });

  it('encodes u256 values into low and high limbs', () => {
    expect(encodeU256((1n << 128n) + 5n)).toEqual(['5', '1']);
  });
});
