import { validateAndParseAddress, type Call } from 'starknet';
import { config } from './config';
import type {
  SupplyDrop,
  SupplyDropPrizeKind as IndexedSupplyDropPrizeKind,
  SupplyDropStatus,
} from '../types';

export type SupplyDropPrizeKind = 'erc20' | 'erc721' | 'erc1155';
export type SupplyDropDurationUnit = 'minutes' | 'hours' | 'days';

const MAX_U64 = (1n << 64n) - 1n;
const MAX_U256 = (1n << 256n) - 1n;
const U128_MODULUS = 1n << 128n;

const PRIZE_KIND_CODES: Record<SupplyDropPrizeKind, number> = {
  erc20: 1,
  erc721: 2,
  erc1155: 3,
};

const DURATION_MULTIPLIERS: Record<SupplyDropDurationUnit, bigint> = {
  minutes: 60n,
  hours: 3_600n,
  days: 86_400n,
};

const SUPPLY_DROPS_QUERY = `
  query StakeWarsSupplyDrops {
    stakewarsSupplyDropModels(first: 1000) {
      edges {
        node {
          id
          status
          sponsor
          prize_kind
          token
          token_id
          amount
          sector_limit_snapshot
          duration_seconds
          started_at
          ends_at
          randomness_block
          last_drawn_sector_id
          draw_count
          winner
          settled_at
          claimed
          claimed_by
          claimed_at
        }
      }
    }
  }
`;

interface SupplyDropNode {
  id: number | string;
  status: number | string;
  sponsor: string;
  prize_kind: number | string;
  token: string;
  token_id: string;
  amount: string;
  sector_limit_snapshot: number | string;
  duration_seconds: string;
  started_at: string;
  ends_at: string;
  randomness_block: string;
  last_drawn_sector_id: number | string;
  draw_count: number | string;
  winner: string;
  settled_at: string;
  claimed: boolean;
  claimed_by: string;
  claimed_at: string;
}

interface SupplyDropResponse {
  data?: {
    stakewarsSupplyDropModels?: {
      edges?: Array<{ node?: SupplyDropNode }>;
    };
  };
  errors?: Array<{ message?: string }>;
}

function parseBigInt(value: number | string, field: string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`Torii returned an invalid ${field}`);
  }
}

