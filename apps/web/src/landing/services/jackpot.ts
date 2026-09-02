import { formatStrkAmount } from './stats';

const apiDomain = import.meta.env.VITE_API_DOMAIN || 'https://api.stakewars.gg';
const toriiGraphqlUrl =
  import.meta.env.VITE_TORII_GRAPHQL_URL || `${apiDomain}/torii/graphql`;
const configuredStrkTokenAddress =
  import.meta.env.VITE_STRK_TOKEN_ADDRESS || '';

const CURRENT_JACKPOT_QUERY = `
  query LandingJackpot {
    stakewarsJackpotModels(first: 1000) {
      edges {
        node {
          id
          status
          prize_kind
          token
          token_id
          amount
          ends_at
          draw_count
        }
      }
    }
  }
`;

interface JackpotNode {
  id: number | string;
  status: number | string;
  prize_kind: number | string;
  token: string;
  token_id: number | string;
  amount: number | string;
  ends_at: number | string;
  draw_count: number | string;
}

interface JackpotResponse {
  data?: {
    stakewarsJackpotModels?: {
      edges?: Array<{ node?: JackpotNode }>;
    };
  };
  errors?: Array<{ message?: string }>;
}

export interface LandingJackpot {
  id: bigint;
  status: 2 | 3;
  prizeKind: 1 | 2 | 3;
  token: string;
  tokenId: bigint;
  amount: bigint;
  endsAt: number;
  drawCount: number;
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

function parseNode(node: JackpotNode): LandingJackpot | null {
  const status = parseSafeNumber(node.status, 'Jackpot status');
  if (status !== 2 && status !== 3) return null;

  const prizeKind = parseSafeNumber(node.prize_kind, 'Jackpot prize kind');
  if (prizeKind !== 1 && prizeKind !== 2 && prizeKind !== 3) {
    throw new Error('Torii returned an unsupported Jackpot prize kind');
  }

  if (typeof node.token !== 'string') {
    throw new Error('Torii returned an invalid Jackpot token');
  }

  return {
    id: parseBigInt(node.id, 'Jackpot ID'),
    status,
    prizeKind,
    token: node.token,
    tokenId: parseBigInt(node.token_id, 'Jackpot token ID'),
    amount: parseBigInt(node.amount, 'Jackpot amount'),
    endsAt: parseSafeNumber(node.ends_at, 'Jackpot expiry'),
    drawCount: parseSafeNumber(node.draw_count, 'Jackpot draw count'),
  };
}

export function parseCurrentLandingJackpot(
  payload: JackpotResponse
): LandingJackpot | null {
  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || 'Torii rejected the query');
  }

  const edges = payload.data?.stakewarsJackpotModels?.edges;
  if (!edges) throw new Error('Torii omitted the Jackpot collection');

  return (
    edges
      .flatMap(({ node }) => (node ? [parseNode(node)] : []))
      .filter((jackpot): jackpot is LandingJackpot => jackpot !== null)
      .sort((left, right) => (left.id < right.id ? 1 : -1))[0] ?? null
  );
}

export async function getCurrentLandingJackpot(
  signal?: AbortSignal
): Promise<LandingJackpot | null> {
  const response = await fetch(toriiGraphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: CURRENT_JACKPOT_QUERY }),
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    throw new Error(`Jackpot request failed with HTTP ${response.status}`);
  }
  return parseCurrentLandingJackpot((await response.json()) as JackpotResponse);
}

function addressesMatch(left: string, right: string): boolean {
  if (!left || !right) return false;
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
}

export function formatLandingJackpotPrize(
  jackpot: LandingJackpot,
  strkTokenAddress = configuredStrkTokenAddress
): { value: string; unit: string } {
  if (jackpot.prizeKind === 1) {
    return addressesMatch(jackpot.token, strkTokenAddress)
      ? { value: formatStrkAmount(jackpot.amount.toString()), unit: 'STRK' }
      : { value: jackpot.amount.toLocaleString('en-US'), unit: 'TOKEN UNITS' };
  }
  if (jackpot.prizeKind === 2) {
    return { value: `#${jackpot.tokenId.toString()}`, unit: 'ERC-721' };
  }
  return {
    value: `${jackpot.amount.toLocaleString('en-US')} × #${jackpot.tokenId.toString()}`,
    unit: 'ERC-1155',
  };
}
