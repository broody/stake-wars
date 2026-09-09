import { formatStrkAmount } from './stats';

const apiDomain = import.meta.env.VITE_API_DOMAIN || 'https://api.stakewars.gg';
const toriiGraphqlUrl =
  import.meta.env.VITE_TORII_GRAPHQL_URL || `${apiDomain}/torii/graphql`;
const configuredStrkTokenAddress =
  import.meta.env.VITE_STRK_TOKEN_ADDRESS || '';

const CURRENT_SUPPLY_DROP_QUERY = `
  query LandingSupplyDrop {
    stakewarsSupplyDropModels(first: 1000) {
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

interface SupplyDropNode {
  id: number | string;
  status: number | string;
  prize_kind: number | string;
  token: string;
  token_id: number | string;
  amount: number | string;
  ends_at: number | string;
  draw_count: number | string;
}

interface SupplyDropResponse {
  data?: {
    stakewarsSupplyDropModels?: {
      edges?: Array<{ node?: SupplyDropNode }>;
    };
  };
  errors?: Array<{ message?: string }>;
}

export interface LandingSupplyDrop {
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

function parseNode(node: SupplyDropNode): LandingSupplyDrop | null {
  const status = parseSafeNumber(node.status, 'SupplyDrop status');
  if (status !== 2 && status !== 3) return null;

  const prizeKind = parseSafeNumber(node.prize_kind, 'SupplyDrop prize kind');
  if (prizeKind !== 1 && prizeKind !== 2 && prizeKind !== 3) {
    throw new Error('Torii returned an unsupported SupplyDrop prize kind');
  }

  if (typeof node.token !== 'string') {
    throw new Error('Torii returned an invalid SupplyDrop token');
  }

  return {
    id: parseBigInt(node.id, 'SupplyDrop ID'),
    status,
    prizeKind,
    token: node.token,
    tokenId: parseBigInt(node.token_id, 'SupplyDrop token ID'),
    amount: parseBigInt(node.amount, 'SupplyDrop amount'),
    endsAt: parseSafeNumber(node.ends_at, 'SupplyDrop expiry'),
    drawCount: parseSafeNumber(node.draw_count, 'SupplyDrop draw count'),
  };
}

export function parseCurrentLandingSupplyDrop(
  payload: SupplyDropResponse
): LandingSupplyDrop | null {
  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || 'Torii rejected the query');
  }

  const edges = payload.data?.stakewarsSupplyDropModels?.edges;
  if (!edges) throw new Error('Torii omitted the SupplyDrop collection');

  return (
    edges
      .flatMap(({ node }) => (node ? [parseNode(node)] : []))
      .filter(
        (supplyDrop): supplyDrop is LandingSupplyDrop => supplyDrop !== null
      )
      .sort((left, right) => (left.id < right.id ? 1 : -1))[0] ?? null
  );
}

export async function getCurrentLandingSupplyDrop(
  signal?: AbortSignal
): Promise<LandingSupplyDrop | null> {
  const response = await fetch(toriiGraphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: CURRENT_SUPPLY_DROP_QUERY }),
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    throw new Error(`SupplyDrop request failed with HTTP ${response.status}`);
  }
  return parseCurrentLandingSupplyDrop(
    (await response.json()) as SupplyDropResponse
  );
}

function addressesMatch(left: string, right: string): boolean {
  if (!left || !right) return false;
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
}

export function formatLandingSupplyDropPrize(
  supplyDrop: LandingSupplyDrop,
  strkTokenAddress = configuredStrkTokenAddress
): { value: string; unit: string } {
  if (supplyDrop.prizeKind === 1) {
    return addressesMatch(supplyDrop.token, strkTokenAddress)
      ? { value: formatStrkAmount(supplyDrop.amount.toString()), unit: 'STRK' }
      : {
          value: supplyDrop.amount.toLocaleString('en-US'),
          unit: 'TOKEN UNITS',
        };
  }
  if (supplyDrop.prizeKind === 2) {
    return { value: `#${supplyDrop.tokenId.toString()}`, unit: 'ERC-721' };
  }
  return {
    value: `${supplyDrop.amount.toLocaleString('en-US')} × #${supplyDrop.tokenId.toString()}`,
    unit: 'ERC-1155',
  };
}
