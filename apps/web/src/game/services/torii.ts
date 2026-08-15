import { config } from './config';
import type {
  IndexedControlPoint,
  OperatorActivity,
  OperatorActivityType,
  YieldClaim,
} from '../types';
import { isControlPointId } from '../utils/controlPointGeometry';
import { addressesMatch, isZeroAddress } from '../utils/format';

const CONTROL_POINTS_QUERY = `
  query StakeWarsControlPoints {
    stakewarsControlPointModels(first: 2000) {
      edges {
        node {
          id
          controller
          controller_generation
          capture_power
          ownership_generation
          controlled_since
        }
      }
    }
  }
`;

const OPERATOR_GENERATIONS_QUERY = `
  query StakeWarsOperatorGenerations($operators: [ContractAddress]) {
    stakewarsOperatorStateModels(
      first: 2000
      where: { operatorIN: $operators }
    ) {
      edges {
        node {
          operator
          generation
        }
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
          capture_power
          ownership_generation
        }
      }
    }
    losses: stakewarsChallengeStartedModels(
      first: 1000
      where: { challenger: $operator }
    ) {
      edges {
        cursor
        node {
          challenge_id
          control_point_id
          incumbent
          challenger
          challenger_locked_power
          deadline
        }
      }
    }
    leadership: stakewarsSealedBidSubmittedModels(
      first: 1000
      where: { bidder: $operator }
    ) {
      edges { cursor node { challenge_id control_point_id bidder locked_power } }
    }
    settlements: stakewarsChallengeSettledModels(
      first: 1000
      where: { winner: $operator }
    ) {
      edges { cursor node { challenge_id control_point_id winner runner_up_bid clearing_power ownership_generation } }
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
          added_power
          capture_power
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
          released_power
          ownership_generation
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
          invalidated_power
          live_delegated_amount
          invalidated_point_count
        }
      }
    }
    relinquishments: stakewarsOperatorRetiredModels(
      first: 1000
      where: { operator: $operator }
    ) {
      edges {
        cursor
        node {
          operator
          previous_generation
          new_generation
          invalidated_power
          released_point_count
        }
      }
    }
  }
`;

