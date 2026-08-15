import { describe, expect, it } from 'vitest';
import {
  buildSmartGameActionCalls,
  encodeU256,
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
  it('uses available power for the selected allocation before staking more', () => {
    expect(
      buildSmartGameActionCalls({
        ...shared,
        entrypoint: 'submit_sealed_bid',
        calldata: ['7', '1234'],
        allocation: 420n,
        availablePower: 420n,
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'submit_sealed_bid',
        calldata: ['7', '1234'],
      },
    ]);
  });

  it('stakes only the remaining deficit before the action', () => {
    const calls = buildSmartGameActionCalls({
      ...shared,
      entrypoint: 'capture',
      calldata: ['7', '1100'],
      allocation: 1_100n,
      availablePower: 1_000n,
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
      availablePower: 100n,
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
        entrypoint: 'submit_sealed_bid_with_collateral',
        calldata: ['7', '8', '1234'],
        allocation: 100n,
        availablePower: 100n,
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'submit_sealed_bid_with_collateral',
        calldata: ['7', '8', '1234'],
      },
    ]);
  });

  it('allows collateral to provide the entire contribution', () => {
    expect(
      buildSmartGameActionCalls({
        ...shared,
        entrypoint: 'submit_sealed_bid_with_collateral',
        calldata: ['7', '8', '1234'],
        allocation: 0n,
        availablePower: 0n,
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'submit_sealed_bid_with_collateral',
        calldata: ['7', '8', '1234'],
      },
    ]);
  });
});

describe('staking arithmetic', () => {
  it('stakes only the portion of a selected allocation that is unavailable', () => {
    expect(stakeDeficit(420n, 200n)).toBe(220n);
    expect(stakeDeficit(420n, 420n)).toBe(0n);
  });

  it('encodes u256 values into low and high limbs', () => {
    expect(encodeU256((1n << 128n) + 5n)).toEqual(['5', '1']);
  });
});
