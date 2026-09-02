import { describe, expect, it } from 'vitest';
import {
  buildClaimJackpotCall,
  buildCreateJackpotCalls,
  isJackpotDrawPending,
  latestJackpotDraw,
  parseJackpots,
  parseDurationSeconds,
  parseTokenId,
  parseTokenUnits,
} from './jackpot';

const jackpotSystemAddress = '0x456';
const tokenAddress = '0x123';
const normalizedTokenAddress =
  '0x0000000000000000000000000000000000000000000000000000000000000123';

describe('jackpot form parsing', () => {
  it('converts display token amounts using configured decimals', () => {
    expect(parseTokenUnits('1.25', 6)).toBe(1_250_000n);
    expect(parseTokenUnits('42', 0)).toBe(42n);
  });

  it('rejects excess token precision and zero prizes', () => {
    expect(() => parseTokenUnits('1.001', 2)).toThrow('at most 2 decimals');
    expect(() => parseTokenUnits('0', 18)).toThrow('greater than zero');
  });

  it('parses token IDs and whole-unit durations', () => {
    expect(parseTokenId('9001')).toBe(9001n);
    expect(parseDurationSeconds('7', 'days')).toBe(604_800n);
    expect(parseDurationSeconds('10', 'minutes')).toBe(600n);
  });
});

describe('jackpot creation calls', () => {
  it('atomically approves and creates an ERC-20 jackpot', () => {
    expect(
      buildCreateJackpotCalls({
        jackpotSystemAddress,
        prizeKind: 'erc20',
        tokenAddress,
        tokenId: 0n,
        amount: 500n,
        durationSeconds: 604_800n,
      })
    ).toEqual([
      {
        contractAddress: normalizedTokenAddress,
        entrypoint: 'approve',
        calldata: [jackpotSystemAddress, '500', '0'],
      },
      {
        contractAddress: jackpotSystemAddress,
        entrypoint: 'create_jackpot',
        calldata: ['604800', '1', normalizedTokenAddress, '0', '0', '500', '0'],
      },
    ]);
  });

  it('approves the selected ERC-721 token and escrows one', () => {
    expect(
      buildCreateJackpotCalls({
        jackpotSystemAddress,
        prizeKind: 'erc721',
        tokenAddress,
        tokenId: 99n,
        amount: 1n,
        durationSeconds: 3_600n,
      })
    ).toEqual([
      {
        contractAddress: normalizedTokenAddress,
        entrypoint: 'approve',
        calldata: [jackpotSystemAddress, '99', '0'],
      },
      {
        contractAddress: jackpotSystemAddress,
        entrypoint: 'create_jackpot',
        calldata: ['3600', '2', normalizedTokenAddress, '99', '0', '1', '0'],
      },
    ]);
  });

  it('uses operator approval for an ERC-1155 jackpot', () => {
    expect(
      buildCreateJackpotCalls({
        jackpotSystemAddress,
        prizeKind: 'erc1155',
        tokenAddress,
        tokenId: 7n,
        amount: 12n,
        durationSeconds: 600n,
      })
    ).toEqual([
      {
        contractAddress: normalizedTokenAddress,
        entrypoint: 'set_approval_for_all',
        calldata: [jackpotSystemAddress, '1'],
      },
      {
        contractAddress: jackpotSystemAddress,
        entrypoint: 'create_jackpot',
        calldata: ['600', '3', normalizedTokenAddress, '7', '0', '12', '0'],
      },
    ]);
  });
});

describe('jackpot ledger', () => {
  it('parses and orders indexed jackpots newest first', () => {
    expect(
      parseJackpots({
        data: {
          stakewarsJackpotModels: {
            edges: [
              {
                node: {
                  id: '0x1',
                  status: 4,
                  sponsor: '0xabc',
                  prize_kind: 1,
                  token: '0x123',
                  token_id: '0x0',
                  amount: '0x64',
                  sector_limit_snapshot: 2000,
                  duration_seconds: '0x93a80',
                  started_at: '0x10',
                  ends_at: '0x20',
                  randomness_block: '0x0',
                  last_drawn_sector_id: 42,
                  draw_count: 1,
                  winner: '0xdef',
                  settled_at: '0x30',
                  claimed: true,
                  claimed_by: '0xdef',
                  claimed_at: '0x40',
                },
              },
              {
                node: {
                  id: '0x2',
                  status: 2,
                  sponsor: '0xabc',
                  prize_kind: 3,
                  token: '0x456',
                  token_id: '0x7',
                  amount: '0xc',
                  sector_limit_snapshot: '0x7d0',
                  duration_seconds: '0x258',
                  started_at: '0x50',
                  ends_at: '0x60',
                  randomness_block: '0x0',
                  last_drawn_sector_id: 0,
                  draw_count: 0,
                  winner: '0x0',
                  settled_at: '0x0',
                  claimed: false,
                  claimed_by: '0x0',
                  claimed_at: '0x0',
                },
              },
            ],
          },
        },
      }).map((jackpot) => jackpot.id)
    ).toEqual([2n, 1n]);
  });

  it('selects the newest jackpot that has completed a draw', () => {
    const jackpots = parseJackpots({
      data: {
        stakewarsJackpotModels: {
          edges: [
            jackpotNode({ id: '0x3', draw_count: 0 }),
            jackpotNode({ id: '0x2', draw_count: 2 }),
            jackpotNode({ id: '0x1', status: 4, draw_count: 1 }),
          ],
        },
      },
    });

    expect(latestJackpotDraw(jackpots)?.id).toBe(2n);
  });

  it('detects an expired or locked draw awaiting settlement', () => {
    expect(isJackpotDrawPending({ status: 2, endsAt: 100 }, 99_999)).toBe(
      false
    );
    expect(isJackpotDrawPending({ status: 2, endsAt: 100 }, 100_000)).toBe(
      true
    );
    expect(isJackpotDrawPending({ status: 3, endsAt: 200 }, 100_000)).toBe(
      true
    );
    expect(isJackpotDrawPending({ status: 4, endsAt: 100 }, 200_000)).toBe(
      false
    );
  });

  it('builds a claim to the connected winner address', () => {
    expect(
      buildClaimJackpotCall({
        jackpotSystemAddress,
        jackpotId: 7n,
        recipient: tokenAddress,
      })
    ).toEqual({
      contractAddress: jackpotSystemAddress,
      entrypoint: 'claim_prize',
      calldata: ['7', normalizedTokenAddress],
    });
  });
});

function jackpotNode(
  overrides: Partial<{
    id: string;
    status: number;
    draw_count: number;
  }> = {}
) {
  return {
    node: {
      id: '0x1',
      status: 2,
      sponsor: '0xabc',
      prize_kind: 1,
      token: '0x123',
      token_id: '0x0',
      amount: '0x64',
      sector_limit_snapshot: 2000,
      duration_seconds: '0x258',
      started_at: '0x10',
      ends_at: '0x20',
      randomness_block: '0x0',
      last_drawn_sector_id: 42,
      draw_count: 1,
      winner: '0x0',
      settled_at: '0x0',
      claimed: false,
      claimed_by: '0x0',
      claimed_at: '0x0',
      ...overrides,
    },
  };
}
