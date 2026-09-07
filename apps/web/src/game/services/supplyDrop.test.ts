import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hash } from 'starknet';
import {
  prepareSupplyDropClaim,
  prepareSupplyDropRecovery,
} from './supplyDrop';
import {
  decodeSupplyDropHold,
  getSupplyDropHold,
  getSupplyDropPolicy,
} from './starknet';

vi.mock('./config', () => ({
  config: {
    starknetRpcUrl: 'https://rpc.example',
    jackpotSystemAddress: '0x456',
    controlSystemAddress: '0x789',
    stakingPoolAddress: '0x999',
    strkTokenAddress: '0x123',
  },
}));

const winner = '0xabc';
const canonicalDrop = [
  '0x7',
  '0x4',
  '0xdef',
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
  winner,
  '0x44c',
  '0x0',
  '0x0',
  '0x0',
];
let responses: Record<string, { result?: string[]; error?: unknown }>;
let requests: Array<{
  contract_address: string;
  entry_point_selector: string;
  calldata: string[];
}>;

beforeEach(() => {
  requests = [];
  responses = Object.fromEntries(
    Object.entries({
      get_jackpot: canonicalDrop,
      get_supply_drop_policy: ['0x7', '0x999', '0x1'],
      get_supply_drop_hold: ['0x0', '0x0', '0x0', '0x0', '0x0', '0x0'],
      get_pool_member_info_v1: [
        '0x0',
        winner,
        '0x3e8',
        '0x0',
        '0x0',
        '0x0',
        '0x1',
      ],
      contract_parameters_v1: ['0x888', '0x0', '0x777', '0x123', '0x64'],
    }).map(([name, result]) => [
      hash.getSelectorFromName(name),
      { result: [...result] },
    ])
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      expect(body.params.block_id).toBe('latest');
      requests.push(body.params.request);
      const payload = responses[body.params.request.entry_point_selector];
      if (!payload) throw new Error('Unexpected RPC selector');
      return { ok: true, json: async () => payload };
    })
  );
});
afterEach(() => vi.unstubAllGlobals());
function result(name: string, value: string[]) {
  responses[hash.getSelectorFromName(name)] = { result: value };
}
function rpcError(name: string, code: number, data: unknown = '') {
  responses[hash.getSelectorFromName(name)] = {
    error: { code, message: 'Read failed', data },
  };
}

