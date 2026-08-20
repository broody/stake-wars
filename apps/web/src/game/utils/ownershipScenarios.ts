import { SECTOR_COUNT, adjacentSectorIds } from './sectorGeometry';
import { STAKE_RELIEF_CAP_STRK } from './sectorStakeRelief';

export {
  MAX_STAKE_RELIEF_HEIGHT,
  STAKE_RELIEF_CAP_STRK,
  stakeReliefHeight,
} from './sectorStakeRelief';

export type OwnershipDistribution = 'contiguous' | 'mixed' | 'scattered';
export type OwnershipScenarioKind = 'wave' | 'distribution';

const UNOCCUPIED_SECTOR_COUNT = Math.round(SECTOR_COUNT * 0.08);
const DEFAULT_OCCUPIED_SECTOR_COUNT = SECTOR_COUNT - UNOCCUPIED_SECTOR_COUNT;
const UNOCCUPIED_REGION_COUNT = 12;

export interface OwnershipScenario {
  id: string;
  title: string;
  description: string;
  distribution: OwnershipDistribution;
  kind: OwnershipScenarioKind;
  ownerCount: number;
  occupiedSectorCount: number;
  ownerBySector: readonly number[];
  sectorIdsByOwner: readonly (readonly number[])[];
  unoccupiedSectorIds: readonly number[];
  contestedSectorIds: readonly number[];
  ownerAddresses: readonly string[];
  stakedStrkByOwner: readonly number[];
  counts: readonly number[];
  seed: number;
}

export interface OwnershipScenarioDefinition {
  id: string;
  title: string;
  description: string;
  distribution: OwnershipDistribution;
  kind: OwnershipScenarioKind;
  ownerCount: number;
  occupiedSectorCount: number;
  seed: number;
}

export const OWNERSHIP_SCENARIO_DEFINITIONS: readonly OwnershipScenarioDefinition[] =
  [
    {
      id: 'wave-7',
      title: 'WAVE · 7',
      description:
        'A tiny two-Operator holding for checking individual panel cadence.',
      distribution: 'contiguous',
      kind: 'wave',
      ownerCount: 2,
      occupiedSectorCount: 7,
      seed: 101,
    },
    {
      id: 'wave-32',
      title: 'WAVE · 32',
      description:
        'A compact frontier that makes the wave front easy to follow.',
      distribution: 'contiguous',
      kind: 'wave',
      ownerCount: 4,
      occupiedSectorCount: 32,
      seed: 131,
    },
    {
      id: 'wave-128',
      title: 'WAVE · 128',
      description:
        'A regional holding for balancing travel time against panel speed.',
      distribution: 'contiguous',
      kind: 'wave',
      ownerCount: 8,
      occupiedSectorCount: 128,
      seed: 163,
    },
    {
      id: 'wave-512',
      title: 'WAVE · 512',
      description:
        'A quarter-Core load for checking a broad, readable wave front.',
      distribution: 'mixed',
      kind: 'wave',
      ownerCount: 16,
      occupiedSectorCount: 512,
      seed: 197,
    },
    {
      id: 'wave-1840',
      title: 'WAVE · 1,840',
      description:
        'A near-full Core for checking dense opponent and ownership waves.',
      distribution: 'mixed',
      kind: 'wave',
      ownerCount: 32,
      occupiedSectorCount: DEFAULT_OCCUPIED_SECTOR_COUNT,
      seed: 229,
    },
    {
      id: 'frontiers',
      title: 'FRONTIERS',
      description: 'A few Operators holding large, contiguous territories.',
      distribution: 'contiguous',
      kind: 'distribution',
      ownerCount: 8,
      occupiedSectorCount: DEFAULT_OCCUPIED_SECTOR_COUNT,
      seed: 11,
    },
    {
      id: 'city-states',
      title: 'CITY STATES',
      description: 'Thirty-two Operators forming smaller contiguous regions.',
      distribution: 'contiguous',
      kind: 'distribution',
      ownerCount: 32,
      occupiedSectorCount: DEFAULT_OCCUPIED_SECTOR_COUNT,
      seed: 29,
    },
    {
      id: 'fractured',
      title: 'FRACTURED',
      description:
        'Ninety-six Operators with clustered cores and remote holdings.',
      distribution: 'mixed',
      kind: 'distribution',
      ownerCount: 96,
      occupiedSectorCount: DEFAULT_OCCUPIED_SECTOR_COUNT,
      seed: 47,
    },
    {
      id: 'saturated',
      title: 'SATURATED',
      description:
        'Three hundred twenty Operators spread across a densely occupied Core.',
      distribution: 'scattered',
      kind: 'distribution',
      ownerCount: 320,
      occupiedSectorCount: DEFAULT_OCCUPIED_SECTOR_COUNT,
      seed: 83,
    },
  ];

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffledSectorIds(random: () => number): number[] {
  const ids = Array.from({ length: SECTOR_COUNT }, (_, id) => id);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }
  return ids;
}

