import { validateAndParseAddress, type Call } from 'starknet';
import { config } from './config';
import type {
  Jackpot,
  JackpotPrizeKind as IndexedJackpotPrizeKind,
  JackpotStatus,
} from '../types';

export type JackpotPrizeKind = 'erc20' | 'erc721' | 'erc1155';
export type JackpotDurationUnit = 'minutes' | 'hours' | 'days';

const MAX_U64 = (1n << 64n) - 1n;
const MAX_U256 = (1n << 256n) - 1n;
const U128_MODULUS = 1n << 128n;

const PRIZE_KIND_CODES: Record<JackpotPrizeKind, number> = {
  erc20: 1,
  erc721: 2,
  erc1155: 3,
};

const DURATION_MULTIPLIERS: Record<JackpotDurationUnit, bigint> = {
  minutes: 60n,
  hours: 3_600n,
  days: 86_400n,
};

const JACKPOTS_QUERY = `
  query StakeWarsJackpots {
    stakewarsJackpotModels(first: 1000) {
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

interface JackpotNode {
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

interface JackpotResponse {
  data?: {
    stakewarsJackpotModels?: {
      edges?: Array<{ node?: JackpotNode }>;
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

function parsePrizeKind(value: number | string): IndexedJackpotPrizeKind {
  const parsed = parseSafeNumber(value, 'jackpot prize kind');
  if (parsed !== 1 && parsed !== 2 && parsed !== 3) {
    throw new Error('Torii returned an unsupported jackpot prize kind');
  }
  return parsed;
}

function parseStatus(value: number | string): JackpotStatus {
  const parsed = parseSafeNumber(value, 'jackpot status');
  if (parsed !== 1 && parsed !== 2 && parsed !== 3 && parsed !== 4) {
    throw new Error('Torii returned an unsupported jackpot status');
  }
  return parsed;
}

function optionalTimestamp(value: string, field: string): number | null {
  const parsed = parseSafeNumber(value, field);
  return parsed === 0 ? null : parsed;
}

export function parseJackpots(payload: JackpotResponse): Jackpot[] {
  if (payload.errors?.length) {
    throw new Error(
      payload.errors[0]?.message || 'Torii rejected the jackpot query'
    );
  }
  const rows = payload.data?.stakewarsJackpotModels?.edges;
  if (!rows) {
    throw new Error('Torii omitted the jackpot collection');
  }

  return rows
    .flatMap(({ node }): Jackpot[] => {
      if (!node) return [];
      return [
        {
          id: parseBigInt(node.id, 'jackpot ID'),
          status: parseStatus(node.status),
          sponsor: node.sponsor,
          prizeKind: parsePrizeKind(node.prize_kind),
          token: node.token,
          tokenId: parseBigInt(node.token_id, 'jackpot token ID'),
          amount: parseBigInt(node.amount, 'jackpot amount'),
          sectorLimitSnapshot: parseSafeNumber(
            node.sector_limit_snapshot,
            'jackpot Sector limit'
          ),
          durationSeconds: parseSafeNumber(
            node.duration_seconds,
            'jackpot duration'
          ),
          startedAt: parseSafeNumber(node.started_at, 'jackpot start time'),
          endsAt: parseSafeNumber(node.ends_at, 'jackpot end time'),
          randomnessBlock: parseBigInt(
            node.randomness_block,
            'jackpot randomness block'
          ),
          lastDrawnSectorId: parseSafeNumber(
            node.last_drawn_sector_id,
            'drawn Sector ID'
          ),
          drawCount: parseSafeNumber(node.draw_count, 'jackpot draw count'),
          winner: node.winner,
          settledAt: optionalTimestamp(
            node.settled_at,
            'jackpot settlement time'
          ),
          claimed: node.claimed,
          claimedBy: node.claimed_by,
          claimedAt: optionalTimestamp(node.claimed_at, 'jackpot claim time'),
        },
      ];
    })
    .sort((left, right) => (left.id < right.id ? 1 : -1));
}

export async function getJackpots(signal?: AbortSignal): Promise<Jackpot[]> {
  const response = await fetch(config.toriiGraphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: JACKPOTS_QUERY, variables: {} }),
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    throw new Error(`Torii returned HTTP ${response.status}`);
  }
  return parseJackpots((await response.json()) as JackpotResponse);
}

export function latestJackpotDraw(
  jackpots: readonly Jackpot[]
): Jackpot | null {
  return jackpots.reduce<Jackpot | null>((latest, jackpot) => {
    if (jackpot.drawCount === 0) return latest;
    if (!latest || jackpot.id > latest.id) return jackpot;
    return latest;
  }, null);
}

export function isJackpotDrawPending(
  jackpot: Pick<Jackpot, 'endsAt' | 'status'>,
  now = Date.now()
): boolean {
  return (
    jackpot.status === 3 ||
    (jackpot.status === 2 && jackpot.endsAt * 1_000 <= now)
  );
}

export function buildClaimJackpotCall({
  jackpotSystemAddress,
  jackpotId,
  recipient,
}: {
  jackpotSystemAddress: string;
  jackpotId: bigint;
  recipient: string;
}): Call {
  if (!jackpotSystemAddress) {
    throw new Error('The Jackpot System is not configured.');
  }
  if (jackpotId <= 0n || jackpotId > MAX_U64) {
    throw new Error('Jackpot ID is invalid.');
  }
  return {
    contractAddress: jackpotSystemAddress,
    entrypoint: 'claim_prize',
    calldata: [jackpotId.toString(), normalizeContractAddress(recipient)],
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
  unit: JackpotDurationUnit
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

export function buildCreateJackpotCalls({
  jackpotSystemAddress,
  prizeKind,
  tokenAddress,
  tokenId,
  amount,
  durationSeconds,
}: {
  jackpotSystemAddress: string;
  prizeKind: JackpotPrizeKind;
  tokenAddress: string;
  tokenId: bigint;
  amount: bigint;
  durationSeconds: bigint;
}): Call[] {
  if (!jackpotSystemAddress) {
    throw new Error('The Jackpot System is not configured.');
  }
  const normalizedToken = normalizeContractAddress(tokenAddress);
  if (durationSeconds <= 0n || durationSeconds > MAX_U64) {
    throw new Error('Jackpot duration is invalid.');
  }
  if (tokenId < 0n || tokenId > MAX_U256) {
    throw new Error('Token ID is invalid.');
  }
  if (amount <= 0n || amount > MAX_U256) {
    throw new Error('Prize amount is invalid.');
  }
  if (prizeKind === 'erc721' && amount !== 1n) {
    throw new Error('ERC-721 jackpots must escrow exactly one token.');
  }

  const [tokenIdLow, tokenIdHigh] = encodeU256(tokenId);
  const [amountLow, amountHigh] = encodeU256(amount);
  const approval: Call =
    prizeKind === 'erc20'
      ? {
          contractAddress: normalizedToken,
          entrypoint: 'approve',
          calldata: [jackpotSystemAddress, amountLow, amountHigh],
        }
      : prizeKind === 'erc721'
        ? {
            contractAddress: normalizedToken,
            entrypoint: 'approve',
            calldata: [jackpotSystemAddress, tokenIdLow, tokenIdHigh],
          }
        : {
            contractAddress: normalizedToken,
            entrypoint: 'set_approval_for_all',
            calldata: [jackpotSystemAddress, '1'],
          };

  return [
    approval,
    {
      contractAddress: jackpotSystemAddress,
      entrypoint: 'create_jackpot',
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
