import { describe, expect, it } from 'vitest';
import {
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

describe('Smart Capture calls', () => {
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

  it('encodes u256 values as low and high words', () => {
    expect(encodeU256((1n << 128n) + 7n)).toEqual(['7', '1']);
  });
});