function keepsOccupiedCoreConnected(
  selected: ReadonlySet<number>,
  candidate: number
): boolean {
  let firstOccupiedSectorId = -1;
  for (let sectorId = 0; sectorId < SECTOR_COUNT; sectorId += 1) {
    if (sectorId !== candidate && !selected.has(sectorId)) {
      firstOccupiedSectorId = sectorId;
      break;
    }
  }
  if (firstOccupiedSectorId === -1) return false;

  const visited = new Set<number>();
  const pending = [firstOccupiedSectorId];
  while (pending.length > 0) {
    const sectorId = pending.pop();
    if (sectorId === undefined || visited.has(sectorId)) continue;
    visited.add(sectorId);
    adjacentSectorIds(sectorId).forEach((neighborId) => {
      if (
        neighborId !== candidate &&
        !selected.has(neighborId) &&
        !visited.has(neighborId)
      ) {
        pending.push(neighborId);
      }
    });
  }

  return visited.size === SECTOR_COUNT - selected.size - 1;
}

function clusteredUnoccupiedSectorIds(seed: number): number[] {
  const random = createRandom(seed ^ 0xa341316c);
  const shuffledIds = shuffledSectorIds(random);
  const selected = new Set<number>();
  let seedIndex = 0;

  for (let region = 0; region < UNOCCUPIED_REGION_COUNT; region += 1) {
    while (
      seedIndex < shuffledIds.length &&
      selected.has(shuffledIds[seedIndex])
    ) {
      seedIndex += 1;
    }
    const regionSeed = shuffledIds[seedIndex];
    if (regionSeed === undefined) break;
    seedIndex += 1;

    const regionTarget = Math.ceil(
      (UNOCCUPIED_SECTOR_COUNT - selected.size) /
        (UNOCCUPIED_REGION_COUNT - region)
    );
    const pending = [regionSeed];
    const queued = new Set(pending);
    let addedToRegion = 0;

    while (pending.length > 0 && addedToRegion < regionTarget) {
      const sectorId = pending.shift();
      if (sectorId === undefined || selected.has(sectorId)) continue;

      const neighbors = [...adjacentSectorIds(sectorId)];
      if (random() > 0.5) neighbors.reverse();
      neighbors.forEach((neighborId) => {
        if (!selected.has(neighborId) && !queued.has(neighborId)) {
          pending.push(neighborId);
          queued.add(neighborId);
        }
      });

      if (!keepsOccupiedCoreConnected(selected, sectorId)) continue;
      selected.add(sectorId);
      addedToRegion += 1;
    }
  }

  for (const sectorId of shuffledIds) {
    if (selected.size >= UNOCCUPIED_SECTOR_COUNT) break;
    if (keepsOccupiedCoreConnected(selected, sectorId)) {
      selected.add(sectorId);
    }
  }

  return [...selected].sort((left, right) => left - right);
}

