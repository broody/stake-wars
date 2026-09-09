import { describe, expect, it } from 'vitest';
import {
  buildClaimSupplyDropCall,
  buildCreateSupplyDropCalls,
  buildTopUpSupplyDropCalls,
  isSupplyDropTopUpOpen,
  isSupplyDropDrawPending,
  latestSupplyDropDraw,
  parseSupplyDrops,
  parseDurationSeconds,
  parseTokenId,
  parseTokenUnits,
} from './supplyDrop';

const supplyDropSystemAddress = '0x456';
const tokenAddress = '0x123';
const normalizedTokenAddress =
  '0x0000000000000000000000000000000000000000000000000000000000000123';

describe('supply drop form parsing', () => {
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

describe('supply drop creation calls', () => {
  it('atomically approves and creates an ERC-20 supply drop', () => {
    expect(
      buildCreateSupplyDropCalls({
        supplyDropSystemAddress,
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
        calldata: [supplyDropSystemAddress, '500', '0'],
      },
      {
        contractAddress: supplyDropSystemAddress,
        entrypoint: 'create_supply_drop',
        calldata: ['604800', '1', normalizedTokenAddress, '0', '0', '500', '0'],
      },
    ]);
  });

  it('approves the selected ERC-721 token and escrows one', () => {
    expect(
      buildCreateSupplyDropCalls({
        supplyDropSystemAddress,
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
        calldata: [supplyDropSystemAddress, '99', '0'],
      },
      {
        contractAddress: supplyDropSystemAddress,
        entrypoint: 'create_supply_drop',
        calldata: ['3600', '2', normalizedTokenAddress, '99', '0', '1', '0'],
      },
    ]);
  });

  it('uses operator approval for an ERC-1155 supply drop', () => {
    expect(
      buildCreateSupplyDropCalls({
        supplyDropSystemAddress,
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
        calldata: [supplyDropSystemAddress, '1'],
      },
      {
        contractAddress: supplyDropSystemAddress,
        entrypoint: 'create_supply_drop',
        calldata: ['600', '3', normalizedTokenAddress, '7', '0', '12', '0'],
      },
    ]);
  });
});

describe('supply drop ledger', () => {
  it('parses and orders indexed supply drops newest first', () => {
    expect(
      parseSupplyDrops({
        data: {
          stakewarsSupplyDropModels: {
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
      }).map((supplyDrop) => supplyDrop.id)
    ).toEqual([2n, 1n]);
  });

  it('selects the newest supply drop that has completed a draw', () => {
    const supplyDrops = parseSupplyDrops({
      data: {
        stakewarsSupplyDropModels: {
          edges: [
            supplyDropNode({ id: '0x3', draw_count: 0 }),
            supplyDropNode({ id: '0x2', draw_count: 2 }),
            supplyDropNode({ id: '0x1', status: 4, draw_count: 1 }),
          ],
        },
      },
    });

    expect(latestSupplyDropDraw(supplyDrops)?.id).toBe(2n);
  });

  it('detects an expired or locked draw awaiting settlement', () => {
    expect(isSupplyDropDrawPending({ status: 2, endsAt: 100 }, 99_999)).toBe(
      false
    );
    expect(isSupplyDropDrawPending({ status: 2, endsAt: 100 }, 100_000)).toBe(
      true
    );
    expect(isSupplyDropDrawPending({ status: 3, endsAt: 200 }, 100_000)).toBe(
      true
    );
    expect(isSupplyDropDrawPending({ status: 4, endsAt: 100 }, 200_000)).toBe(
      false
    );
  });

  it('builds a claim to the connected winner address', () => {
    expect(
      buildClaimSupplyDropCall({
        supplyDropSystemAddress,
        supplyDropId: 7n,
        recipient: tokenAddress,
      })
    ).toEqual({
      contractAddress: supplyDropSystemAddress,
      entrypoint: 'claim_prize',
      calldata: ['7', normalizedTokenAddress],
    });
  });
});

function supplyDropNode(
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

describe('supply drop top-ups', () => {
  const supplyDrop = {
    id: 7n,
    token: tokenAddress,
    prizeKind: 1 as const,
    status: 2 as const,
    endsAt: 100,
    amount: 500n,
  };
  const options = {
    supplyDropSystemAddress,
    supplyDrop,
    amount: 250n,
    now: 99_999,
  };

  it('approves only the increment and tops up the existing supply drop atomically', () => {
    expect(buildTopUpSupplyDropCalls(options)).toEqual([
      {
        contractAddress: normalizedTokenAddress,
        entrypoint: 'approve',
        calldata: [supplyDropSystemAddress, '250', '0'],
      },
      {
        contractAddress: supplyDropSystemAddress,
        entrypoint: 'top_up_supply_drop',
        calldata: ['7', '250', '0'],
      },
    ]);
  });

  it('uses the existing ERC-1155 token approval and preserves u256 high words', () => {
    const calls = buildTopUpSupplyDropCalls({
      ...options,
      supplyDrop: { ...supplyDrop, prizeKind: 3 },
      amount: (1n << 128n) + 3n,
    });
    expect(calls).toEqual([
      {
        contractAddress: normalizedTokenAddress,
        entrypoint: 'set_approval_for_all',
        calldata: [supplyDropSystemAddress, '1'],
      },
      {
        contractAddress: supplyDropSystemAddress,
        entrypoint: 'top_up_supply_drop',
        calldata: ['7', '3', '1'],
      },
    ]);
  });

  it('closes at the exact deadline and rejects inactive or ERC-721 prizes', () => {
    expect(isSupplyDropTopUpOpen(supplyDrop, 99_999)).toBe(true);
    expect(isSupplyDropTopUpOpen(supplyDrop, 100_000)).toBe(false);
    expect(() =>
      buildTopUpSupplyDropCalls({ ...options, now: 100_000 })
    ).toThrow('no longer open');
    for (const status of [1, 3, 4] as const) {
      expect(() =>
        buildTopUpSupplyDropCalls({
          ...options,
          supplyDrop: { ...supplyDrop, status },
        })
      ).toThrow('no longer open');
    }
    expect(() =>
      buildTopUpSupplyDropCalls({
        ...options,
        supplyDrop: { ...supplyDrop, prizeKind: 2 },
      })
    ).toThrow('no longer open');
  });

  it('rejects invalid increments and overflow of the combined prize', () => {
    for (const amount of [0n, -1n, 1n << 256n]) {
      expect(() => buildTopUpSupplyDropCalls({ ...options, amount })).toThrow(
        'Top-up amount'
      );
    }
    expect(() =>
      buildTopUpSupplyDropCalls({ ...options, amount: (1n << 256n) - 500n })
    ).toThrow('resulting prize');
    expect(() =>
      buildTopUpSupplyDropCalls({
        ...options,
        supplyDrop: { ...supplyDrop, id: 0n },
      })
    ).toThrow('SupplyDrop ID');
    expect(() =>
      buildTopUpSupplyDropCalls({ ...options, supplyDropSystemAddress: '' })
    ).toThrow('not configured');
  });
});
