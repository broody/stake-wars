import { hash } from 'starknet';
import { config } from './config';
import type {
  ControlPointStatus,
  OperatorStatus,
  PoolMemberInfo,
  StakingPoolInfo,
} from '../types';
import { addressesMatch } from '../utils/format';

interface JsonRpcResponse<T> {
  id: number;
  jsonrpc: '2.0';
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

export interface StarknetConnection {
  blockNumber: number;
  chainId: string;
  worldClassHash: string;
}

async function call<T>(
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
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
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

function parseFelt(value: string | undefined, field: string): bigint {
  if (value === undefined) {
    throw new Error(`Contract response omitted ${field}`);
  }

  try {
    return BigInt(value);
  } catch {
    throw new Error(`Contract returned invalid ${field}`);
  }
}

async function callContract(
  contractAddress: string,
  entrypoint: string,
  calldata: string[],
  signal?: AbortSignal
): Promise<string[]> {
  if (!contractAddress) {
    throw new Error(`Contract address for ${entrypoint} is not configured`);
  }

  return call<string[]>(
    'starknet_call',
    {
      request: {
        contract_address: contractAddress,
        entry_point_selector: hash.getSelectorFromName(entrypoint),
        calldata,
      },
      block_id: 'latest',
    },
    signal
  );
}

async function callControlSystem(
  entrypoint: string,
  calldata: string[],
  signal?: AbortSignal
): Promise<string[]> {
  if (!config.controlSystemAddress) {
    throw new Error('VITE_CONTROL_SYSTEM_ADDRESS is not configured');
  }

  return callContract(
    config.controlSystemAddress,
    entrypoint,
    calldata,
    signal
  );
}

function decodeFeltShortString(value: string): string {
  const hex = value.startsWith('0x') ? value.slice(2) : value;
  if (hex.length === 0 || hex.length % 2 !== 0) {
    return value;
  }

  const decoded = Array.from({ length: hex.length / 2 }, (_, index) =>
    String.fromCharCode(
      Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
    )
  ).join('');

  return /^[\x20-\x7E]+$/.test(decoded) ? decoded : value;
}

export async function checkStarknetConnection(
  signal?: AbortSignal
): Promise<StarknetConnection> {
  if (!config.dojoWorldAddress) {
    throw new Error('VITE_DOJO_WORLD_ADDRESS is not configured');
  }

  const [encodedChainId, blockNumber, worldClassHash] = await Promise.all([
    call<string>('starknet_chainId', [], signal),
    call<number>('starknet_blockNumber', [], signal),
    call<string>(
      'starknet_getClassHashAt',
      {
        block_id: 'latest',
        contract_address: config.dojoWorldAddress,
      },
      signal
    ),
  ]);
  const chainId = decodeFeltShortString(encodedChainId);

  if (config.starknetChainId && chainId !== config.starknetChainId) {
    throw new Error(
      `Expected Starknet chain ${config.starknetChainId}, received ${chainId}`
    );
  }

  return { blockNumber, chainId, worldClassHash };
}

export async function getControlPointStatus(
  controlPointId: number,
  signal?: AbortSignal
): Promise<ControlPointStatus> {
  const result = await callControlSystem(
    'get_control_point_status',
    [`0x${controlPointId.toString(16)}`],
    signal
  );

  return {
    id: Number(parseFelt(result[0], 'Control Point ID')),
    controller: result[1] ?? '0x0',
    allocatedStake: parseFelt(result[2], 'allocated stake'),
    ownershipGeneration: parseFelt(result[3], 'ownership generation'),
    requiredStake: parseFelt(result[4], 'required stake'),
    stale: parseFelt(result[5], 'stale flag') !== 0n,
    needsSync: parseFelt(result[6], 'sync flag') !== 0n,
  };
}

export async function getOperatorStatus(
  operator: string,
  signal?: AbortSignal
): Promise<OperatorStatus> {
  const result = await callControlSystem(
    'get_operator_status',
    [operator],
    signal
  );

  return {
    operator: result[0] ?? operator,
    liveDelegatedAmount: parseFelt(result[1], 'staked STRK'),
    totalAllocated: parseFelt(result[2], 'total allocated stake'),
    availableStake: parseFelt(result[3], 'available stake'),
    generation: parseFelt(result[4], 'operator generation'),
    controlledPointCount: Number(parseFelt(result[5], 'owned point count')),
    needsSync: parseFelt(result[6], 'operator sync flag') !== 0n,
  };
}

export async function canManageControlPointImage(
  controlPointId: number,
  operator: string,
  ownershipGeneration: bigint,
  signal?: AbortSignal
): Promise<boolean> {
  const result = await callControlSystem(
    'can_manage_image',
    [
      `0x${controlPointId.toString(16)}`,
      operator,
      `0x${ownershipGeneration.toString(16)}`,
    ],
    signal
  );

  return parseFelt(result[0], 'image-management permission') !== 0n;
}

export async function getStakingPoolInfo(
  signal?: AbortSignal
): Promise<StakingPoolInfo> {
  const result = await callContract(
    config.stakingPoolAddress,
    'contract_parameters_v1',
    [],
    signal
  );
  const tokenAddress = result[3] ?? '0x0';

  if (
    config.strkTokenAddress &&
    !addressesMatch(tokenAddress, config.strkTokenAddress)
  ) {
    throw new Error(
      'Configured staking pool does not accept the configured STRK token'
    );
  }

  if (parseFelt(result[1], 'validator removal flag') !== 0n) {
    throw new Error('The configured validator has been removed from staking');
  }

  return {
    poolAddress: config.stakingPoolAddress,
    validatorAddress: result[0] ?? '0x0',
    stakingContractAddress: result[2] ?? '0x0',
    tokenAddress,
    commissionBps: Number(parseFelt(result[4], 'validator commission')),
  };
}

export async function getPoolMemberInfo(
  operator: string,
  signal?: AbortSignal
): Promise<PoolMemberInfo | null> {
  const result = await callContract(
    config.stakingPoolAddress,
    'get_pool_member_info_v1',
    [operator],
    signal
  );
  const optionVariant = parseFelt(result[0], 'pool membership option');

  if (optionVariant === 1n) return null;
  if (optionVariant !== 0n) {
    throw new Error('Staking pool returned an invalid membership option');
  }

  return {
    rewardAddress: result[1] ?? operator,
    amount: parseFelt(result[2], 'staked amount'),
    unclaimedRewards: parseFelt(result[3], 'unclaimed rewards'),
    commissionBps: Number(parseFelt(result[4], 'member commission')),
    unpoolAmount: parseFelt(result[5], 'unpooling amount'),
  };
}

export async function getStrkBalance(
  operator: string,
  signal?: AbortSignal
): Promise<bigint> {
  const result = await callContract(
    config.strkTokenAddress,
    'balance_of',
    [operator],
    signal
  );
  const low = parseFelt(result[0], 'STRK balance low word');
  const high = parseFelt(result[1], 'STRK balance high word');
  return low + (high << 128n);
}