function connectedOccupiedSectorIds(
  seed: number,
  targetCount: number
): Set<number> {
  const random = createRandom(seed ^ 0x51ed270b);
  const shuffledIds = shuffledSectorIds(random);
  const firstSectorId = shuffledIds[0];
  const selected = new Set<number>();
  const pending = firstSectorId === undefined ? [] : [firstSectorId];
  const queued = new Set(pending);

  while (pending.length > 0 && selected.size < targetCount) {
    const pendingIndex = Math.floor(random() * pending.length);
    const sectorId = pending.splice(pendingIndex, 1)[0];
    if (sectorId === undefined || selected.has(sectorId)) continue;
    selected.add(sectorId);

    const neighbors = [...adjacentSectorIds(sectorId)];
    for (let index = neighbors.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [neighbors[index], neighbors[swapIndex]] = [
        neighbors[swapIndex],
        neighbors[index],
      ];
    }
    neighbors.forEach((neighborId) => {
      if (!selected.has(neighborId) && !queued.has(neighborId)) {
        pending.push(neighborId);
        queued.add(neighborId);
      }
    });
  }

  return selected;
}

function unoccupiedSectorIdsForDefinition(
  definition: OwnershipScenarioDefinition
): number[] {
  if (definition.occupiedSectorCount === DEFAULT_OCCUPIED_SECTOR_COUNT) {
    return clusteredUnoccupiedSectorIds(definition.seed);
  }

  const occupiedSectorIds = connectedOccupiedSectorIds(
    definition.seed,
    definition.occupiedSectorCount
  );
  return Array.from({ length: SECTOR_COUNT }, (_, sectorId) => sectorId).filter(
    (sectorId) => !occupiedSectorIds.has(sectorId)
  );
}

function ownerWeights(ownerCount: number, random: () => number): number[] {
  return Array.from({ length: ownerCount }, () => {
    const skew = random();
    return 0.45 + skew * skew * 2.8;
  });
}

function contiguousOwnership(
  ownerCount: number,
  seed: number,
  unoccupiedSectorIds: ReadonlySet<number>
): number[] {
  const random = createRandom(seed);
  const shuffledIds = shuffledSectorIds(random).filter(
    (sectorId) => !unoccupiedSectorIds.has(sectorId)
  );
  const assignments = Array<number>(SECTOR_COUNT).fill(-1);
  const weights = ownerWeights(ownerCount, random);
  const counts = Array<number>(ownerCount).fill(1);
  const frontiers = Array.from({ length: ownerCount }, () => [] as number[]);

  for (let owner = 0; owner < ownerCount; owner += 1) {
    const sectorId = shuffledIds[owner];
    assignments[sectorId] = owner;
  }

  for (let owner = 0; owner < ownerCount; owner += 1) {
    const seedSectorId = shuffledIds[owner];
    frontiers[owner].push(...adjacentSectorIds(seedSectorId));
  }

  let assignedCount = ownerCount;
  while (assignedCount < shuffledIds.length) {
    let nextOwner = -1;
    let lowestPressure = Number.POSITIVE_INFINITY;

    for (let owner = 0; owner < ownerCount; owner += 1) {
      const frontier = frontiers[owner];
      while (
        frontier.length > 0 &&
        (assignments[frontier[frontier.length - 1]] !== -1 ||
          unoccupiedSectorIds.has(frontier[frontier.length - 1]))
      ) {
        frontier.pop();
      }
      if (frontier.length === 0) continue;

      const pressure = counts[owner] / weights[owner];
      if (pressure < lowestPressure) {
        lowestPressure = pressure;
        nextOwner = owner;
      }
    }

    if (nextOwner === -1) {
      throw new Error('Unable to complete contiguous ownership scenario');
    }

    const frontier = frontiers[nextOwner];
    const nextSectorId = frontier.pop();
    if (nextSectorId === undefined) continue;
    assignments[nextSectorId] = nextOwner;
    counts[nextOwner] += 1;
    assignedCount += 1;

    const neighbors = [...adjacentSectorIds(nextSectorId)];
    if (random() > 0.5) neighbors.reverse();
    neighbors.forEach((neighbor) => {
      if (assignments[neighbor] === -1 && !unoccupiedSectorIds.has(neighbor)) {
        frontier.push(neighbor);
      }
    });
  }

  return assignments;
}