const OPERATOR_ACTIVITY_PAGE_QUERY = `
  query StakeWarsOperatorActivityPage(
    $operator: ContractAddress!
    $capturesFirst: Int!
    $lossesFirst: Int!
    $leadershipFirst: Int!
    $settlementsFirst: Int!
    $reinforcementsFirst: Int!
    $releasesFirst: Int!
    $disqualificationsFirst: Int!
    $relinquishmentsFirst: Int!
    $capturesAfter: Cursor
    $lossesAfter: Cursor
    $leadershipAfter: Cursor
    $settlementsAfter: Cursor
    $reinforcementsAfter: Cursor
    $releasesAfter: Cursor
    $disqualificationsAfter: Cursor
    $relinquishmentsAfter: Cursor
  ) {
    captures: stakewarsControlPointCapturedModels(
      first: $capturesFirst
      after: $capturesAfter
      where: { controller: $operator }
    ) {
      edges { cursor node { control_point_id controller capture_power ownership_generation } }
      pageInfo { hasNextPage endCursor }
    }
    losses: stakewarsChallengeStartedModels(
      first: $lossesFirst
      after: $lossesAfter
      where: { challenger: $operator }
    ) {
      edges { cursor node { challenge_id control_point_id incumbent challenger challenger_locked_power deadline } }
      pageInfo { hasNextPage endCursor }
    }
    leadership: stakewarsSealedBidSubmittedModels(
      first: $leadershipFirst
      after: $leadershipAfter
      where: { bidder: $operator }
    ) {
      edges { cursor node { challenge_id control_point_id bidder locked_power } }
      pageInfo { hasNextPage endCursor }
    }
    settlements: stakewarsChallengeSettledModels(
      first: $settlementsFirst
      after: $settlementsAfter
      where: { winner: $operator }
    ) {
      edges { cursor node { challenge_id control_point_id winner runner_up_bid clearing_power ownership_generation } }
      pageInfo { hasNextPage endCursor }
    }
    reinforcements: stakewarsControlPointReinforcedModels(
      first: $reinforcementsFirst
      after: $reinforcementsAfter
      where: { controller: $operator }
    ) {
      edges { cursor node { control_point_id controller added_power capture_power ownership_generation } }
      pageInfo { hasNextPage endCursor }
    }
    releases: stakewarsControlPointReleasedModels(
      first: $releasesFirst
      after: $releasesAfter
      where: { previous_controller: $operator }
    ) {
      edges { cursor node { control_point_id previous_controller released_power ownership_generation } }
      pageInfo { hasNextPage endCursor }
    }
    disqualifications: stakewarsOperatorDisqualifiedModels(
      first: $disqualificationsFirst
      after: $disqualificationsAfter
      where: { operator: $operator }
    ) {
      edges { cursor node { operator previous_generation new_generation invalidated_power live_delegated_amount invalidated_point_count } }
      pageInfo { hasNextPage endCursor }
    }
    relinquishments: stakewarsOperatorRetiredModels(
      first: $relinquishmentsFirst
      after: $relinquishmentsAfter
      where: { operator: $operator }
    ) {
      edges { cursor node { operator previous_generation new_generation invalidated_power released_point_count } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const YIELD_CLAIMS_PAGE_QUERY = `
  query StakeWarsYieldClaimsPage(
    $keys: [String]
    $pageSize: Int!
    $after: Cursor
  ) {
    events(first: $pageSize, after: $after, keys: $keys) {
      edges {
        cursor
        node { id keys data transactionHash executedAt }
      }
      pageInfo { hasNextPage endCursor }
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
  controller_generation: string;
  capture_power: string;
  ownership_generation: string;
  controlled_since?: string | null;
}

interface ToriiOperatorGenerationResponse {
  data?: {
    stakewarsOperatorStateModels?: {
      edges?: Array<{
        node?: { operator: string; generation: string };
      }>;
    };
  };
  errors?: Array<{ message?: string }>;
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
  pageInfo?: {
    hasNextPage?: boolean;
    endCursor?: string | null;
  };
}

interface CaptureEventNode {
  control_point_id: number | string;
  controller: string;
  capture_power: string;
  ownership_generation?: string;
}

interface ReinforcementEventNode {
  control_point_id: number | string;
  added_power: string;
  capture_power: string;
}

interface ReleaseEventNode {
  control_point_id: number | string;
  released_power: string;
}

interface DisqualificationEventNode {
  invalidated_power: string;
  live_delegated_amount: string;
  invalidated_point_count: number | string;
}

interface RelinquishmentEventNode {
  invalidated_power: string;
  released_point_count: number | string;
}

interface ChallengeStartedEventNode {
  challenge_id: number | string;
  control_point_id: number | string;
  incumbent: string;
  challenger: string;
  challenger_locked_power: string;
  deadline: string;
}

interface LeadershipEventNode {
  challenge_id: number | string;
  control_point_id: number | string;
  bidder: string;
  locked_power: string;
}

interface SettlementEventNode {
  challenge_id: number | string;
  control_point_id: number | string;
  winner: string;
  runner_up_bid: string;
  clearing_power: string;
  ownership_generation: string;
}

interface ToriiOperatorActivityResponse {
  data?: {
    captures?: ToriiConnection<CaptureEventNode>;
    losses?: ToriiConnection<ChallengeStartedEventNode>;
    leadership?: ToriiConnection<LeadershipEventNode>;
    settlements?: ToriiConnection<SettlementEventNode>;
    reinforcements?: ToriiConnection<ReinforcementEventNode>;
    releases?: ToriiConnection<ReleaseEventNode>;
    disqualifications?: ToriiConnection<DisqualificationEventNode>;
    relinquishments?: ToriiConnection<RelinquishmentEventNode>;
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
  payload: ToriiOperatorActivityResponse
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
        amount: parseBigInt(node.capture_power, 'capture power'),
      }))
    );
  });

  edges(payload.data.losses).forEach((edge) => {
    append(
      activityFromEdge(edge, (position, node) => ({
        ...position,
        type: 'challenge',
        controlPointId: parseControlPointId(node.control_point_id),
        amount: parseBigInt(node.challenger_locked_power, 'bid collateral'),
        counterparty: node.incumbent,
      }))
    );
  });

  edges(payload.data.leadership).forEach((edge) => {
    append(
      activityFromEdge(edge, (position, node) => ({
        ...position,
        type: 'challenge',
        controlPointId: parseControlPointId(node.control_point_id),
        amount: parseBigInt(node.locked_power, 'bid collateral'),
      }))
    );
  });

  edges(payload.data.settlements).forEach((edge) => {
    append(
      activityFromEdge(edge, (position, node) => ({
        ...position,
        type: 'settlement',
        controlPointId: parseControlPointId(node.control_point_id),
        amount: parseBigInt(node.clearing_power, 'clearing power'),
        secondaryAmount: parseBigInt(node.runner_up_bid, 'runner-up bid'),
      }))
    );
  });

  edges(payload.data.reinforcements).forEach((edge) => {
    append(
      activityFromEdge(edge, (position, node) => {
        const added = parseBigInt(node.added_power, 'added power');
        const capturePower = parseBigInt(node.capture_power, 'capture power');
        return {
          ...position,
          type: 'reinforcement',
          controlPointId: parseControlPointId(node.control_point_id),
          amount: added,
          secondaryAmount: capturePower,
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
        amount: parseBigInt(node.released_power, 'released power'),
      }))
    );
  });

  edges(payload.data.disqualifications).forEach((edge) => {
    append(
      activityFromEdge(edge, (position, node) => ({
        ...position,
        type: 'disqualification',
        amount: parseBigInt(node.invalidated_power, 'invalidated power'),
        secondaryAmount: parseBigInt(
          node.live_delegated_amount,
          'live delegated amount'
        ),
        affectedPointCount: Number(node.invalidated_point_count),
      }))
    );
  });

  payload.data.relinquishments?.edges?.forEach((edge) => {
    append(
      activityFromEdge(edge, (position, node) => ({
        ...position,
        type: 'retirement',
        amount: parseBigInt(node.invalidated_power, 'invalidated power'),
        affectedPointCount: Number(node.released_point_count),
      }))
    );
  });

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

