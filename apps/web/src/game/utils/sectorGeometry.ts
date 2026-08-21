import * as THREE from 'three';

export const SECTOR_COUNT = 2_000;
export const SECTOR_DETAIL = 9;
export const CORE_RADIUS = 5;

const VERTICES_PER_SECTOR = 3;
const VALUES_PER_VERTEX = 3;
const VALUES_PER_SECTOR = VERTICES_PER_SECTOR * VALUES_PER_VERTEX;
const DISTINCT_OWNER_SEAM = 0.05;

interface Triangle {
  key: string;
  positions: number[];
}

interface OwnershipEdge {
  sectorId: number;
  oppositeVertex: number;
  ownerGroupIndex: number;
}

interface BarycentricPoint {
  weights: [number, number, number];
}

interface Edge {
  ownership: OwnershipEdge[];
}

function coordinateKey(value: number): string {
  return value.toFixed(10);
}

function triangleKey(positions: number[]): string {
  const vertices = Array.from({ length: VERTICES_PER_SECTOR }, (_, i) =>
    positions
      .slice(i * VALUES_PER_VERTEX, (i + 1) * VALUES_PER_VERTEX)
      .map(coordinateKey)
      .join(',')
  ).sort();

  return vertices.join('|');
}

function edgeKey(positions: number[]): string {
  const vertices = [
    positions.slice(0, VALUES_PER_VERTEX),
    positions.slice(VALUES_PER_VERTEX),
  ]
    .map((vertex) => vertex.map(coordinateKey).join(','))
    .sort();

  return vertices.join('|');
}

function createCanonicalUnitPositions(): Float32Array {
  const source = new THREE.IcosahedronGeometry(1, SECTOR_DETAIL);
  const sourcePositions = source.getAttribute('position');
  const triangles: Triangle[] = [];

  for (let offset = 0; offset < sourcePositions.count; offset += 3) {
    const positions: number[] = [];

    for (let vertex = offset; vertex < offset + 3; vertex += 1) {
      positions.push(
        sourcePositions.getX(vertex),
        sourcePositions.getY(vertex),
        sourcePositions.getZ(vertex)
      );
    }

    triangles.push({ key: triangleKey(positions), positions });
  }

  source.dispose();
  triangles.sort((left, right) => {
    if (left.key === right.key) return 0;
    return left.key < right.key ? -1 : 1;
  });

  if (triangles.length !== SECTOR_COUNT) {
    throw new Error(
      `Expected ${SECTOR_COUNT} Sectors, received ${triangles.length}`
    );
  }

  return Float32Array.from(triangles.flatMap(({ positions }) => positions));
}

// IDs are the array indexes after sorting triangles by their vertex coordinates.
// This makes IDs deterministic even if Three.js changes its triangle traversal order.
const CANONICAL_UNIT_POSITIONS = createCanonicalUnitPositions();

function createSectorNeighborMap(): readonly (readonly number[])[] {
  const edgeSectors = new Map<string, number[]>();

  for (let sectorId = 0; sectorId < SECTOR_COUNT; sectorId += 1) {
    const triangleOffset = sectorId * VALUES_PER_SECTOR;
    const triangle = Array.from(
      CANONICAL_UNIT_POSITIONS.slice(
        triangleOffset,
        triangleOffset + VALUES_PER_SECTOR
      )
    );

    for (let vertex = 0; vertex < VERTICES_PER_SECTOR; vertex += 1) {
      const nextVertex = (vertex + 1) % VERTICES_PER_SECTOR;
      const key = edgeKey([
        ...triangle.slice(
          vertex * VALUES_PER_VERTEX,
          (vertex + 1) * VALUES_PER_VERTEX
        ),
        ...triangle.slice(
          nextVertex * VALUES_PER_VERTEX,
          (nextVertex + 1) * VALUES_PER_VERTEX
        ),
      ]);
      const owners = edgeSectors.get(key) ?? [];
      owners.push(sectorId);
      edgeSectors.set(key, owners);
    }
  }

  const neighbors = Array.from(
    { length: SECTOR_COUNT },
    () => new Set<number>()
  );
  edgeSectors.forEach((owners) => {
    if (owners.length !== 2) return;
    neighbors[owners[0]].add(owners[1]);
    neighbors[owners[1]].add(owners[0]);
  });

  return neighbors.map((sectorIds) =>
    Object.freeze([...sectorIds].sort((left, right) => left - right))
  );
}