function scatteredOwnership(
  ownerCount: number,
  seed: number,
  unoccupiedSectorIds: ReadonlySet<number>
): number[] {
  const random = createRandom(seed);
  const shuffledIds = shuffledSectorIds(random).filter(
    (sectorId) => !unoccupiedSectorIds.has(sectorId)
  );
  const weights = ownerWeights(ownerCount, random);
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  const assignments = Array<number>(SECTOR_COUNT).fill(-1);

  for (let owner = 0; owner < ownerCount; owner += 1) {
    assignments[shuffledIds[owner]] = owner;
  }

  for (let index = ownerCount; index < shuffledIds.length; index += 1) {
    let draw = random() * totalWeight;
    let owner = ownerCount - 1;
    for (let candidate = 0; candidate < ownerCount; candidate += 1) {
      draw -= weights[candidate];
      if (draw <= 0) {
        owner = candidate;
        break;
      }
    }
    assignments[shuffledIds[index]] = owner;
  }

  return assignments;
}

function mixedOwnership(
  ownerCount: number,
  seed: number,
  unoccupiedSectorIds: ReadonlySet<number>
): number[] {
  const assignments = contiguousOwnership(
    ownerCount,
    seed,
    unoccupiedSectorIds
  );
  const random = createRandom(seed ^ 0x9e3779b9);
  const occupiedSectorIds = Array.from(
    { length: SECTOR_COUNT },
    (_, sectorId) => sectorId
  ).filter((sectorId) => !unoccupiedSectorIds.has(sectorId));
  const swapCount = Math.floor(occupiedSectorIds.length * 0.22);

  for (let swap = 0; swap < swapCount; swap += 1) {
    const left =
      occupiedSectorIds[Math.floor(random() * occupiedSectorIds.length)];
    let right =
      occupiedSectorIds[Math.floor(random() * occupiedSectorIds.length)];
    if (assignments[left] === assignments[right]) {
      const rightIndex = occupiedSectorIds.indexOf(right);
      right =
        occupiedSectorIds[
          (rightIndex + 1 + Math.floor(random() * 97)) %
            occupiedSectorIds.length
        ];
    }
    [assignments[left], assignments[right]] = [
      assignments[right],
      assignments[left],
    ];
  }

  return assignments;
}

function contestedOwnershipFronts(
  ownerBySector: readonly number[],
  ownerCount: number,
  seed: number
): number[] {
  const boundarySectorIds = ownerBySector.flatMap((owner, sectorId) =>
    owner >= 0 &&
    adjacentSectorIds(sectorId).some((neighborId) => {
      const neighborOwner = ownerBySector[neighborId];
      return neighborOwner >= 0 && neighborOwner !== owner;
    })
      ? [sectorId]
      : []
  );
  const boundarySet = new Set(boundarySectorIds);
  const random = createRandom(seed ^ 0x7f4a7c15);

  for (let index = boundarySectorIds.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [boundarySectorIds[index], boundarySectorIds[swapIndex]] = [
      boundarySectorIds[swapIndex],
      boundarySectorIds[index],
    ];
  }

  const targetCount = Math.min(
    boundarySectorIds.length,
    Math.round(18 + Math.sqrt(ownerCount) * 5)
  );
  const frontCount = Math.min(
    6,
    Math.max(2, Math.round(Math.log2(ownerCount) / 2))
  );
  const selected = new Set<number>();
  let seedIndex = 0;

  for (let front = 0; front < frontCount; front += 1) {
    while (
      seedIndex < boundarySectorIds.length &&
      selected.has(boundarySectorIds[seedIndex])
    ) {
      seedIndex += 1;
    }
    const frontSeed = boundarySectorIds[seedIndex];
    if (frontSeed === undefined) break;
    seedIndex += 1;

    const frontTarget = Math.ceil(
      (targetCount - selected.size) / (frontCount - front)
    );
    const pending = [frontSeed];
    const queued = new Set(pending);
    let addedToFront = 0;

    while (pending.length > 0 && addedToFront < frontTarget) {
      const sectorId = pending.shift();
      if (sectorId === undefined || selected.has(sectorId)) continue;
      selected.add(sectorId);
      addedToFront += 1;

      const neighbors = [...adjacentSectorIds(sectorId)];
      if (random() > 0.5) neighbors.reverse();
      neighbors.forEach((neighborId) => {
        if (
          boundarySet.has(neighborId) &&
          !selected.has(neighborId) &&
          !queued.has(neighborId)
        ) {
          pending.push(neighborId);
          queued.add(neighborId);
        }
      });
    }
  }

  for (const sectorId of boundarySectorIds) {
    if (selected.size >= targetCount) break;
    selected.add(sectorId);
  }

  return [...selected].sort((left, right) => left - right);
}