function parseSafeNumber(value: number | string, field: string): number {
  const parsed = Number(parseBigInt(value, field));
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Torii returned an invalid ${field}`);
  }
  return parsed;
}

function parsePrizeKind(value: number | string): IndexedSupplyDropPrizeKind {
  const parsed = parseSafeNumber(value, 'supply drop prize kind');
  if (parsed !== 1 && parsed !== 2 && parsed !== 3) {
    throw new Error('Torii returned an unsupported supply drop prize kind');
  }
  return parsed;
}

function parseStatus(value: number | string): SupplyDropStatus {
  const parsed = parseSafeNumber(value, 'supply drop status');
  if (parsed !== 1 && parsed !== 2 && parsed !== 3 && parsed !== 4) {
    throw new Error('Torii returned an unsupported supply drop status');
  }
  return parsed;
}

function optionalTimestamp(value: string, field: string): number | null {
  const parsed = parseSafeNumber(value, field);
  return parsed === 0 ? null : parsed;
}

export function parseSupplyDrops(payload: SupplyDropResponse): SupplyDrop[] {
  if (payload.errors?.length) {
    throw new Error(
      payload.errors[0]?.message || 'Torii rejected the supply drop query'
    );
  }
  const rows = payload.data?.stakewarsSupplyDropModels?.edges;
  if (!rows) {
    throw new Error('Torii omitted the supply drop collection');
  }

  return rows
    .flatMap(({ node }): SupplyDrop[] => {
      if (!node) return [];
      return [
        {
          id: parseBigInt(node.id, 'supply drop ID'),
          status: parseStatus(node.status),
          sponsor: node.sponsor,
          prizeKind: parsePrizeKind(node.prize_kind),
          token: node.token,
          tokenId: parseBigInt(node.token_id, 'supply drop token ID'),
          amount: parseBigInt(node.amount, 'supply drop amount'),
          sectorLimitSnapshot: parseSafeNumber(
            node.sector_limit_snapshot,
            'supply drop Sector limit'
          ),
          durationSeconds: parseSafeNumber(
            node.duration_seconds,
            'supply drop duration'
          ),
          startedAt: parseSafeNumber(node.started_at, 'supply drop start time'),
          endsAt: parseSafeNumber(node.ends_at, 'supply drop end time'),
          randomnessBlock: parseBigInt(
            node.randomness_block,
            'supply drop randomness block'
          ),
          lastDrawnSectorId: parseSafeNumber(
            node.last_drawn_sector_id,
            'drawn Sector ID'
          ),
          drawCount: parseSafeNumber(node.draw_count, 'supply drop draw count'),
          winner: node.winner,
          settledAt: optionalTimestamp(
            node.settled_at,
            'supply drop settlement time'
          ),
          claimed: node.claimed,
          claimedBy: node.claimed_by,
          claimedAt: optionalTimestamp(
            node.claimed_at,
            'supply drop claim time'
          ),
        },
      ];
    })
    .sort((left, right) => (left.id < right.id ? 1 : -1));
}

export async function getSupplyDrops(
  signal?: AbortSignal
): Promise<SupplyDrop[]> {
  const response = await fetch(config.toriiGraphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: SUPPLY_DROPS_QUERY, variables: {} }),
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    throw new Error(`Torii returned HTTP ${response.status}`);
  }
  return parseSupplyDrops((await response.json()) as SupplyDropResponse);
}

export function latestSupplyDropDraw(
  supplyDrops: readonly SupplyDrop[]
): SupplyDrop | null {
  return supplyDrops.reduce<SupplyDrop | null>((latest, supplyDrop) => {
    if (supplyDrop.drawCount === 0) return latest;
    if (!latest || supplyDrop.id > latest.id) return supplyDrop;
    return latest;
  }, null);
}

export function isSupplyDropDrawPending(
  supplyDrop: Pick<SupplyDrop, 'endsAt' | 'status'>,
  now = Date.now()
): boolean {
  return (
    supplyDrop.status === 3 ||
    (supplyDrop.status === 2 && supplyDrop.endsAt * 1_000 <= now)
  );
}

export function isSupplyDropTopUpOpen(
  supplyDrop: Pick<SupplyDrop, 'status' | 'prizeKind' | 'endsAt'>,
  now = Date.now()
): boolean {
  return (
    supplyDrop.status === 2 &&
    (supplyDrop.prizeKind === 1 || supplyDrop.prizeKind === 3) &&
    now < supplyDrop.endsAt * 1_000
  );
}

export function buildTopUpSupplyDropCalls({
  supplyDropSystemAddress,
  supplyDrop,
  amount,
  now = Date.now(),
}: {
  supplyDropSystemAddress: string;
  supplyDrop: Pick<
    SupplyDrop,
    'id' | 'token' | 'prizeKind' | 'status' | 'endsAt' | 'amount'
  >;
  amount: bigint;
  now?: number;
}): Call[] {
  if (!supplyDropSystemAddress) {
    throw new Error('The Supply Drop System is not configured.');
  }
  if (supplyDrop.id <= 0n || supplyDrop.id > MAX_U64) {
    throw new Error('SupplyDrop ID is invalid.');
  }
  if (!isSupplyDropTopUpOpen(supplyDrop, now)) {
    throw new Error('This supply drop is no longer open for top-ups.');
  }
  if (amount <= 0n || amount > MAX_U256) {
    throw new Error('Top-up amount must be greater than zero and fit in u256.');
  }
  if (supplyDrop.amount + amount > MAX_U256) {
    throw new Error('The resulting prize amount is too large.');
  }
  const token = normalizeContractAddress(supplyDrop.token);
  const [low, high] = encodeU256(amount);
  return [
    supplyDrop.prizeKind === 1
      ? {
          contractAddress: token,
          entrypoint: 'approve',
          calldata: [supplyDropSystemAddress, low, high],
        }
      : {
          contractAddress: token,
          entrypoint: 'set_approval_for_all',
          calldata: [supplyDropSystemAddress, '1'],
        },
    {
      contractAddress: supplyDropSystemAddress,
      entrypoint: 'top_up_supply_drop',
      calldata: [supplyDrop.id.toString(), low, high],
    },
  ];
}

export function buildClaimSupplyDropCall({
  supplyDropSystemAddress,
  supplyDropId,
  recipient,
}: {
  supplyDropSystemAddress: string;
  supplyDropId: bigint;
  recipient: string;
}): Call {
  if (!supplyDropSystemAddress) {
    throw new Error('The Supply Drop System is not configured.');
  }
  if (supplyDropId <= 0n || supplyDropId > MAX_U64) {
    throw new Error('SupplyDrop ID is invalid.');
  }
  return {
    contractAddress: supplyDropSystemAddress,
    entrypoint: 'claim_prize',
    calldata: [supplyDropId.toString(), normalizeContractAddress(recipient)],
  };
}

function encodeU256(value: bigint): [string, string] {
  if (value < 0n || value > MAX_U256) {
    throw new RangeError('Value does not fit in a u256.');
  }
  return [(value % U128_MODULUS).toString(), (value / U128_MODULUS).toString()];
}

export function normalizeContractAddress(value: string): string {
  let parsed: string;
  try {
    parsed = validateAndParseAddress(value.trim());
  } catch {
    throw new Error('Enter a valid Starknet token contract address.');
  }
  if (BigInt(parsed) === 0n) {
    throw new Error('Token contract address cannot be zero.');
  }
  return parsed;
}

export function parseTokenUnits(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error('Token decimals must be between 0 and 255.');
  }

  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d*))?$/.exec(normalized);
  if (!match) {
    throw new Error('Enter a valid token amount.');
  }

  const fraction = match[2] ?? '';
  if (fraction.length > decimals) {
    throw new Error(`Token amount supports at most ${decimals} decimals.`);
  }

  const units =
    BigInt(match[1]) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, '0') || '0');
  if (units <= 0n) {
    throw new Error('Prize amount must be greater than zero.');
  }
  if (units > MAX_U256) {
    throw new Error('Prize amount is too large.');
  }
  return units;
}

export function parseTokenId(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error('Token ID must be a non-negative integer.');
  }
  const tokenId = BigInt(normalized);
  if (tokenId > MAX_U256) {
    throw new Error('Token ID is too large.');
  }
  return tokenId;
}

export function parseDurationSeconds(
  value: string,
  unit: SupplyDropDurationUnit
): bigint {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error('Duration must be a whole number.');
  }
  const duration = BigInt(normalized) * DURATION_MULTIPLIERS[unit];
  if (duration <= 0n) {
    throw new Error('Duration must be greater than zero.');
  }
  if (duration > MAX_U64) {
    throw new Error('Duration is too large.');
  }
  return duration;
}

export function buildCreateSupplyDropCalls({
  supplyDropSystemAddress,
  prizeKind,
  tokenAddress,
  tokenId,
  amount,
  durationSeconds,
}: {
  supplyDropSystemAddress: string;
  prizeKind: SupplyDropPrizeKind;
  tokenAddress: string;
  tokenId: bigint;
  amount: bigint;
  durationSeconds: bigint;
}): Call[] {
  if (!supplyDropSystemAddress) {
    throw new Error('The Supply Drop System is not configured.');
  }
  const normalizedToken = normalizeContractAddress(tokenAddress);
  if (durationSeconds <= 0n || durationSeconds > MAX_U64) {
    throw new Error('SupplyDrop duration is invalid.');
  }
  if (tokenId < 0n || tokenId > MAX_U256) {
    throw new Error('Token ID is invalid.');
  }
  if (amount <= 0n || amount > MAX_U256) {
    throw new Error('Prize amount is invalid.');
  }
  if (prizeKind === 'erc721' && amount !== 1n) {
    throw new Error('ERC-721 supplyDrops must escrow exactly one token.');
  }

  const [tokenIdLow, tokenIdHigh] = encodeU256(tokenId);
  const [amountLow, amountHigh] = encodeU256(amount);
  const approval: Call =
    prizeKind === 'erc20'
      ? {
          contractAddress: normalizedToken,
          entrypoint: 'approve',
          calldata: [supplyDropSystemAddress, amountLow, amountHigh],
        }
      : prizeKind === 'erc721'
        ? {
            contractAddress: normalizedToken,
            entrypoint: 'approve',
            calldata: [supplyDropSystemAddress, tokenIdLow, tokenIdHigh],
          }
        : {
            contractAddress: normalizedToken,
            entrypoint: 'set_approval_for_all',
            calldata: [supplyDropSystemAddress, '1'],
          };

  return [
    approval,
    {
      contractAddress: supplyDropSystemAddress,
      entrypoint: 'create_supply_drop',
      calldata: [
        durationSeconds.toString(),
        PRIZE_KIND_CODES[prizeKind].toString(),
        normalizedToken,
        tokenIdLow,
        tokenIdHigh,
        amountLow,
        amountHigh,
      ],
    },
  ];
}
