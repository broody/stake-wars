import { config } from './config';
import type {
  IndexedControlPoint,
  OperatorActivity,
  YieldClaim,
} from '../types';
import { isControlPointId } from '../utils/controlPointGeometry';
import { addressesMatch, isZeroAddress } from '../utils/format';
import { getBlockTimestamps } from './starknet';

const CONTROL_POINTS_QUERY = `
  query StakeWarsControlPoints {
    stakewarsControlPointModels(first: 2000) {
      edges {
        node {
          id
          controller
          allocated_stake
          ownership_generation
          controlled_since
        }
      }
    }
  }
`;

const LEGACY_CONTROL_POINTS_QUERY = CONTROL_POINTS_QUERY.replace(
  '          controlled_since\n',
  ''
);

const LEGACY_CAPTURE_PAGE_QUERY = `
  query StakeWarsLegacyCapturePage(
    $controlPointIds: [u32]
    $after: Cursor
  ) {
    stakewarsControlPointCapturedModels(
      first: 1000
      after: $after
      where: { control_point_idIN: $controlPointIds }
    ) {
      edges {
        cursor
        node {
          control_point_id
          controller
          ownership_generation
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const OPERATOR_ACTIVITY_QUERY = `
  query StakeWarsOperatorActivity($operator: ContractAddress!) {
    captures: stakewarsControlPointCapturedModels(
      first: 1000
      where: { controller: $operator }
    ) {
      edges {
        cursor
        node {
          control_point_id
          controller
          previous_controller
          previous_allocation
          allocation
          ownership_generation
        }
      }
    }
    losses: stakewarsControlPointCapturedModels(
      first: 1000
      where: { previous_controller: $operator }
    ) {
      edges {
        cursor
        node {
          control_point_id
          controller
          previous_controller
          previous_allocation
          allocation
          ownership_generation
        }
      }
    }
    reinforcements: stakewarsControlPointReinforcedModels(
      first: 1000
      where: { controller: $operator }
    ) {
      edges {
        cursor
        node {
          control_point_id
          controller
          previous_allocation
          allocation
          ownership_generation
        }
      }
    }
    releases: stakewarsControlPointReleasedModels(
      first: 1000
      where: { previous_controller: $operator }
    ) {
      edges {
        cursor
        node {
          control_point_id
          previous_controller
          released_allocation
          ownership_generation
        }
      }
    }
    redeployments: stakewarsControlPointRedeployedModels(
      first: 1000
      where: { operator: $operator }
    ) {
      edges {
        cursor
        node {
          operator
          from_control_point_id
          to_control_point_id
          released_allocation
          new_allocation
        }
      }
    }
    disqualifications: stakewarsOperatorDisqualifiedModels(
      first: 1000
      where: { operator: $operator }
    ) {
      edges {
        cursor
        node {
          operator
          previous_generation
          new_generation
          previous_allocation
          live_delegated_amount
          invalidated_point_count
        }
      }
    }
  }
`;

const OPERATOR_DISPLACEMENTS_QUERY = `
  query StakeWarsOperatorDisplacements($operator: ContractAddress!) {
    displacements: stakewarsControlPointDisplacedModels(
      first: 1000
      where: { previous_controller: $operator }
    ) {
      edges {
        cursor
        node {
          control_point_id
          previous_controller
          new_controller
          released_allocation
          new_allocation
          ownership_generation
        }
      }
    }
  }
