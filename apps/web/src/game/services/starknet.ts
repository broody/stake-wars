import { hash } from 'starknet';
import { config } from './config';
import type {
  ControlPointStatus,
  ChallengeStatus,
  OperatorStatus,
  PoolMemberInfo,
  StakingPoolInfo,
} from '../types';
import { addressesMatch } from '../utils/format';
import {
  chunkControlPointActions,
  MAX_CONTROL_POINT_SELECTION,
} from './controlPointLimits';

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

interface StarknetBlockWithTransactions {
  block_number: number;
  timestamp: number;
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

function parseTimestamp(value: string | undefined, field: string): number {
  const timestamp = parseFelt(value, field);
  const parsed = Number(timestamp);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Contract returned invalid ${field}`);
  }
  return parsed;
}

export function encodeRpcFelt(value: number | bigint): string {
  const felt = BigInt(value);
  if (felt < 0n) {
    throw new RangeError('RPC felt cannot be negative');
  }
  return `0x${felt.toString(16)}`;
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
    [encodeRpcFelt(controlPointId)],
    signal
  );
  if (result.length !== 12) {
    throw new Error('Control System returned an invalid Control Point status');
  }
  return decodeControlPointStatus(result, 0);
}

function decodeControlPointStatus(
  result: string[],
  offset: number
): ControlPointStatus {
  return {
    id: Number(parseFelt(result[offset], 'Control Point ID')),
    controller: result[offset + 1] ?? '0x0',
    capturePower: parseFelt(result[offset + 2], 'capture power'),
    ownershipGeneration: parseFelt(result[offset + 3], 'ownership generation'),
    controlledSince:
      parseTimestamp(result[offset + 4], 'control start time') || null,
    requiredStake: parseFelt(result[offset + 5], 'required stake'),
    activeChallengeId: parseFelt(result[offset + 6], 'active challenge ID'),
    challengeLeader: result[offset + 7] ?? '0x0',
    challengeLeaderPower: parseFelt(
      result[offset + 8],
      'challenge leader power'
    ),
    challengeDeadline:
      parseTimestamp(result[offset + 9], 'challenge deadline') || null,
    stale: parseFelt(result[offset + 10], 'stale flag') !== 0n,
    needsSync: parseFelt(result[offset + 11], 'sync flag') !== 0n,
  };
}

export function decodeControlPointStatusesResult(
  result: string[],
  expectedCount: number
): ControlPointStatus[] {
  const resultLength = Number(
    parseFelt(result[0], 'Control Point status count')
  );
  const statusWidth = 12;
  if (
    resultLength !== expectedCount ||
    result.length !== 1 + resultLength * statusWidth
  ) {
    throw new Error('Control System returned an invalid status batch');
  }

  return Array.from({ length: resultLength }, (_, index) =>
    decodeControlPointStatus(result, 1 + index * statusWidth)
  );
}

export async function getBlockTimestamps(
  blockNumbers: number[],
  signal?: AbortSignal
): Promise<Map<number, number>> {
  const uniqueBlockNumbers = [...new Set(blockNumbers)];
  const timestamps = new Map<number, number>();
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(8, uniqueBlockNumbers.length) },
    async () => {
      while (nextIndex < uniqueBlockNumbers.length) {
        const blockNumber = uniqueBlockNumbers[nextIndex];
        nextIndex += 1;
        const block = await call<StarknetBlockWithTransactions>(
          'starknet_getBlockWithTxHashes',
          { block_id: { block_number: blockNumber } },
          signal
        );
        if (
          block.block_number !== blockNumber ||
          !Number.isSafeInteger(block.timestamp) ||
          block.timestamp < 0
        ) {
          throw new Error(`Starknet RPC returned an invalid block timestamp`);
        }
        timestamps.set(blockNumber, block.timestamp);
      }
    }
  );

  await Promise.all(workers);
  return timestamps;
}

export async function getControlPointStatuses(
  controlPointIds: readonly number[],
  signal?: AbortSignal
): Promise<ControlPointStatus[]> {
  if (controlPointIds.length > MAX_CONTROL_POINT_SELECTION) {
    throw new RangeError(
      `At most ${MAX_CONTROL_POINT_SELECTION} Control Points can be read at once`
    );
  }

  const batches = chunkControlPointActions(controlPointIds);
  const batchStatuses = await Promise.all(
    batches.map(async (batch) => {
      const result = await callControlSystem(
        'get_control_point_statuses',
        [encodeRpcFelt(batch.length), ...batch.map(encodeRpcFelt)],
        signal
      );
      return decodeControlPointStatusesResult(result, batch.length);
    })
  );

  return batchStatuses.flat();
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
  if (result.length !== 12) {
    throw new Error('Control System returned an invalid Operator status');
  }

  return {
    operator: result[0] ?? operator,
    liveDelegatedAmount: parseFelt(result[1], 'staked STRK'),
    pointPower: parseFelt(result[2], 'point commitments'),
    challengePower: parseFelt(result[3], 'challenge commitments'),
    availablePower: parseFelt(result[4], 'available power'),
    generation: parseFelt(result[5], 'operator generation'),
    controlledPointCount: Number(parseFelt(result[6], 'owned point count')),
    activeChallengeId: parseFelt(result[7], 'active challenge ID'),
    activeChallengeCommitment: parseFelt(
      result[8],
      'active challenge commitment'
    ),
    retired: parseFelt(result[9], 'retired flag') !== 0n,
    exiting: parseFelt(result[10], 'exiting flag') !== 0n,
    needsSync: parseFelt(result[11], 'operator sync flag') !== 0n,
  };
}

export async function getChallengeStatus(
  challengeId: bigint,
  signal?: AbortSignal
): Promise<ChallengeStatus> {
  const result = await callControlSystem(
    'get_challenge_status',
    [encodeRpcFelt(challengeId)],
    signal
  );
  if (result.length !== 10) {
    throw new Error('Control System returned an invalid Challenge status');
  }
  return {
    id: parseFelt(result[0], 'challenge ID'),
    controlPointId: Number(parseFelt(result[1], 'Control Point ID')),
    incumbent: result[2] ?? '0x0',
    leader: result[3] ?? '0x0',
    leaderPower: parseFelt(result[4], 'leader power'),
    requiredPower: parseFelt(result[5], 'required power'),
    deadline: parseTimestamp(result[6], 'challenge deadline'),
    participantCount: Number(parseFelt(result[7], 'participant count')),
    settled: parseFelt(result[8], 'settled flag') !== 0n,
    winner: result[9] ?? '0x0',
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
      encodeRpcFelt(controlPointId),
      operator,
      encodeRpcFelt(ownershipGeneration),
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

export async function getStakingExitWaitWindow(
  signal?: AbortSignal
): Promise<number> {
  const pool = await getStakingPoolInfo(signal);
  const result = await callContract(
    pool.stakingContractAddress,
    'contract_parameters_v1',
    [],
    signal
  );
  return parseTimestamp(result[5], 'staking exit wait window');
}

export function decodePoolMemberInfoResult(
  result: string[],
  operator: string
): PoolMemberInfo | null {
  const optionVariant = parseFelt(result[0], 'pool membership option');

  if (optionVariant === 1n) return null;
  if (optionVariant !== 0n) {
    throw new Error('Staking pool returned an invalid membership option');
  }

  const unpoolTimeVariant = parseFelt(result[6], 'unpooling timestamp option');
  let unpoolTime: number | null;
  if (unpoolTimeVariant === 0n) {
    unpoolTime = parseTimestamp(result[7], 'unpooling timestamp');
  } else if (unpoolTimeVariant === 1n) {
    unpoolTime = null;
  } else {
    throw new Error('Staking pool returned an invalid unpooling timestamp');
  }

  return {
    rewardAddress: result[1] ?? operator,
    amount: parseFelt(result[2], 'staked amount'),
    unclaimedRewards: parseFelt(result[3], 'unclaimed rewards'),
    commissionBps: Number(parseFelt(result[4], 'member commission')),
    unpoolAmount: parseFelt(result[5], 'unpooling amount'),
    unpoolTime,
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
  return decodePoolMemberInfoResult(result, operator);
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