const SECTOR_NEIGHBORS = createSectorNeighborMap();

export function isSectorId(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < SECTOR_COUNT;
}

export function adjacentSectorIds(sectorId: number): readonly number[] {
  if (!isSectorId(sectorId)) {
    throw new RangeError(`Invalid Sector ID: ${sectorId}`);
  }
  return SECTOR_NEIGHBORS[sectorId];
}

export function createSectorGeometry(
  radius = CORE_RADIUS
): THREE.BufferGeometry {
  const positions = CANONICAL_UNIT_POSITIONS.map((value) => value * radius);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function extractSectorPositions(
  sectorIds: number[],
  radius = CORE_RADIUS
): Float32Array {
  const positions = new Float32Array(sectorIds.length * VALUES_PER_SECTOR);

  sectorIds.forEach((sectorId, resultIndex) => {
    if (!isSectorId(sectorId)) {
      throw new RangeError(`Invalid Sector ID: ${sectorId}`);
    }

    const sourceOffset = sectorId * VALUES_PER_SECTOR;
    const resultOffset = resultIndex * VALUES_PER_SECTOR;

    for (let value = 0; value < VALUES_PER_SECTOR; value += 1) {
      positions[resultOffset + value] =
        CANONICAL_UNIT_POSITIONS[sourceOffset + value] * radius;
    }
  });

  return positions;
}

export function createSingleSectorGeometry(
  sectorId: number,
  radius = CORE_RADIUS
): THREE.BufferGeometry {
  return createSectorSetGeometry([sectorId], radius);
}

export function createSectorSetGeometry(
  sectorIds: number[],
  radius = CORE_RADIUS
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(extractSectorPositions(sectorIds, radius), 3)
  );
  geometry.computeVertexNormals();
  return geometry;
}

interface SectorEdgePositions {
  boundary: number[];
  internal: number[];
}

function sectorEdgePositions(
  sectorIds: readonly number[],
  heights?: ReadonlyMap<number, number>,
  radius = CORE_RADIUS
): SectorEdgePositions {
  const boundaryEdges = new Map<string, number[]>();
  const internalEdges = new Map<string, number[]>();

  [...new Set(sectorIds)].forEach((sectorId) => {
    const { base, top } = raisedTrianglePositions(
      sectorId,
      heights?.get(sectorId) ?? 0,
      radius
    );

    for (let vertex = 0; vertex < VERTICES_PER_SECTOR; vertex += 1) {
      const nextVertex = (vertex + 1) % VERTICES_PER_SECTOR;
      const baseEdge = [
        ...base.slice(
          vertex * VALUES_PER_VERTEX,
          (vertex + 1) * VALUES_PER_VERTEX
        ),
        ...base.slice(
          nextVertex * VALUES_PER_VERTEX,
          (nextVertex + 1) * VALUES_PER_VERTEX
        ),
      ];
      const key = edgeKey(baseEdge);
      const topEdge = [
        ...top.slice(
          vertex * VALUES_PER_VERTEX,
          (vertex + 1) * VALUES_PER_VERTEX
        ),
        ...top.slice(
          nextVertex * VALUES_PER_VERTEX,
          (nextVertex + 1) * VALUES_PER_VERTEX
        ),
      ];

      if (boundaryEdges.has(key)) {
        boundaryEdges.delete(key);
        internalEdges.set(key, topEdge);
        continue;
      }

      boundaryEdges.set(key, topEdge);
    }
  });

  return {
    boundary: [...boundaryEdges.values()].flat(),
    internal: [...internalEdges.values()].flat(),
  };
}

function createEdgeGeometry(positions: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, VALUES_PER_VERTEX)
  );
  geometry.computeBoundingSphere();
  return geometry;
}

export function createSectorBoundaryGeometry(
  sectorIds: number[],
  heights?: ReadonlyMap<number, number>,
  radius = CORE_RADIUS
): THREE.BufferGeometry {
  return createEdgeGeometry(
    sectorEdgePositions(sectorIds, heights, radius).boundary
  );
}

