import { config } from './config';
import type { IndexedControlPoint } from '../types';
import { isControlPointId } from '../utils/controlPointGeometry';

const CONTROL_POINTS_QUERY = `
  query StakeWarsControlPoints {
    stakewarsControlPointModels(first: 2000) {
      edges {
        node {
          id
          controller
          allocated_stake
          ownership_generation
        }
      }
    }
  }
`;

interface ToriiControlPointNode {
  id: number | string;
  controller: string;
  allocated_stake: string;
  ownership_generation: string;
}

interface ToriiControlPointResponse {
  data?: {
    stakewarsControlPointModels?: {
      edges?: Array<{ node?: ToriiControlPointNode }>;
    };
  };
  errors?: Array<{ message?: string }>;
}

function parseBigInt(value: string, field: string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`Torii returned an invalid ${field}`);
  }
}

export function parseIndexedControlPoints(
  payload: ToriiControlPointResponse
): IndexedControlPoint[] {
  if (payload.errors?.length) {
    throw new Error(
      payload.errors[0]?.message || 'Torii rejected the Control Point query'
    );
  }

  const edges = payload.data?.stakewarsControlPointModels?.edges;
  if (!edges) {
    throw new Error('Torii omitted the Control Point collection');
  }

  const controlPoints = new Map<number, IndexedControlPoint>();
  edges.forEach(({ node }) => {
    if (!node) return;

    const id = Number(node.id);
    if (!isControlPointId(id)) {
      throw new Error(`Torii returned an invalid Control Point ID: ${node.id}`);
    }
    parseBigInt(node.controller, 'controller address');

    controlPoints.set(id, {
      id,
      controller: node.controller,
      allocatedStake: parseBigInt(node.allocated_stake, 'allocated stake'),
      ownershipGeneration: parseBigInt(
        node.ownership_generation,
        'ownership generation'
      ),
    });
  });

  return [...controlPoints.values()].sort((left, right) => left.id - right.id);
}

export async function getIndexedControlPoints(
  signal?: AbortSignal
): Promise<IndexedControlPoint[]> {
  const response = await fetch(config.toriiGraphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: CONTROL_POINTS_QUERY }),
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Torii returned HTTP ${response.status}`);
  }

  return parseIndexedControlPoints(
    (await response.json()) as ToriiControlPointResponse
  );
}
