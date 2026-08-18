import { describe, expect, it } from 'vitest';
import {
  buildSmartBatchGameActionCalls,
  buildSmartGameActionCalls,
  encodeU256,
  incrementalCommittedForce,
  stakeDeficit,
} from './smartCapture';

const shared = {
  controlSystemAddress: '0xcontrol',
  operatorAddress: '0xoperator',
  poolAddress: '0xpool',
  strkTokenAddress: '0xstrk',
  isPoolMember: true,
};

describe('allocation action calls', () => {
  it('uses available force for the selected allocation before staking more', () => {
    expect(
      buildSmartGameActionCalls({
        ...shared,
        entrypoint: 'challenge',
        calldata: ['7', '420'],
        allocation: 420n,
        availableForce: 420n,
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'challenge',
        calldata: ['7', '420'],
      },
    ]);
  });

  it('stakes only the remaining deficit before the action', () => {
    const calls = buildSmartGameActionCalls({
      ...shared,
      entrypoint: 'capture',
      calldata: ['7', '1100'],
      allocation: 1_100n,
      availableForce: 1_000n,
    });
    expect(calls[0]).toEqual({
      contractAddress: '0xstrk',
      entrypoint: 'approve',
      calldata: ['0xpool', '100', '0'],
    });
    expect(calls[2]).toEqual({
      contractAddress: '0xcontrol',
      entrypoint: 'capture',
      calldata: ['7', '1100'],
    });
  });

  it('can stake and reinforce with an explicit additional allocation', () => {
    const calls = buildSmartGameActionCalls({
      ...shared,
      entrypoint: 'reinforce',
      calldata: ['7', '300'],
      allocation: 300n,
      availableForce: 100n,
    });
    expect(calls[0]?.calldata).toEqual(['0xpool', '200', '0']);
    expect(calls[2]).toEqual({
      contractAddress: '0xcontrol',
      entrypoint: 'reinforce',
      calldata: ['7', '300'],
    });
  });

  it('builds a collateral sacrifice call with its liquid contribution', () => {
    expect(
      buildSmartGameActionCalls({
        ...shared,
        entrypoint: 'challenge_with_sacrifice',
        calldata: ['7', '8', '420'],
        allocation: 100n,
        availableForce: 100n,
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'challenge_with_sacrifice',
        calldata: ['7', '8', '420'],
      },
    ]);
  });

  it('allows collateral to provide the entire contribution', () => {
    expect(
      buildSmartGameActionCalls({
        ...shared,
        entrypoint: 'challenge_with_sacrifice',
        calldata: ['7', '8', '420'],
        allocation: 0n,
        availableForce: 0n,
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'challenge_with_sacrifice',
        calldata: ['7', '8', '420'],
      },
    ]);
  });

  it('stakes one aggregate deficit before repeated control calls', () => {
    expect(
      buildSmartBatchGameActionCalls({
        ...shared,
        actions: [
          { entrypoint: 'capture', calldata: ['7', '100'] },
          { entrypoint: 'capture', calldata: ['8', '100'] },
          { entrypoint: 'capture', calldata: ['9', '100'] },
        ],
        allocation: 300n,
        availableForce: 100n,
      })
    ).toEqual([
      {
        contractAddress: '0xstrk',
        entrypoint: 'approve',
        calldata: ['0xpool', '200', '0'],
      },
      {
        contractAddress: '0xpool',
        entrypoint: 'add_to_delegation_pool',
        calldata: ['0xoperator', '200'],
      },
      {
        contractAddress: '0xcontrol',
        entrypoint: 'capture',
        calldata: ['7', '100'],
      },
      {
        contractAddress: '0xcontrol',
        entrypoint: 'capture',
        calldata: ['8', '100'],
      },
      {
        contractAddress: '0xcontrol',
        entrypoint: 'capture',
        calldata: ['9', '100'],
      },
    ]);
  });

  it('rejects an empty batch', () => {
    expect(() =>
      buildSmartBatchGameActionCalls({
        ...shared,
        actions: [],
        allocation: 0n,
        availableForce: 0n,
      })
    ).toThrow('At least one Control Point action is required');
  });
});

describe('staking arithmetic', () => {
  it('locks only the increase over an operator previous challenge commitment', () => {
    expect(incrementalCommittedForce(700n, 500n)).toBe(200n);
    expect(incrementalCommittedForce(500n, 500n)).toBe(0n);
  });

  it('stakes only the portion of a selected allocation that is unavailable', () => {
    expect(stakeDeficit(420n, 200n)).toBe(220n);
    expect(stakeDeficit(420n, 420n)).toBe(0n);
  });

  it('encodes u256 values into low and high limbs', () => {
    expect(encodeU256((1n << 128n) + 5n)).toEqual(['5', '1']);
  });
});
