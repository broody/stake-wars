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

describe('automatic commitment action calls', () => {
  it('uses existing commitment plus available power before staking more', () => {
    expect(
      buildSmartGameActionCalls({
        ...shared,
        entrypoint: 'challenge',
        calldata: ['7'],
        requiredPower: 2_420n,
        existingCommitment: 2_000n,
        availablePower: 420n,
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'challenge',
        calldata: ['7'],
      },
    ]);
  });

  it('stakes only the remaining deficit before the action', () => {
    const calls = buildSmartGameActionCalls({
      ...shared,
      entrypoint: 'capture',
      calldata: ['7'],
      requiredPower: 1_100n,
      existingCommitment: 0n,
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
      calldata: ['7'],
    });
  });

  it('builds a collateral sacrifice call without an allocation amount', () => {
    expect(
      buildSmartGameActionCalls({
        ...shared,
        entrypoint: 'challenge_with_collateral',
        calldata: ['7', '8'],
        requiredPower: 1_100n,
        existingCommitment: 0n,
        availablePower: 1_100n,
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'challenge_with_collateral',
        calldata: ['7', '8'],
      },
    ]);
  });
});

describe('staking arithmetic', () => {
  it('subtracts prior commitment and currently available power', () => {
    expect(stakeDeficit(2_420n, 2_000n, 200n)).toBe(220n);
    expect(stakeDeficit(2_420n, 2_000n, 420n)).toBe(0n);
  });

  it('encodes u256 values into low and high limbs', () => {
    expect(encodeU256((1n << 128n) + 5n)).toEqual(['5', '1']);
  });
});
