import { describe, expect, it } from 'vitest';
import {
  decodeChallengeStatusResult,
  decodeControlPointStatusesResult,
  decodeOperatorStatusResult,
  decodePoolMemberInfoResult,
  encodeRpcFelt,
} from './starknet';

describe('Starknet RPC calldata', () => {
  it('hex-encodes decimal-looking felt values explicitly', () => {
    expect(encodeRpcFelt(9)).toBe('0x9');
    expect(encodeRpcFelt(10)).toBe('0xa');
    expect(encodeRpcFelt(200)).toBe('0xc8');
  });

  it('rejects negative felt values', () => {
    expect(() => encodeRpcFelt(-1)).toThrow('RPC felt cannot be negative');
  });

  it('decodes Control Point status batches', () => {
    expect(
      decodeControlPointStatusesResult(
        [
          '0x1',
          '0xa',
          '0xabc',
          '0x64',
          '0x2',
          '0x3b9aca00',
          '0x6e',
          '0x1',
          '0x3',
          '0x4e20',
          '0x0',
          '0x1',
        ],
        1
      )[0]
    ).toMatchObject({
      id: 10,
      capturePower: 100n,
      controlledSince: 1_000_000_000,
      requiredStake: 110n,
      activeChallengeId: 1n,
      challengeBidCount: 3,
      challengeDeadline: 20_000,
      stale: false,
      needsSync: true,
    });
  });

  it('decodes allocation and open-contest status widths', () => {
    expect(
      decodeOperatorStatusResult(
        [
          '0xabc',
          '0x3e8',
          '0x64',
          '0xc8',
          '0x12c',
          '0x190',
          '0x2',
          '0x3',
          '0x4',
          '0x0',
          '0x0',
          '0x1',
        ],
        '0xabc'
      )
    ).toMatchObject({
      pointPower: 100n,
      challengePower: 200n,
      spentPower: 300n,
      availablePower: 400n,
      activeChallengeCount: 4,
      needsSync: true,
    });

    expect(
      decodeChallengeStatusResult([
        '0x1',
        '0x2a',
        '0x111',
        '0x222',
        '0x1f4',
        '0x111',
        '0x190',
        '0x4e20',
        '0x3',
        '0x4',
        '0x0',
        '0x0',
        '0x0',
        '0x0',
      ])
    ).toMatchObject({
      controlPointId: 42,
      leader: '0x222',
      leadingBid: 500n,
      lastLosingBid: 400n,
      bidCount: 3,
      participantCount: 4,
      settled: false,
    });
  });
});

describe('Staking pool membership decoding', () => {
  it('decodes a pending withdrawal and its unlock timestamp', () => {
    expect(
      decodePoolMemberInfoResult(
        ['0x0', '0xabc', '0x0', '0xa', '0x3e8', '0x64', '0x0', '0x77359400'],
        '0xdef'
      )
    ).toEqual({
      rewardAddress: '0xabc',
      amount: 0n,
      unclaimedRewards: 10n,
      commissionBps: 1000,
      unpoolAmount: 100n,
      unpoolTime: 2_000_000_000,
    });
  });

  it('decodes an active member without a pending withdrawal', () => {
    expect(
      decodePoolMemberInfoResult(
        ['0x0', '0xabc', '0x64', '0x0', '0x3e8', '0x0', '0x1'],
        '0xdef'
      )
    ).toMatchObject({
      amount: 100n,
      unpoolAmount: 0n,
      unpoolTime: null,
    });
  });

  it('decodes a missing pool member', () => {
    expect(decodePoolMemberInfoResult(['0x1'], '0xabc')).toBeNull();
  });
});
