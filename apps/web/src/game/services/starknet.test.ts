import { describe, expect, it } from 'vitest';
import {
  decodeSectorStatusesResult,
  decodeOperatorStatusResult,
  decodePoolMemberInfoResult,
  encodeRpcFelt,
  decodeSupplyDropPrizeAmountResult,
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

  it('decodes Sector status batches', () => {
    expect(
      decodeSectorStatusesResult(
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
      captureForce: 100n,
      controlledSince: 1_000_000_000,
      requiredStake: 110n,
      stale: false,
      needsSync: true,
    });
  });

  it('rejects Sector status batches with the retired Challenge fields', () => {
    expect(() =>
      decodeSectorStatusesResult(
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
      )
    ).toThrow('invalid status batch');
  });

  it('decodes Operator allocation status', () => {
    expect(
      decodeOperatorStatusResult(
        ['0xabc', '0x3e8', '0x64', '0x384', '0x2', '0x3', '0x0', '0x0', '0x1'],
        '0xabc'
      )
    ).toMatchObject({
      liveDelegatedAmount: 1_000n,
      sectorForce: 100n,
      availableForce: 900n,
      generation: 2n,
      controlledSectorCount: 3,
      retired: false,
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

describe('confirmed supply drop prize', () => {
  it('decodes the existing model ABI including both amount words', () => {
    const result = Array<string>(23).fill('0x0');
    result[0] = '0x7';
    result[7] = '0x3';
    result[8] = '0x1';
    expect(decodeSupplyDropPrizeAmountResult(result, 7n)).toBe(
      (1n << 128n) + 3n
    );
    expect(() => decodeSupplyDropPrizeAmountResult(result, 8n)).toThrow(
      'invalid supply drop'
    );
    expect(() =>
      decodeSupplyDropPrizeAmountResult(result.slice(1), 7n)
    ).toThrow('invalid supply drop');
    result[8] = (1n << 128n).toString();
    expect(() => decodeSupplyDropPrizeAmountResult(result, 7n)).toThrow(
      'invalid prize amount'
    );
  });
});
