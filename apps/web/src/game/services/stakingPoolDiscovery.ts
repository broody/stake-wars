import { hash } from 'starknet';
import type { PoolMemberInfo, StakingPoolInfo } from '../types';
import { addressesMatch } from '../utils/format';
import { config } from './config';
import { decodePoolMemberInfoResult, getStakingPoolInfo } from './starknet';

const RPC_BATCH_SIZE = 40;
const EVENT_BLOCK_RANGE = 50_000;
const NEW_DELEGATION_POOL_SELECTOR =
  hash.getSelectorFromName('NewDelegationPool');

type KnownPool = readonly [poolAddress: string, stakerAddress: string];

interface ChainPoolRegistry {
  indexedThroughBlock: number;
  pools: readonly KnownPool[];
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: unknown;
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

interface StarknetEvent {
  block_number: number;
  keys: string[];
}

interface StarknetEventsPage {
  events: StarknetEvent[];
  continuation_token?: string;
}

export interface ExternalDelegationPosition extends PoolMemberInfo {
  poolAddress: string;
  stakerAddress: string;
  totalAmount: bigint;
}

async function chainPoolRegistry(): Promise<ChainPoolRegistry | null> {
  if (config.starknetChainId === 'SN_MAIN') {
    const registry = await import('./stakingPoolRegistry.mainnet');
    return {
      indexedThroughBlock: registry.MAINNET_STAKING_POOLS_INDEXED_THROUGH,
      pools: registry.MAINNET_STAKING_POOLS,
    };
  }
  if (config.starknetChainId === 'SN_SEPOLIA') {
    const registry = await import('./stakingPoolRegistry.sepolia');
    return {
      indexedThroughBlock: registry.SEPOLIA_STAKING_POOLS_INDEXED_THROUGH,
      pools: registry.SEPOLIA_STAKING_POOLS,
    };
  }
  return null;
}

async function rpc<T>(
  method: string,
  params: unknown,
  signal?: AbortSignal
): Promise<T> {
  if (!config.starknetRpcUrl) {
    throw new Error('VITE_STARKNET_RPC_URL is not configured');
  }

  const response = await fetch(config.starknetRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Starknet RPC returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as JsonRpcResponse<T>;
  if (payload.error) {
    throw new Error(
      `Starknet RPC error ${payload.error.code}: ${payload.error.message}`
    );
  }
  if (payload.result === undefined) {
    throw new Error(`Starknet RPC returned no result for ${method}`);
  }
  return payload.result;
}

async function fetchEventsRange(
  stakingContractAddress: string,
  fromBlock: number,
  toBlock: number,
  signal?: AbortSignal
): Promise<KnownPool[]> {
  const pools: KnownPool[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await rpc<StarknetEventsPage>(
      'starknet_getEvents',
      {
        filter: {
          from_block: { block_number: fromBlock },
          to_block: { block_number: toBlock },
          address: stakingContractAddress,
          keys: [[NEW_DELEGATION_POOL_SELECTOR]],
          chunk_size: 100,
          ...(continuationToken
            ? { continuation_token: continuationToken }
            : {}),
        },
      },
      signal
    );

    for (const event of page.events) {
      const stakerAddress = event.keys[1];
      const poolAddress = event.keys[2];
      if (stakerAddress && poolAddress) {
        pools.push([poolAddress, stakerAddress]);
      }
    }
    continuationToken = page.continuation_token;
  } while (continuationToken);

  return pools;
}

async function getPoolsCreatedAfterSnapshot(
  stakingContractAddress: string,
  indexedThroughBlock: number,
  signal?: AbortSignal
): Promise<KnownPool[]> {
  const latestBlock = await rpc<number>('starknet_blockNumber', [], signal);
  if (latestBlock <= indexedThroughBlock) return [];

  const ranges: Array<[number, number]> = [];
  for (
    let fromBlock = indexedThroughBlock + 1;
    fromBlock <= latestBlock;
    fromBlock += EVENT_BLOCK_RANGE
  ) {
    ranges.push([
      fromBlock,
      Math.min(latestBlock, fromBlock + EVENT_BLOCK_RANGE - 1),
    ]);
  }

  return (
    await Promise.all(
      ranges.map(([fromBlock, toBlock]) =>
        fetchEventsRange(stakingContractAddress, fromBlock, toBlock, signal)
      )
    )
  ).flat();
}

function uniquePools(pools: readonly KnownPool[]): KnownPool[] {
  const byAddress = new Map<string, KnownPool>();
  for (const pool of pools) {
    try {
      byAddress.set(BigInt(pool[0]).toString(16), pool);
    } catch {
      // Ignore malformed event data instead of breaking wallet discovery.
    }
  }
  return [...byAddress.values()];
}

async function batchContractCalls(
  calls: Array<{
    contractAddress: string;
    entrypoint: string;
    calldata: string[];
  }>,
  signal?: AbortSignal
): Promise<Array<string[] | null>> {
  if (!config.starknetRpcUrl) {
    throw new Error('VITE_STARKNET_RPC_URL is not configured');
  }

  const indexedCalls = calls.map((call, id) => ({ ...call, id }));
  const chunks = Array.from(
    { length: Math.ceil(indexedCalls.length / RPC_BATCH_SIZE) },
    (_, index) =>
      indexedCalls.slice(index * RPC_BATCH_SIZE, (index + 1) * RPC_BATCH_SIZE)
  );

  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const requests: JsonRpcRequest[] = chunk.map((call) => ({
        jsonrpc: '2.0',
        id: call.id,
        method: 'starknet_call',
        params: {
          request: {
            contract_address: call.contractAddress,
            entry_point_selector: hash.getSelectorFromName(call.entrypoint),
            calldata: call.calldata,
          },
          block_id: 'latest',
        },
      }));
      const response = await fetch(config.starknetRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requests),
        signal,
      });
      if (!response.ok) {
        throw new Error(`Starknet RPC returned HTTP ${response.status}`);
      }
      return (await response.json()) as Array<JsonRpcResponse<string[]>>;
    })
  );

  const results = new Map<number, string[]>();
  for (const response of chunkResults.flat()) {
    if (response.result) results.set(response.id, response.result);
  }
  return indexedCalls.map((call) => results.get(call.id) ?? null);
}