export function createSectorGroupGridGeometries(
  sectorGroups: readonly (readonly number[])[],
  heights?: ReadonlyMap<number, number>,
  radius = CORE_RADIUS
): { boundaries: THREE.BufferGeometry; interiors: THREE.BufferGeometry } {
  const boundaryPositions: number[] = [];
  const internalPositions: number[] = [];

  sectorGroups.forEach((sectorIds) => {
    const positions = sectorEdgePositions(sectorIds, heights, radius);
    boundaryPositions.push(...positions.boundary);
    internalPositions.push(...positions.internal);
  });

  return {
    boundaries: createEdgeGeometry(boundaryPositions),
    interiors: createEdgeGeometry(internalPositions),
  };
}

function raisedTrianglePositions(
  sectorId: number,
  height: number,
  radius: number
): { base: number[]; top: number[] } {
  if (!Number.isFinite(height) || height < 0) {
    throw new RangeError(`Invalid Sector height: ${height}`);
  }
  const base = Array.from(extractSectorPositions([sectorId], radius));
  const topRadius = radius + height;
  const top = base.map((value) => value * (topRadius / radius));
  return { base, top };
}

export function createRaisedSectorSetGeometry(
  sectorIds: number[],
  heights: ReadonlyMap<number, number>,
  radius = CORE_RADIUS
): THREE.BufferGeometry {
  const positions = sectorIds.flatMap(
    (sectorId) =>
      raisedTrianglePositions(sectorId, heights.get(sectorId) ?? 0, radius).top
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, VALUES_PER_VERTEX)
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createExtrudedSectorGeometries(
  sectorIds: number[],
  heights: ReadonlyMap<number, number>,
  radius = CORE_RADIUS,
  sectorGroups?: number[][],
  includeCollapsedSides = false
): {
  tops: THREE.BufferGeometry;
  sides: THREE.BufferGeometry;
  topSectorIds: number[];
  sideSectorIds: number[];
} {
  const sidePositions: number[] = [];
  const sideSectorIds: number[] = [];

  const topData = sectorGroups
    ? separatedSectorData(
        sectorIds,
        sectorGroups,
        DISTINCT_OWNER_SEAM / 2,
        radius,
        heights
      )
    : {
        positions: sectorIds.flatMap(
          (sectorId) =>
            raisedTrianglePositions(
              sectorId,
              heights.get(sectorId) ?? 0,
              radius
            ).top
        ),
        faceSectorIds: [...sectorIds],
      };

  sectorIds.forEach((sectorId) => {
    const height = heights.get(sectorId) ?? 0;
    const { base, top } = raisedTrianglePositions(sectorId, height, radius);
    if (height === 0 && !includeCollapsedSides) return;

    for (let vertex = 0; vertex < VERTICES_PER_SECTOR; vertex += 1) {
      const nextVertex = (vertex + 1) % VERTICES_PER_SECTOR;
      const baseVertex = base.slice(
        vertex * VALUES_PER_VERTEX,
        (vertex + 1) * VALUES_PER_VERTEX
      );
      const baseNext = base.slice(
        nextVertex * VALUES_PER_VERTEX,
        (nextVertex + 1) * VALUES_PER_VERTEX
      );
      const topVertex = top.slice(
        vertex * VALUES_PER_VERTEX,
        (vertex + 1) * VALUES_PER_VERTEX
      );
      const topNext = top.slice(
        nextVertex * VALUES_PER_VERTEX,
        (nextVertex + 1) * VALUES_PER_VERTEX
      );

      sidePositions.push(
        ...baseVertex,
        ...baseNext,
        ...topNext,
        ...baseVertex,
        ...topNext,
        ...topVertex
      );
      sideSectorIds.push(sectorId, sectorId);
    }
  });

  const createGeometry = (positions: number[]) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, VALUES_PER_VERTEX)
    );
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  };

  return {
    tops: createGeometry(topData.positions),
    sides: createGeometry(sidePositions),
    topSectorIds: topData.faceSectorIds,
    sideSectorIds,
  };
}

function clipToBarycentricMinimum(
  polygon: BarycentricPoint[],
  coordinate: number,
  minimum: number
): BarycentricPoint[] {
  const clipped: BarycentricPoint[] = [];

  polygon.forEach((current, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const currentInside = current.weights[coordinate] >= minimum;
    const nextInside = next.weights[coordinate] >= minimum;

    if (currentInside) {
      clipped.push(current);
    }

    if (currentInside !== nextInside) {
      const amount =
        (minimum - current.weights[coordinate]) /
        (next.weights[coordinate] - current.weights[coordinate]);
      clipped.push({
        weights: current.weights.map(
          (weight, weightIndex) =>
            weight + (next.weights[weightIndex] - weight) * amount
        ) as [number, number, number],
      });
    }
  });

  return clipped;
}