`;

export const POOL_MEMBER_REWARD_CLAIMED_SELECTOR =
  '0x00c4a5eb3afec3e38cbe8f43f66c46bb0ca74ae6f10bfbd7c7f0f461d5cdb9f4';
export const NEW_POOL_MEMBER_SELECTOR =
  '0x015cacaf40e1ed87da5ca636ad8371422b9763884d3ea9fb51a80deeb3efee17';

const POOL_EVENTS_QUERY = `
  query StakeWarsPoolEvents($keys: [String], $after: Cursor) {
    events(first: 100, after: $after, keys: $keys) {
      edges {
        cursor
        node {
          id
          keys
          data
          transactionHash
          executedAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

interface ToriiControlPointNode {
  id: number | string;
  controller: string;
  allocated_stake: string;
  ownership_generation: string;
  controlled_since?: string | null;
}

interface ToriiControlPointResponse {
  data?: {
    stakewarsControlPointModels?: {
      edges?: Array<{ node?: ToriiControlPointNode }>;
    };
  };
  errors?: Array<{ message?: string }>;
}

interface ToriiEdge<T> {
  cursor: string;
  node?: T;
}

interface ToriiConnection<T> {
  edges?: Array<ToriiEdge<T>>;
}

interface CaptureEventNode {
  control_point_id: number | string;
  controller: string;
  previous_controller: string;
  previous_allocation: string;
  allocation: string;
  ownership_generation?: string;
}

interface LegacyCaptureEventNode {
  control_point_id: number | string;
  controller: string;
  ownership_generation: string;
}

interface LegacyCapturePageResponse {
  data?: {
    stakewarsControlPointCapturedModels?: {
      edges?: Array<ToriiEdge<LegacyCaptureEventNode>>;
      pageInfo?: {
        hasNextPage?: boolean;
        endCursor?: string | null;
      };
    };
  };
  errors?: Array<{ message?: string }>;
}

interface ReinforcementEventNode {
  control_point_id: number | string;
  previous_allocation: string;
  allocation: string;
}

interface ReleaseEventNode {
  control_point_id: number | string;
  released_allocation: string;
}

interface RedeploymentEventNode {
  from_control_point_id: number | string;
  to_control_point_id: number | string;
  released_allocation: string;
  new_allocation: string;
}

interface DisqualificationEventNode {
  previous_allocation: string;
  live_delegated_amount: string;
  invalidated_point_count: number | string;
}

interface DisplacementEventNode {
  control_point_id: number | string;
  previous_controller: string;
  new_controller: string;
  released_allocation: string;
  new_allocation: string;
}

interface ToriiOperatorActivityResponse {
  data?: {
    captures?: ToriiConnection<CaptureEventNode>;
    losses?: ToriiConnection<CaptureEventNode>;
    reinforcements?: ToriiConnection<ReinforcementEventNode>;
    releases?: ToriiConnection<ReleaseEventNode>;
    redeployments?: ToriiConnection<RedeploymentEventNode>;
    disqualifications?: ToriiConnection<DisqualificationEventNode>;
  };
  errors?: Array<{ message?: string }>;
}

interface ToriiDisplacementsResponse {
  data?: {
    displacements?: ToriiConnection<DisplacementEventNode>;
  };
  errors?: Array<{ message?: string }>;
}

interface RawEventNode {
  id: string;
  keys: string[];
  data: string[];
  transactionHash: string;
  executedAt: string;
}

interface ToriiRawEventsResponse {
  data?: {
    events?: {
      edges?: Array<ToriiEdge<RawEventNode>>;
      pageInfo?: {
        hasNextPage?: boolean;
        endCursor?: string | null;
      };
    };
  };
  errors?: Array<{ message?: string }>;
}

interface EventPosition {
  id: string;
  blockNumber: number;
  eventIndex: number;
  transactionHash: string;
}

function parseBigInt(value: string, field: string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`Torii returned an invalid ${field}`);
  }
}

function parseUnixTimestamp(
  value: string | null | undefined,
  field: string
): number | null {
  if (value === null || value === undefined) return null;
  const timestamp = parseBigInt(value, field);
  const parsed = Number(timestamp);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Torii returned an invalid ${field}`);
  }
  return parsed || null;
}

function parseControlPointId(value: number | string): number {
  const id = Number(value);
  if (!isControlPointId(id)) {
    throw new Error(`Torii returned an invalid Control Point ID: ${value}`);
  }
  return id;
}

function parseEventPosition(cursor: string): EventPosition {
  let decoded: string;
  try {
    decoded = atob(cursor);
  } catch {
    throw new Error('Torii returned an invalid activity cursor');
  }

  const eventId = decoded.split('/')[1];
  const parts = eventId?.split(':');
  if (!eventId || parts.length < 4) {
    throw new Error('Torii returned an invalid activity cursor');
  }

  const blockNumber = Number(BigInt(parts[0]));
  const eventIndex = Number(BigInt(parts[parts.length - 1]));
  if (!Number.isSafeInteger(blockNumber) || !Number.isSafeInteger(eventIndex)) {
    throw new Error('Torii returned an invalid activity position');
  }

  return {
    id: eventId,
    blockNumber,
    eventIndex,
    transactionHash: parts[1],
  };
}

function parseRawEventPosition(id: string): EventPosition & {
  contractAddress: string;
} {
  const parts = id.split(':');
  if (parts.length !== 4) {
    throw new Error('Torii returned an invalid raw event ID');
  }

  const blockNumber = Number(BigInt(parts[0]));
  const eventIndex = Number(BigInt(parts[3]));
  if (!Number.isSafeInteger(blockNumber) || !Number.isSafeInteger(eventIndex)) {
    throw new Error('Torii returned an invalid raw event position');
  }

  return {
    id,
    blockNumber,
    eventIndex,
    transactionHash: parts[1],
    contractAddress: parts[2],
  };
}

function edges<T>(connection: ToriiConnection<T> | undefined): ToriiEdge<T>[] {
  if (!connection?.edges) {
    throw new Error('Torii omitted an activity collection');
  }
  return connection.edges;
}

function activityFromEdge<T>(
  edge: ToriiEdge<T>,
  build: (position: EventPosition, node: T) => OperatorActivity
): OperatorActivity | null {
  if (!edge.node) return null;
  return build(parseEventPosition(edge.cursor), edge.node);
}

export function parseOperatorActivity(
  payload: ToriiOperatorActivityResponse,
  displacementPayload?: ToriiDisplacementsResponse | null
): OperatorActivity[] {
  if (payload.errors?.length) {
    throw new Error(
      payload.errors[0]?.message || 'Torii rejected the Operator activity query'
    );
  }
  if (!payload.data) {
    throw new Error('Torii omitted the Operator activity response');
  }

  const activity: OperatorActivity[] = [];
  const append = (item: OperatorActivity | null) => {
    if (item) activity.push(item);
  };

  edges(payload.data.captures).forEach((edge) => {
    append(
      activityFromEdge(edge, (position, node) => ({
        ...position,
        type: 'capture',
        controlPointId: parseControlPointId(node.control_point_id),
        amount: parseBigInt(node.allocation, 'capture allocation'),
        counterparty: isZeroAddress(node.previous_controller)
          ? undefined
          : node.previous_controller,
      }))
    );
  });

  edges(payload.data.losses).forEach((edge) => {
    append(
      activityFromEdge(edge, (position, node) => ({
        ...position,
        type: 'loss',
        controlPointId: parseControlPointId(node.control_point_id),
        amount: parseBigInt(node.previous_allocation, 'released allocation'),
        secondaryAmount: parseBigInt(node.allocation, 'challenger allocation'),
        counterparty: node.controller,
      }))
    );
  });

  edges(payload.data.reinforcements).forEach((edge) => {
    append(
      activityFromEdge(edge, (position, node) => {
        const previous = parseBigInt(
          node.previous_allocation,
          'previous allocation'
        );
        const allocation = parseBigInt(node.allocation, 'allocation');
        return {
          ...position,
          type: 'reinforcement',
          controlPointId: parseControlPointId(node.control_point_id),
          amount: allocation - previous,
          secondaryAmount: allocation,
        };
      })
    );
  });

  edges(payload.data.releases).forEach((edge) => {
    append(
      activityFromEdge(edge, (position, node) => ({
        ...position,
        type: 'release',
        controlPointId: parseControlPointId(node.control_point_id),
        amount: parseBigInt(node.released_allocation, 'released allocation'),
      }))
    );
  });

  edges(payload.data.redeployments).forEach((edge) => {
    append(
      activityFromEdge(edge, (position, node) => ({
        ...position,
        type: 'redeployment',
        controlPointId: parseControlPointId(node.from_control_point_id),
        destinationControlPointId: parseControlPointId(
          node.to_control_point_id
        ),
        amount: parseBigInt(node.new_allocation, 'new allocation'),
        secondaryAmount: parseBigInt(
          node.released_allocation,
          'released allocation'
        ),
      }))
    );
  });

  edges(payload.data.disqualifications).forEach((edge) => {
    append(
      activityFromEdge(edge, (position, node) => ({
        ...position,
        type: 'disqualification',
        amount: parseBigInt(node.previous_allocation, 'previous allocation'),
        secondaryAmount: parseBigInt(
          node.live_delegated_amount,
          'live delegated amount'
        ),
        affectedPointCount: Number(node.invalidated_point_count),
      }))
    );
  });

  if (displacementPayload?.data?.displacements?.edges) {
    displacementPayload.data.displacements.edges.forEach((edge) => {
      const displaced = activityFromEdge(edge, (position, node) => ({
        ...position,
        type: 'loss',
        controlPointId: parseControlPointId(node.control_point_id),
        amount: parseBigInt(node.released_allocation, 'released allocation'),
        secondaryAmount: parseBigInt(node.new_allocation, 'new allocation'),
        counterparty: node.new_controller,
      }));
      if (!displaced) return;

      const legacyIndex = activity.findIndex(
        (item) =>
          item.type === 'loss' &&
          item.transactionHash === displaced.transactionHash &&
          item.controlPointId === displaced.controlPointId
      );
      if (legacyIndex >= 0) activity.splice(legacyIndex, 1);
      activity.push(displaced);
    });
  }

  return activity.sort(
    (left, right) =>
      right.blockNumber - left.blockNumber || right.eventIndex - left.eventIndex
  );
}

async function queryTorii<T>(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(config.toriiGraphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Torii returned HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

export function parseYieldClaimPage(
  payload: ToriiRawEventsResponse,
  poolAddress: string,
  operator: string
): { claims: YieldClaim[]; hasNextPage: boolean; endCursor: string | null } {
  if (payload.errors?.length) {
    throw new Error(
      payload.errors[0]?.message || 'Torii rejected the yield history query'
    );
  }

  const connection = payload.data?.events;
  if (!connection?.edges || !connection.pageInfo) {
    throw new Error('Torii omitted the yield history collection');
  }

  const claims = connection.edges.flatMap((edge): YieldClaim[] => {
    if (!edge.node) return [];
    const node = edge.node;
    const position = parseRawEventPosition(node.id);

    if (!addressesMatch(position.contractAddress, poolAddress)) {
      throw new Error('Torii returned a yield event from an unexpected pool');
    }
    if (
      node.keys.length < 3 ||
      node.data.length < 1 ||
      !addressesMatch(node.keys[0], POOL_MEMBER_REWARD_CLAIMED_SELECTOR) ||
      !addressesMatch(node.keys[1], operator)
    ) {
      throw new Error('Torii returned a malformed yield claim event');
    }

    return [
      {
        id: position.id,
        blockNumber: position.blockNumber,
        eventIndex: position.eventIndex,
        transactionHash: node.transactionHash || position.transactionHash,
        poolMember: node.keys[1],
        rewardAddress: node.keys[2],
        amount: parseBigInt(node.data[0], 'claimed reward amount'),
        executedAt: node.executedAt,
      },
    ];
  });

  return {
    claims,
    hasNextPage: Boolean(connection.pageInfo.hasNextPage),
    endCursor: connection.pageInfo.endCursor ?? null,
  };
}

export function parsePoolMemberStartPage(
  payload: ToriiRawEventsResponse,
  poolAddress: string,
  operator: string
): {
  starts: Array<
    Pick<EventPosition, 'blockNumber' | 'eventIndex'> & {
      executedAt: string;
    }
  >;
  hasNextPage: boolean;
  endCursor: string | null;
} {
  if (payload.errors?.length) {
    throw new Error(
      payload.errors[0]?.message || 'Torii rejected the pool history query'
    );
  }

  const connection = payload.data?.events;
  if (!connection?.edges || !connection.pageInfo) {
    throw new Error('Torii omitted the pool history collection');
  }

  const starts = connection.edges.flatMap((edge) => {
    if (!edge.node) return [];
    const node = edge.node;
    const position = parseRawEventPosition(node.id);

    if (!addressesMatch(position.contractAddress, poolAddress)) {
      throw new Error('Torii returned a pool entry from an unexpected pool');
    }
    if (
      node.keys.length < 3 ||
      node.data.length < 2 ||
      !addressesMatch(node.keys[0], NEW_POOL_MEMBER_SELECTOR) ||
      !addressesMatch(node.keys[1], operator)
    ) {
      throw new Error('Torii returned a malformed pool entry event');
    }

    return [
      {
        blockNumber: position.blockNumber,
        eventIndex: position.eventIndex,
        executedAt: node.executedAt,
      },
    ];
  });

  return {
    starts,
    hasNextPage: Boolean(connection.pageInfo.hasNextPage),
    endCursor: connection.pageInfo.endCursor ?? null,
  };
}

export async function getPoolMemberStart(
  operator: string,
  signal?: AbortSignal
): Promise<string | null> {
  if (isZeroAddress(operator)) {
    throw new Error('A connected Operator is required for pool history');
  }
  if (!config.stakingPoolAddress) {
    throw new Error('The staking pool address is not configured');
  }

  const starts: Array<{
    blockNumber: number;
    eventIndex: number;
    executedAt: string;
  }> = [];
  let after: string | null = null;

  for (let page = 0; page < 1000; page += 1) {
    const payload = await queryTorii<ToriiRawEventsResponse>(
      POOL_EVENTS_QUERY,
      {
        keys: [NEW_POOL_MEMBER_SELECTOR, operator],
        after,
      },
      signal
    );
    const parsed = parsePoolMemberStartPage(
      payload,
      config.stakingPoolAddress,
      operator
    );
    starts.push(...parsed.starts);

    if (!parsed.hasNextPage) {
      const latest = starts.sort(
        (left, right) =>
          right.blockNumber - left.blockNumber ||
          right.eventIndex - left.eventIndex
      )[0];
      return latest?.executedAt ?? null;
    }
    if (!parsed.endCursor || parsed.endCursor === after) {
      throw new Error('Torii returned an invalid pool history cursor');
    }
    after = parsed.endCursor;
  }

  throw new Error('Pool history exceeded the supported pagination limit');
}

export async function getYieldClaims(
  operator: string,
  signal?: AbortSignal
): Promise<YieldClaim[]> {
  if (isZeroAddress(operator)) {
    throw new Error('A connected Operator is required for yield history');
  }
  if (!config.stakingPoolAddress) {
    throw new Error('The staking pool address is not configured');
  }

  const claims: YieldClaim[] = [];
  let after: string | null = null;

  for (let page = 0; page < 1000; page += 1) {
    const payload = await queryTorii<ToriiRawEventsResponse>(
      POOL_EVENTS_QUERY,
      {
        keys: [POOL_MEMBER_REWARD_CLAIMED_SELECTOR, operator],
        after,
      },
      signal
    );
    const parsed = parseYieldClaimPage(
      payload,
      config.stakingPoolAddress,
      operator
    );
    claims.push(...parsed.claims);

    if (!parsed.hasNextPage) {
      return claims.sort(
        (left, right) =>
          right.blockNumber - left.blockNumber ||
          right.eventIndex - left.eventIndex
      );
    }
    if (!parsed.endCursor || parsed.endCursor === after) {
      throw new Error('Torii returned an invalid yield history cursor');
    }
    after = parsed.endCursor;
  }

  throw new Error('Yield history exceeded the supported pagination limit');
}

export async function getOperatorActivity(
  operator: string,
  signal?: AbortSignal
): Promise<OperatorActivity[]> {
  if (isZeroAddress(operator)) {
    throw new Error('A connected Operator is required for activity');
  }

  const payload = await queryTorii<ToriiOperatorActivityResponse>(
    OPERATOR_ACTIVITY_QUERY,
    { operator },
    signal
  );

  let displacementPayload: ToriiDisplacementsResponse | null = null;
  try {
    const result = await queryTorii<ToriiDisplacementsResponse>(
      OPERATOR_DISPLACEMENTS_QUERY,
      { operator },
      signal
    );
    if (!result.errors?.length) displacementPayload = result;
  } catch (error) {
    if (signal?.aborted) throw error;
  }

  return parseOperatorActivity(payload, displacementPayload);
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
      controlledSince: parseUnixTimestamp(
        node.controlled_since,
        'control start time'
      ),
    });
  });

  return [...controlPoints.values()].sort((left, right) => left.id - right.id);
}

async function legacyControlStartTimes(
  controlPoints: IndexedControlPoint[],
  signal?: AbortSignal
): Promise<Map<number, number>> {
  const unresolved = controlPoints.filter(
    ({ controller, controlledSince }) =>
      controlledSince === null && !isZeroAddress(controller)
  );
  if (unresolved.length === 0) return new Map();

  const currentById = new Map(unresolved.map((point) => [point.id, point]));
  const captureBlocks = new Map<number, number>();
  let after: string | null = null;

  for (let page = 0; page < 1000; page += 1) {
    const payload: LegacyCapturePageResponse =
      await queryTorii<LegacyCapturePageResponse>(
        LEGACY_CAPTURE_PAGE_QUERY,
        {
          controlPointIds: unresolved.map(({ id }) => id),
          after,
        },
        signal
      );
    if (payload.errors?.length) {
      throw new Error(
        payload.errors[0]?.message ||
          'Torii rejected the legacy Control Point tenure query'
      );
    }

    const connection:
      | NonNullable<
          LegacyCapturePageResponse['data']
        >['stakewarsControlPointCapturedModels']
      | undefined = payload.data?.stakewarsControlPointCapturedModels;
    if (!connection?.edges || !connection.pageInfo) {
      throw new Error('Torii omitted the legacy Control Point tenure page');
    }

    connection.edges.forEach((edge: ToriiEdge<LegacyCaptureEventNode>) => {
      if (!edge.node) return;
      const id = parseControlPointId(edge.node.control_point_id);
      const current = currentById.get(id);
      if (
        !current ||
        !addressesMatch(current.controller, edge.node.controller) ||
        current.ownershipGeneration !==
          parseBigInt(edge.node.ownership_generation, 'ownership generation')
      ) {
        return;
      }
      captureBlocks.set(id, parseEventPosition(edge.cursor).blockNumber);
    });

    if (!connection.pageInfo.hasNextPage) break;
    const endCursor: string | null = connection.pageInfo.endCursor ?? null;
    if (!endCursor || endCursor === after) {
      throw new Error('Torii returned an invalid legacy tenure cursor');
    }
    after = endCursor;

    if (page === 999) {
      throw new Error('Legacy Control Point tenure exceeded pagination limit');
    }
  }

  const blockTimestamps = await getBlockTimestamps(
    [...captureBlocks.values()],
    signal
  );
  const controlStartTimes = new Map<number, number>();
  captureBlocks.forEach((blockNumber, id) => {
    const timestamp = blockTimestamps.get(blockNumber);
    if (timestamp !== undefined) controlStartTimes.set(id, timestamp);
  });
  return controlStartTimes;
}

export async function getIndexedControlPoints(
  signal?: AbortSignal
): Promise<IndexedControlPoint[]> {
  let payload = await queryTorii<ToriiControlPointResponse>(
    CONTROL_POINTS_QUERY,
    {},
    signal
  );
  if (
    payload.errors?.some(({ message }) => message?.includes('controlled_since'))
  ) {
    payload = await queryTorii<ToriiControlPointResponse>(
      LEGACY_CONTROL_POINTS_QUERY,
      {},
      signal
    );
  }

  const controlPoints = parseIndexedControlPoints(payload);
  try {
    const fallbackTimes = await legacyControlStartTimes(controlPoints, signal);
    return controlPoints.map((point) => ({
      ...point,
      controlledSince:
        point.controlledSince ?? fallbackTimes.get(point.id) ?? null,
    }));
  } catch (error) {
    if (signal?.aborted) throw error;
    return controlPoints;
  }
}