const ACTIVITY_SOURCE_PAGE_SIZE = 20;

interface OperatorControlActivityCursor {
  captures: string | null;
  losses: string | null;
  leadership: string | null;
  settlements: string | null;
  reinforcements: string | null;
  releases: string | null;
  disqualifications: string | null;
  relinquishments: string | null;
}

export interface OperatorActivityFeedCursor
  extends OperatorControlActivityCursor {
  yieldClaims: string | null;
}

export interface OperatorActivityFeedPage {
  activity: OperatorActivity[];
  cursor: OperatorActivityFeedCursor | null;
  warning: string | null;
}

function nextActivityCursor<T>(
  connection: ToriiConnection<T> | undefined,
  label: string
): string | null {
  if (!connection?.pageInfo) {
    throw new Error(`Torii omitted ${label} pagination`);
  }
  if (!connection.pageInfo.hasNextPage) return null;
  if (!connection.pageInfo.endCursor) {
    throw new Error(`Torii returned an invalid ${label} cursor`);
  }
  return connection.pageInfo.endCursor;
}

function hasActivityCursor(cursor: OperatorActivityFeedCursor): boolean {
  return Object.values(cursor).some((value) => value !== null);
}

async function getOperatorControlActivityPage(
  operator: string,
  cursor: OperatorControlActivityCursor | undefined,
  filter: OperatorActivityType | undefined,
  signal?: AbortSignal
): Promise<{
  activity: OperatorActivity[];
  cursor: OperatorControlActivityCursor;
}> {
  const sourceEnabled = (key: keyof OperatorControlActivityCursor) => {
    if (!filter) return true;
    const sourceType: Record<
      keyof OperatorControlActivityCursor,
      OperatorActivityType
    > = {
      captures: 'capture',
      losses: 'challenge',
      leadership: 'challenge',
      settlements: 'settlement',
      reinforcements: 'reinforcement',
      releases: 'release',
      disqualifications: 'disqualification',
      relinquishments: 'retirement',
    };
    return sourceType[key] === filter;
  };
  if (
    filter === 'yield_claim' ||
    (cursor && Object.values(cursor).every((value) => value === null))
  ) {
    return {
      activity: [],
      cursor: cursor ?? {
        captures: null,
        losses: null,
        leadership: null,
        settlements: null,
        reinforcements: null,
        releases: null,
        disqualifications: null,
        relinquishments: null,
      },
    };
  }
  const active = (key: keyof OperatorControlActivityCursor) =>
    sourceEnabled(key) && (cursor === undefined || cursor[key] !== null);
  const payload = await queryTorii<ToriiOperatorActivityResponse>(
    OPERATOR_ACTIVITY_PAGE_QUERY,
    {
      operator,
      capturesFirst: active('captures') ? ACTIVITY_SOURCE_PAGE_SIZE : 0,
      capturesAfter: cursor?.captures ?? null,
      lossesFirst: active('losses') ? ACTIVITY_SOURCE_PAGE_SIZE : 0,
      lossesAfter: cursor?.losses ?? null,
      leadershipFirst: active('leadership') ? ACTIVITY_SOURCE_PAGE_SIZE : 0,
      leadershipAfter: cursor?.leadership ?? null,
      settlementsFirst: active('settlements') ? ACTIVITY_SOURCE_PAGE_SIZE : 0,
      settlementsAfter: cursor?.settlements ?? null,
      reinforcementsFirst: active('reinforcements')
        ? ACTIVITY_SOURCE_PAGE_SIZE
        : 0,
      reinforcementsAfter: cursor?.reinforcements ?? null,
      releasesFirst: active('releases') ? ACTIVITY_SOURCE_PAGE_SIZE : 0,
      releasesAfter: cursor?.releases ?? null,
      disqualificationsFirst: active('disqualifications')
        ? ACTIVITY_SOURCE_PAGE_SIZE
        : 0,
      disqualificationsAfter: cursor?.disqualifications ?? null,
      relinquishmentsFirst: active('relinquishments')
        ? ACTIVITY_SOURCE_PAGE_SIZE
        : 0,
      relinquishmentsAfter: cursor?.relinquishments ?? null,
    },
    signal
  );

  const data = payload.data;
  if (!data) {
    return {
      activity: parseOperatorActivity(payload),
      cursor: {
        captures: null,
        losses: null,
        leadership: null,
        settlements: null,
        reinforcements: null,
        releases: null,
        disqualifications: null,
        relinquishments: null,
      },
    };
  }

  return {
    activity: parseOperatorActivity(payload),
    cursor: {
      captures: active('captures')
        ? nextActivityCursor(data.captures, 'capture activity')
        : null,
      losses: active('losses')
        ? nextActivityCursor(data.losses, 'loss activity')
        : null,
      leadership: active('leadership')
        ? nextActivityCursor(data.leadership, 'sealed bid activity')
        : null,
      settlements: active('settlements')
        ? nextActivityCursor(data.settlements, 'settlement activity')
        : null,
      reinforcements: active('reinforcements')
        ? nextActivityCursor(data.reinforcements, 'reinforcement activity')
        : null,
      releases: active('releases')
        ? nextActivityCursor(data.releases, 'release activity')
        : null,
      disqualifications: active('disqualifications')
        ? nextActivityCursor(
            data.disqualifications,
            'disqualification activity'
          )
        : null,
      relinquishments: active('relinquishments')
        ? nextActivityCursor(data.relinquishments, 'retirement activity')
        : null,
    },
  };
}