function mockOwnerAddress(owner: number, seed: number): string {
  const random = createRandom(seed + owner * 1_009 + 17);
  const chunks = Array.from({ length: 8 }, () =>
    Math.floor(random() * 0x1_0000_0000)
      .toString(16)
      .padStart(8, '0')
  );
  return `0x${chunks.join('')}`;
}

function simulatedStakedStrk(ownerCount: number, seed: number): number[] {
  const random = createRandom(seed ^ 0xc8013ea4);
  const stakes = Array.from({ length: ownerCount }, () => {
    const exponent = 2 + Math.pow(random(), 1.35) * 4;
    return Math.max(100, Math.round(Math.pow(10, exponent) / 10) * 10);
  });
  if (stakes.length > 0) {
    stakes[stakes.length - 1] = STAKE_RELIEF_CAP_STRK * 5;
  }
  return stakes;
}

export function createOwnershipScenario(
  definition: OwnershipScenarioDefinition
): OwnershipScenario {
  if (
    !Number.isInteger(definition.ownerCount) ||
    definition.ownerCount < 1 ||
    definition.ownerCount > SECTOR_COUNT
  ) {
    throw new RangeError('Owner count must fit within the Sector count');
  }
  if (
    !Number.isInteger(definition.occupiedSectorCount) ||
    definition.occupiedSectorCount < definition.ownerCount ||
    definition.occupiedSectorCount > SECTOR_COUNT
  ) {
    throw new RangeError(
      'Occupied Sector count must include every owner and fit within the Core'
    );
  }

  const unoccupiedSectorIds = unoccupiedSectorIdsForDefinition(definition);
  const unoccupiedSectorIdSet = new Set(unoccupiedSectorIds);
  const ownerBySector =
    definition.distribution === 'contiguous'
      ? contiguousOwnership(
          definition.ownerCount,
          definition.seed,
          unoccupiedSectorIdSet
        )
      : definition.distribution === 'mixed'
        ? mixedOwnership(
            definition.ownerCount,
            definition.seed,
            unoccupiedSectorIdSet
          )
        : scatteredOwnership(
            definition.ownerCount,
            definition.seed,
            unoccupiedSectorIdSet
          );
  const sectorIdsByOwner = Array.from(
    { length: definition.ownerCount },
    () => [] as number[]
  );
  ownerBySector.forEach((owner, sectorId) => {
    if (owner >= 0) sectorIdsByOwner[owner].push(sectorId);
  });

  return {
    ...definition,
    ownerBySector,
    sectorIdsByOwner,
    unoccupiedSectorIds,
    contestedSectorIds: contestedOwnershipFronts(
      ownerBySector,
      definition.ownerCount,
      definition.seed
    ),
    ownerAddresses: Array.from({ length: definition.ownerCount }, (_, owner) =>
      mockOwnerAddress(owner, definition.seed)
    ),
    stakedStrkByOwner: simulatedStakedStrk(
      definition.ownerCount,
      definition.seed
    ),
    counts: sectorIdsByOwner.map((ids) => ids.length),
  };
}

export const OWNERSHIP_SCENARIOS: readonly OwnershipScenario[] =
  OWNERSHIP_SCENARIO_DEFINITIONS.map(createOwnershipScenario);
