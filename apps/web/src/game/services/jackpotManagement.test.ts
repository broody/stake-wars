import { afterEach, describe, expect, it, vi } from 'vitest';
import { hash } from 'starknet';
import {
  canCreateJackpot,
  decodeJackpotResult,
  getActiveJackpot,
} from './starknet';

vi.mock('./config', () => ({
  config: {
    starknetRpcUrl: 'https://rpc.example',
    jackpotSystemAddress: '0x456',
  },
}));

// Jackpot model in ABI order, including the staking pool and last randomness.
const active = [
  '0x7',
  '0x2',
  '0xabc',
  '0x1',
  '0x123',
  '0x0',
  '0x0',
  '0x1f4',
  '0x0',
  '0x999',
  '0x7d0',
  '0x64',
  '0x3e8',
  '0x44c',
  '0x32',
  '0x567',
  '0x9',
  '0x2',
  '0x0',
  '0x0',
  '0x0',
  '0x0',
  '0x0',
];

function rpc(payload: unknown) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => payload });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('hidden jackpot management discovery', () => {
  it('reads the canonical current jackpot at latest, without relying on the indexer', async () => {
    const fetchMock = rpc({ result: active });
    const controller = new AbortController();
    await expect(getActiveJackpot(controller.signal)).resolves.toEqual({
      id: 7n,
      status: 2,
      sponsor: '0xabc',
      prizeKind: 1,
      token: '0x123',
      tokenId: 0n,
      amount: 500n,
      sectorLimitSnapshot: 2000,
      durationSeconds: 100,
      startedAt: 1000,
      endsAt: 1100,
      randomnessBlock: 50n,
      lastDrawnSectorId: 9,
      drawCount: 2,
      winner: '0x0',
      settledAt: null,
      claimed: false,
      claimedBy: '0x0',
      claimedAt: null,
    });
    const [, options] = fetchMock.mock.calls[0];
    expect(options.signal).toBe(controller.signal);
    expect(JSON.parse(options.body).params).toEqual({
      block_id: 'latest',
      request: {
        contract_address: '0x456',
        entry_point_selector: hash.getSelectorFromName('get_active_jackpot'),
        calldata: [],
      },
    });
  });

  it.each([
    {
      revert_error: {
        error: "0x6e6f20616374697665206a61636b706f74 ('no active jackpot')",
      },
    },
    { revert_error: '0x6e6f20616374697665206a61636b706f74' },
  ])(
    'recognizes only the explicit empty active counter as no current round',
    async (data) => {
      rpc({ error: { code: 40, message: 'Contract error', data } });
      await expect(getActiveJackpot()).resolves.toBeNull();
    }
  );

  it('does not offer creation when the RPC or contract check fails', async () => {
    rpc({
      error: {
        code: 40,
        message: 'Contract error',
        data: { revert_error: 'resource not registered' },
      },
    });
    await expect(getActiveJackpot()).rejects.toThrow('Contract error');
    rpc({
      error: {
        code: -32603,
        message: 'Internal error',
        data: 'no active jackpot',
      },
    });
    await expect(getActiveJackpot()).rejects.toThrow('Internal error');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network unavailable'))
    );
    await expect(getActiveJackpot()).rejects.toThrow('Network unavailable');
  });

  it('rejects malformed current-round data instead of treating it as an empty round', async () => {
    for (const result of [
      [],
      active.slice(1),
      active.map((value, index) => (index === 0 ? '0x0' : value)),
      active.map((value, index) => (index === 1 ? '0x0' : value)),
      active.map((value, index) => (index === 3 ? '0x4' : value)),
      active.map((value, index) => (index === 13 ? '-1' : value)),
    ]) {
      rpc({ result });
      await expect(getActiveJackpot()).rejects.toThrow();
    }
  });

  it('preserves full u256 prize values and edition IDs', () => {
    const result = [...active];
    result[3] = '0x3';
    result[5] = '0x2';
    result[6] = '0x1';
    result[8] = '0x2';
    expect(decodeJackpotResult(result)).toMatchObject({
      tokenId: (1n << 128n) + 2n,
      amount: (2n << 128n) + 500n,
    });
    result[6] = `0x${(1n << 128n).toString(16)}`;
    expect(() => decodeJackpotResult(result)).toThrow('invalid token ID');
  });

  it('checks the connected account role and rejects malformed authorization', async () => {
    const fetchMock = rpc({ result: ['0x1'] });
    await expect(canCreateJackpot('0xcafe')).resolves.toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).params.request).toEqual({
      contract_address: '0x456',
      entry_point_selector: hash.getSelectorFromName('can_create_jackpot'),
      calldata: ['0xcafe'],
    });
    rpc({ result: ['0x0'] });
    await expect(canCreateJackpot('0xcafe')).resolves.toBe(false);
    rpc({ result: ['0x2'] });
    await expect(canCreateJackpot('0xcafe')).rejects.toThrow(
      'invalid creator authorization'
    );
  });
});