async function getYieldClaimActivityPage(
  operator: string,
  after: string | undefined,
  signal?: AbortSignal
): Promise<{ activity: OperatorActivity[]; cursor: string | null }> {
  if (!config.stakingPoolAddress) {
    throw new Error('The staking pool address is not configured');
  }
  const payload = await queryTorii<ToriiRawEventsResponse>(
    YIELD_CLAIMS_PAGE_QUERY,
    {
      keys: [POOL_MEMBER_REWARD_CLAIMED_SELECTOR, operator],
      pageSize: ACTIVITY_SOURCE_PAGE_SIZE,
      after: after ?? null,
    },
    signal
  );
  const parsed = parseYieldClaimPage(
    payload,
    config.stakingPoolAddress,
    operator
  );
  if (parsed.hasNextPage && !parsed.endCursor) {
    throw new Error('Torii returned an invalid yield history cursor');
  }
  return {
    activity: parsed.claims.map((claim) => ({
      id: claim.id,
      type: 'yield_claim',
      blockNumber: claim.blockNumber,
      eventIndex: claim.eventIndex,
      transactionHash: claim.transactionHash,
      amount: claim.amount,
      counterparty: claim.rewardAddress,
    })),
    cursor: parsed.hasNextPage ? parsed.endCursor : null,
  };
}

