import { describe, expect, it } from 'vitest';
import {
  decodeControlPointStatusesResult,
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
      stale: false,
      needsSync: true,
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