function validSourcePool(
  result: string[] | null,
  knownPool: KnownPool,
  targetPool: StakingPoolInfo
): boolean {
  if (!result || result.length < 4) return false;
  try {
    return (
      BigInt(result[1]) === 0n &&
      addressesMatch(result[0], knownPool[1]) &&
      addressesMatch(result[2], targetPool.stakingContractAddress) &&
      addressesMatch(result[3], targetPool.tokenAddress)
    );
  } catch {
    return false;
  }
}

export async function getExternalDelegations(
  operator: string,
  signal?: AbortSignal
): Promise<ExternalDelegationPosition[]> {
  const registry = await chainPoolRegistry();
  if (!registry || !operator || !config.stakingPoolAddress) return [];

  const targetPool = await getStakingPoolInfo(signal);
  let recentPools: KnownPool[] = [];
  try {
    recentPools = await getPoolsCreatedAfterSnapshot(
      targetPool.stakingContractAddress,
      registry.indexedThroughBlock,
      signal
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    // The checked-in registry remains usable if an RPC does not support event ranges.
  }

  const candidatePools = uniquePools([
    ...registry.pools,
    ...recentPools,
  ]).filter(
    ([poolAddress]) => !addressesMatch(poolAddress, targetPool.poolAddress)
  );
  const memberResults = await batchContractCalls(
    candidatePools.map(([poolAddress]) => ({
      contractAddress: poolAddress,
      entrypoint: 'get_pool_member_info_v1',
      calldata: [operator],
    })),
    signal
  );

  const memberships = candidatePools.flatMap((pool, index) => {
    const result = memberResults[index];
    if (!result) return [];
    try {
      const member = decodePoolMemberInfoResult(result, operator);
      if (!member || member.amount + member.unpoolAmount <= 0n) return [];
      return [{ pool, member }];
    } catch {
      return [];
    }
  });
  if (memberships.length === 0) return [];

  const parameterResults = await batchContractCalls(
    memberships.map(({ pool }) => ({
      contractAddress: pool[0],
      entrypoint: 'contract_parameters_v1',
      calldata: [],
    })),
    signal
  );

  return memberships
    .flatMap(({ pool, member }, index) =>
      validSourcePool(parameterResults[index], pool, targetPool)
        ? [
            {
              ...member,
              poolAddress: pool[0],
              stakerAddress: pool[1],
              totalAmount: member.amount + member.unpoolAmount,
            },
          ]
        : []
    )
    .sort((left, right) =>
      left.totalAmount === right.totalAmount
        ? 0
        : left.totalAmount > right.totalAmount
          ? -1
          : 1
    );
}