function interpolateTriangle(
  triangle: number[],
  point: BarycentricPoint
): number[] {
  return Array.from({ length: VALUES_PER_VERTEX }, (_, coordinate) =>
    point.weights.reduce(
      (value, weight, vertex) =>
        value + triangle[vertex * VALUES_PER_VERTEX + coordinate] * weight,
      0
    )
  );
}

function separatedSectorData(
  sectorIds: number[],
  sectorGroups: number[][],
  padding: number,
  radius: number,
  heights?: ReadonlyMap<number, number>
): { positions: number[]; faceSectorIds: number[] } {
  if (padding < 0 || padding >= 1 / 3) {
    throw new RangeError('Sector owner padding must be between 0 and 1/3');
  }

  const edges = new Map<string, Edge>();

  sectorGroups.forEach((groupSectorIds, ownerGroupIndex) => {
    const positions = extractSectorPositions(groupSectorIds, radius);

    for (
      let triangleOffset = 0;
      triangleOffset < positions.length;
      triangleOffset += VALUES_PER_SECTOR
    ) {
      const triangle = Array.from(
        positions.slice(triangleOffset, triangleOffset + VALUES_PER_SECTOR)
      );

      for (let vertex = 0; vertex < VERTICES_PER_SECTOR; vertex += 1) {
        const nextVertex = (vertex + 1) % VERTICES_PER_SECTOR;
        const edgePositions = [
          ...triangle.slice(
            vertex * VALUES_PER_VERTEX,
            (vertex + 1) * VALUES_PER_VERTEX
          ),
          ...triangle.slice(
            nextVertex * VALUES_PER_VERTEX,
            (nextVertex + 1) * VALUES_PER_VERTEX
          ),
        ];
        const key = edgeKey(edgePositions);
        const ownership = edges.get(key)?.ownership ?? [];
        ownership.push({
          sectorId: groupSectorIds[triangleOffset / VALUES_PER_SECTOR],
          oppositeVertex: (vertex + 2) % VERTICES_PER_SECTOR,
          ownerGroupIndex,
        });
        edges.set(key, { ownership });
      }
    }
  });

  const paddedEdges = new Map<number, Set<number>>();
  edges.forEach(({ ownership }) => {
    if (
      ownership.length !== 2 ||
      ownership[0].ownerGroupIndex === ownership[1].ownerGroupIndex
    ) {
      return;
    }

    ownership.forEach(({ sectorId, oppositeVertex }) => {
      const vertices = paddedEdges.get(sectorId) ?? new Set<number>();
      vertices.add(oppositeVertex);
      paddedEdges.set(sectorId, vertices);
    });
  });

  const positions: number[] = [];
  const faceSectorIds: number[] = [];

  sectorIds.forEach((sectorId) => {
    const triangle = heights
      ? raisedTrianglePositions(sectorId, heights.get(sectorId) ?? 0, radius)
          .top
      : Array.from(extractSectorPositions([sectorId], radius));
    const edgesToPad = paddedEdges.get(sectorId);

    if (!edgesToPad || edgesToPad.size === 0) {
      positions.push(...triangle);
      faceSectorIds.push(sectorId);
      return;
    }

    let polygon: BarycentricPoint[] = [
      { weights: [1, 0, 0] },
      { weights: [0, 1, 0] },
      { weights: [0, 0, 1] },
    ];
    edgesToPad.forEach((oppositeVertex) => {
      polygon = clipToBarycentricMinimum(polygon, oppositeVertex, padding);
    });

    for (let index = 1; index < polygon.length - 1; index += 1) {
      positions.push(
        ...interpolateTriangle(triangle, polygon[0]),
        ...interpolateTriangle(triangle, polygon[index]),
        ...interpolateTriangle(triangle, polygon[index + 1])
      );
      faceSectorIds.push(sectorId);
    }
  });

  return { positions, faceSectorIds };
}

export function createSeparatedSectorSetGeometry(
  sectorIds: number[],
  sectorGroups: number[][],
  padding = DISTINCT_OWNER_SEAM / 2,
  radius = CORE_RADIUS
): THREE.BufferGeometry {
  const { positions } = separatedSectorData(
    sectorIds,
    sectorGroups,
    padding,
    radius
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, VALUES_PER_VERTEX)
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