describe('Supply Drop claim and staking', () => {
  it('builds claim, approval, exact canonical prize stake, and sync in order', async () => {
    const calls = await prepareSupplyDropClaim(7n, winner);
    expect(calls.map((call) => call.entrypoint)).toEqual([
      'claim_prize',
      'approve',
      'add_to_delegation_pool',
      'sync_operator',
    ]);
    expect(calls[0].calldata).toEqual(['7', expect.any(String)]);
    expect(calls[1].contractAddress).toBe('0x123');
    expect(calls[1].calldata).toEqual(['0x999', '500', '0']);
    expect(calls[2]).toEqual({
      contractAddress: '0x999',
      entrypoint: 'add_to_delegation_pool',
      calldata: [winner, '500'],
    });
    expect(calls[3]).toEqual({
      contractAddress: '0x789',
      entrypoint: 'sync_operator',
      calldata: [winner],
    });
  });
  it('uses the policy pool even if it differs from frontend configuration', async () => {
    result('get_supply_drop_policy', ['0x7', '0x555', '0x1']);
    const calls = await prepareSupplyDropClaim(7n, winner);
    expect(calls[2].contractAddress).toBe('0x555');
    const memberRequest = requests.find(
      (request) =>
        request.entry_point_selector ===
        hash.getSelectorFromName('get_pool_member_info_v1')
    );
    expect(memberRequest?.contract_address).toBe('0x555');
  });
  it('uses pool entry for a winner who is no longer a member', async () => {
    result('get_pool_member_info_v1', ['0x1']);
    const calls = await prepareSupplyDropClaim(7n, winner);
    expect(calls[2].entrypoint).toBe('enter_delegation_pool');
  });
  it('preserves legacy cash claims', async () => {
    result('get_supply_drop_policy', ['0x7', '0x0', '0x0']);
    expect(
      (await prepareSupplyDropClaim(7n, winner)).map((call) => call.entrypoint)
    ).toEqual(['claim_prize']);
  });
  it('blocks a second claim while the first staking requirement is outstanding', async () => {
    result('get_supply_drop_hold', ['0x999', '1500', '1200', '300', '0', '1']);
    await expect(prepareSupplyDropClaim(7n, winner)).rejects.toThrow(
      'outstanding Supply Drop'
    );
  });
  it('rejects mismatched winner, already-claimed prize, and wrong token', async () => {
    await expect(prepareSupplyDropClaim(7n, '0xbbb')).rejects.toThrow(
      'not claimable'
    );
    const claimed = [...canonicalDrop];
    claimed[20] = '0x1';
    result('get_jackpot', claimed);
    await expect(prepareSupplyDropClaim(7n, winner)).rejects.toThrow(
      'not claimable'
    );
    const wrongToken = [...canonicalDrop];
    wrongToken[4] = '0x124';
    result('get_jackpot', wrongToken);
    await expect(prepareSupplyDropClaim(7n, winner)).rejects.toThrow(
      'token does not match'
    );
  });
  it('does not offer automatic staking during an exit', async () => {
    result('get_pool_member_info_v1', [
      '0',
      winner,
      '1000',
      '0',
      '0',
      '20',
      '0',
      '2000000000',
    ]);
    await expect(prepareSupplyDropClaim(7n, winner)).rejects.toThrow(
      'pending staking withdrawal'
    );
  });
  it('recovers only the remaining amount using the recorded pool', async () => {
    result('get_supply_drop_hold', ['0x555', '1500', '1200', '300', '0', '1']);
    const calls = await prepareSupplyDropRecovery(winner);
    expect(calls.map((call) => call.entrypoint)).toEqual([
      'approve',
      'add_to_delegation_pool',
      'sync_operator',
    ]);
    expect(calls[1]).toEqual({
      contractAddress: '0x555',
      entrypoint: 'add_to_delegation_pool',
      calldata: [winner, '300'],
    });
    result('get_supply_drop_hold', ['0x555', '1500', '1500', '0', '0', '0']);
    expect(await prepareSupplyDropRecovery(winner)).toEqual([]);
  });
});

describe('Supply Drop authoritative reads', () => {
  it('recognizes legacy deployments only for an explicitly missing entrypoint', async () => {
    rpcError('get_supply_drop_policy', 21);
    rpcError('get_supply_drop_hold', 21);
    expect((await getSupplyDropPolicy(7n)).stakingRequired).toBe(false);
    expect(await getSupplyDropHold(winner)).toBeNull();
  });
  it.each([20, 40, -32603])(
    'fails closed for other RPC errors (%s)',
    async (code) => {
      rpcError('get_supply_drop_policy', code, 'resource unavailable');
      rpcError('get_supply_drop_hold', code, 'resource unavailable');
      await expect(getSupplyDropPolicy(7n)).rejects.toThrow('Read failed');
      await expect(getSupplyDropHold(winner)).rejects.toThrow('Read failed');
    }
  );
  it('does not silently permit claims when policy verification is offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(prepareSupplyDropClaim(7n, winner)).rejects.toThrow('offline');
  });
  it('rejects corrupt hold data instead of treating it as unlocked', () => {
    for (const value of [
      [],
      ['0x999', '1500', '1000', '500', '0', '0'],
      ['0x999', '1500', '1000', '-1', '0', '1'],
      ['0x999', '1500', '1000', '500', '0', '2'],
    ]) {
      expect(() => decodeSupplyDropHold(value)).toThrow();
    }
  });
});