export async function getOperatorActivityFeedPage(
  operator: string,
  cursor?: OperatorActivityFeedCursor,
  signal?: AbortSignal,
  filter?: OperatorActivityType
): Promise<OperatorActivityFeedPage> {
  if (isZeroAddress(operator)) {
    throw new Error('A connected Operator is required for activity');
  }

  const controlCursor = cursor
    ? {
        captures: cursor.captures,
        losses: cursor.losses,
        leadership: cursor.leadership,
        settlements: cursor.settlements,
        reinforcements: cursor.reinforcements,
        releases: cursor.releases,
        disqualifications: cursor.disqualifications,
        relinquishments: cursor.relinquishments,
      }
    : undefined;
  const [controlResult, claimResult] = await Promise.allSettled([
    getOperatorControlActivityPage(operator, controlCursor, filter, signal),
    (filter && filter !== 'yield_claim') || cursor?.yieldClaims === null
      ? Promise.resolve({ activity: [], cursor: null })
      : getYieldClaimActivityPage(
          operator,
          cursor?.yieldClaims ?? undefined,
          signal
        ),
  ]);

  if (
    controlResult.status === 'rejected' &&
    claimResult.status === 'rejected'
  ) {
    throw controlResult.reason;
  }

  const control =
    controlResult.status === 'fulfilled'
      ? controlResult.value
      : {
          activity: [],
          cursor: {
            captures: null,
            losses: null,
            leadership: null,
            settlements: null,
            reinforcements: null,
            releases: null,
            disqualifications: null,
            relinquishments: null,
          },
        };
  const claims =
    claimResult.status === 'fulfilled'
      ? claimResult.value
      : { activity: [], cursor: null };
  const nextCursor: OperatorActivityFeedCursor = {
    ...control.cursor,
    yieldClaims: claims.cursor,
  };
  const warning =
    controlResult.status === 'rejected'
      ? `CONTROL EVENTS UNAVAILABLE · ${
          controlResult.reason instanceof Error
            ? controlResult.reason.message
            : 'Unable to read event data.'
        }`
      : claimResult.status === 'rejected'
        ? `YIELD EVENTS UNAVAILABLE · ${
            claimResult.reason instanceof Error
              ? claimResult.reason.message
              : 'Unable to read event data.'
          }`
        : null;

  return {
    activity: [...control.activity, ...claims.activity].sort(
      (left, right) =>
        right.blockNumber - left.blockNumber ||
        right.eventIndex - left.eventIndex
    ),
    cursor: hasActivityCursor(nextCursor) ? nextCursor : null,
    warning,
  };
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

  return parseOperatorActivity(payload);
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
      controllerGeneration: parseBigInt(
        node.controller_generation,
        'controller generation'
      ),
      capturePower: parseBigInt(node.capture_power, 'capture power'),
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

export function filterControlPointsByOperatorGeneration(
  controlPoints: IndexedControlPoint[],
  operatorGenerations: ReadonlyArray<{
    operator: string;
    generation: bigint;
  }>
): IndexedControlPoint[] {
  const generationByOperator = new Map(
    operatorGenerations.map(({ operator, generation }) => [
      parseBigInt(operator, 'operator address').toString(),
      generation,
    ])
  );

  return controlPoints.filter(({ controller, controllerGeneration }) => {
    if (isZeroAddress(controller)) return true;
    return (
      generationByOperator.get(
        parseBigInt(controller, 'controller address').toString()
      ) === controllerGeneration
    );
  });
}

async function filterCurrentControlPoints(
  controlPoints: IndexedControlPoint[],
  signal?: AbortSignal
): Promise<IndexedControlPoint[]> {
  const controllers = [
    ...new Map(
      controlPoints
        .filter(({ controller }) => !isZeroAddress(controller))
        .map(({ controller }) => [
          parseBigInt(controller, 'controller address').toString(),
          controller,
        ])
    ).values(),
  ];
  if (controllers.length === 0) return controlPoints;

  const payload = await queryTorii<ToriiOperatorGenerationResponse>(
    OPERATOR_GENERATIONS_QUERY,
    { operators: controllers },
    signal
  );
  if (payload.errors?.length) {
    throw new Error(
      payload.errors[0]?.message ||
        'Torii rejected the Operator generation query'
    );
  }
  const operatorEdges = payload.data?.stakewarsOperatorStateModels?.edges;
  if (!operatorEdges) {
    throw new Error('Torii omitted the Operator generation collection');
  }

  return filterControlPointsByOperatorGeneration(
    controlPoints,
    operatorEdges.flatMap(({ node }) =>
      node
        ? [
            {
              operator: node.operator,
              generation: parseBigInt(node.generation, 'operator generation'),
            },
          ]
        : []
    )
  );
}

export async function getIndexedControlPoints(
  signal?: AbortSignal
): Promise<IndexedControlPoint[]> {
  const payload = await queryTorii<ToriiControlPointResponse>(
    CONTROL_POINTS_QUERY,
    {},
    signal
  );
  return filterCurrentControlPoints(parseIndexedControlPoints(payload), signal);
}
