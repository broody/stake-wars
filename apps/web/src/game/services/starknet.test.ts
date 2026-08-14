import { describe, expect, it } from 'vitest';
import { decodeControlPointStatusesResult, encodeRpcFelt } from './starknet';

describe('Starknet RPC calldata', () => {
  it('hex-encodes decimal-looking felt values explicitly', () => {
    expect(encodeRpcFelt(9)).toBe('0x9');
    expect(encodeRpcFelt(10)).toBe('0xa');
    expect(encodeRpcFelt(200)).toBe('0xc8');
  });

  it('rejects negative felt values', () => {
    expect(() => encodeRpcFelt(-1)).toThrow('RPC felt cannot be negative');
  });

  it('decodes legacy status batches without tenure timestamps', () => {
    expect(
      decodeControlPointStatusesResult(
        ['0x1', '0xa', '0xabc', '0x64', '0x2', '0x6e', '0x0', '0x1'],
        1
      )
    ).toEqual([
      {
        id: 10,
        controller: '0xabc',
        allocatedStake: 100n,
        ownershipGeneration: 2n,
        controlledSince: null,
        requiredStake: 110n,
        stale: false,
        needsSync: true,
      },
    ]);
  });

  it('decodes status batches with tenure timestamps', () => {
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
      controlledSince: 1_000_000_000,
      requiredStake: 110n,
      stale: false,
      needsSync: true,
    });
  });
});
