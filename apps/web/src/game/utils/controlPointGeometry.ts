import * as THREE from 'three';

export const CONTROL_POINT_COUNT = 2_000;
export const CONTROL_POINT_DETAIL = 9;
export const CORE_RADIUS = 5;

const VERTICES_PER_CONTROL_POINT = 3;
const VALUES_PER_VERTEX = 3;
const VALUES_PER_CONTROL_POINT = VERTICES_PER_CONTROL_POINT * VALUES_PER_VERTEX;
const DISTINCT_OWNER_SEAM = 0.05;

interface Triangle {
  key: string;
  positions: number[];
}

interface OwnershipEdge {
  controlPointId: number;
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
  const vertices = Array.from({ length: VERTICES_PER_CONTROL_POINT }, (_, i) =>
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
  const source = new THREE.IcosahedronGeometry(1, CONTROL_POINT_DETAIL);
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

  if (triangles.length !== CONTROL_POINT_COUNT) {
    throw new Error(
      `Expected ${CONTROL_POINT_COUNT} Control Points, received ${triangles.length}`
    );
  }

  return Float32Array.from(triangles.flatMap(({ positions }) => positions));
}

// IDs are the array indexes after sorting triangles by their vertex coordinates.
// This makes IDs deterministic even if Three.js changes its triangle traversal order.
const CANONICAL_UNIT_POSITIONS = createCanonicalUnitPositions();

function createControlPointNeighborMap(): readonly (readonly number[])[] {
  const edgeControlPoints = new Map<string, number[]>();

  for (
    let controlPointId = 0;
    controlPointId < CONTROL_POINT_COUNT;
    controlPointId += 1
  ) {
    const triangleOffset = controlPointId * VALUES_PER_CONTROL_POINT;
    const triangle = Array.from(
      CANONICAL_UNIT_POSITIONS.slice(
        triangleOffset,
        triangleOffset + VALUES_PER_CONTROL_POINT
      )
    );

    for (let vertex = 0; vertex < VERTICES_PER_CONTROL_POINT; vertex += 1) {
      const nextVertex = (vertex + 1) % VERTICES_PER_CONTROL_POINT;
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
      const owners = edgeControlPoints.get(key) ?? [];
      owners.push(controlPointId);
      edgeControlPoints.set(key, owners);
    }
  }

  const neighbors = Array.from(
    { length: CONTROL_POINT_COUNT },
    () => new Set<number>()
  );
  edgeControlPoints.forEach((owners) => {
    if (owners.length !== 2) return;
    neighbors[owners[0]].add(owners[1]);
    neighbors[owners[1]].add(owners[0]);
  });

  return neighbors.map((controlPointIds) =>
    Object.freeze([...controlPointIds].sort((left, right) => left - right))
  );
}

const CONTROL_POINT_NEIGHBORS = createControlPointNeighborMap();

export function isControlPointId(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < CONTROL_POINT_COUNT;
}

export function adjacentControlPointIds(
  controlPointId: number
): readonly number[] {
  if (!isControlPointId(controlPointId)) {
    throw new RangeError(`Invalid Control Point ID: ${controlPointId}`);
  }
  return CONTROL_POINT_NEIGHBORS[controlPointId];
}

export function createControlPointGeometry(
  radius = CORE_RADIUS
): THREE.BufferGeometry {
  const positions = CANONICAL_UNIT_POSITIONS.map((value) => value * radius);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function extractControlPointPositions(
  controlPointIds: number[],
  radius = CORE_RADIUS
): Float32Array {
  const positions = new Float32Array(
    controlPointIds.length * VALUES_PER_CONTROL_POINT
  );

  controlPointIds.forEach((controlPointId, resultIndex) => {
    if (!isControlPointId(controlPointId)) {
      throw new RangeError(`Invalid Control Point ID: ${controlPointId}`);
    }

    const sourceOffset = controlPointId * VALUES_PER_CONTROL_POINT;
    const resultOffset = resultIndex * VALUES_PER_CONTROL_POINT;

    for (let value = 0; value < VALUES_PER_CONTROL_POINT; value += 1) {
      positions[resultOffset + value] =
        CANONICAL_UNIT_POSITIONS[sourceOffset + value] * radius;
    }
  });

  return positions;
}

export function createSingleControlPointGeometry(
  controlPointId: number,
  radius = CORE_RADIUS
): THREE.BufferGeometry {
  return createControlPointSetGeometry([controlPointId], radius);
}

export function createControlPointSetGeometry(
  controlPointIds: number[],
  radius = CORE_RADIUS
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      extractControlPointPositions(controlPointIds, radius),
      3
    )
  );
  geometry.computeVertexNormals();
  return geometry;
}

export function createControlPointBoundaryGeometry(
  controlPointIds: number[],
  heights?: ReadonlyMap<number, number>,
  radius = CORE_RADIUS
): THREE.BufferGeometry {
  const boundaryEdges = new Map<string, number[]>();

  [...new Set(controlPointIds)].forEach((controlPointId) => {
    const { base, top } = raisedTrianglePositions(
      controlPointId,
      heights?.get(controlPointId) ?? 0,
      radius
    );

    for (let vertex = 0; vertex < VERTICES_PER_CONTROL_POINT; vertex += 1) {
      const nextVertex = (vertex + 1) % VERTICES_PER_CONTROL_POINT;
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

      if (boundaryEdges.has(key)) {
        boundaryEdges.delete(key);
        continue;
      }

      boundaryEdges.set(key, [
        ...top.slice(
          vertex * VALUES_PER_VERTEX,
          (vertex + 1) * VALUES_PER_VERTEX
        ),
        ...top.slice(
          nextVertex * VALUES_PER_VERTEX,
          (nextVertex + 1) * VALUES_PER_VERTEX
        ),
      ]);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [...boundaryEdges.values()].flat(),
      VALUES_PER_VERTEX
    )
  );
  geometry.computeBoundingSphere();
  return geometry;
}

function raisedTrianglePositions(
  controlPointId: number,
  height: number,
  radius: number
): { base: number[]; top: number[] } {
  if (!Number.isFinite(height) || height < 0) {
    throw new RangeError(`Invalid Control Point height: ${height}`);
  }
  const base = Array.from(
    extractControlPointPositions([controlPointId], radius)
  );
  const topRadius = radius + height;
  const top = base.map((value) => value * (topRadius / radius));
  return { base, top };
}

export function createRaisedControlPointSetGeometry(
  controlPointIds: number[],
  heights: ReadonlyMap<number, number>,
  radius = CORE_RADIUS
): THREE.BufferGeometry {
  const positions = controlPointIds.flatMap(
    (controlPointId) =>
      raisedTrianglePositions(
        controlPointId,
        heights.get(controlPointId) ?? 0,
        radius
      ).top
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

export function createExtrudedControlPointGeometries(
  controlPointIds: number[],
  heights: ReadonlyMap<number, number>,
  radius = CORE_RADIUS,
  controlPointGroups?: number[][]
): {
  tops: THREE.BufferGeometry;
  sides: THREE.BufferGeometry;
  topControlPointIds: number[];
  sideControlPointIds: number[];
} {
  const sidePositions: number[] = [];
  const sideControlPointIds: number[] = [];

  const topData = controlPointGroups
    ? separatedControlPointData(
        controlPointIds,
        controlPointGroups,
        DISTINCT_OWNER_SEAM / 2,
        radius,
        heights
      )
    : {
        positions: controlPointIds.flatMap(
          (controlPointId) =>
            raisedTrianglePositions(
              controlPointId,
              heights.get(controlPointId) ?? 0,
              radius
            ).top
        ),
        faceControlPointIds: [...controlPointIds],
      };

  controlPointIds.forEach((controlPointId) => {
    const height = heights.get(controlPointId) ?? 0;
    const { base, top } = raisedTrianglePositions(
      controlPointId,
      height,
      radius
    );
    if (height === 0) return;

    for (let vertex = 0; vertex < VERTICES_PER_CONTROL_POINT; vertex += 1) {
      const nextVertex = (vertex + 1) % VERTICES_PER_CONTROL_POINT;
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
      sideControlPointIds.push(controlPointId, controlPointId);
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
    topControlPointIds: topData.faceControlPointIds,
    sideControlPointIds,
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

function separatedControlPointData(
  controlPointIds: number[],
  controlPointGroups: number[][],
  padding: number,
  radius: number,
  heights?: ReadonlyMap<number, number>
): { positions: number[]; faceControlPointIds: number[] } {
  if (padding < 0 || padding >= 1 / 3) {
    throw new RangeError(
      'Control Point owner padding must be between 0 and 1/3'
    );
  }

  const edges = new Map<string, Edge>();

  controlPointGroups.forEach((groupControlPointIds, ownerGroupIndex) => {
    const positions = extractControlPointPositions(
      groupControlPointIds,
      radius
    );

    for (
      let triangleOffset = 0;
      triangleOffset < positions.length;
      triangleOffset += VALUES_PER_CONTROL_POINT
    ) {
      const triangle = Array.from(
        positions.slice(
          triangleOffset,
          triangleOffset + VALUES_PER_CONTROL_POINT
        )
      );

      for (let vertex = 0; vertex < VERTICES_PER_CONTROL_POINT; vertex += 1) {
        const nextVertex = (vertex + 1) % VERTICES_PER_CONTROL_POINT;
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
          controlPointId:
            groupControlPointIds[triangleOffset / VALUES_PER_CONTROL_POINT],
          oppositeVertex: (vertex + 2) % VERTICES_PER_CONTROL_POINT,
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

    ownership.forEach(({ controlPointId, oppositeVertex }) => {
      const vertices = paddedEdges.get(controlPointId) ?? new Set<number>();
      vertices.add(oppositeVertex);
      paddedEdges.set(controlPointId, vertices);
    });
  });

  const positions: number[] = [];
  const faceControlPointIds: number[] = [];

  controlPointIds.forEach((controlPointId) => {
    const triangle = heights
      ? raisedTrianglePositions(
          controlPointId,
          heights.get(controlPointId) ?? 0,
          radius
        ).top
      : Array.from(extractControlPointPositions([controlPointId], radius));
    const edgesToPad = paddedEdges.get(controlPointId);

    if (!edgesToPad || edgesToPad.size === 0) {
      positions.push(...triangle);
      faceControlPointIds.push(controlPointId);
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
      faceControlPointIds.push(controlPointId);
    }
  });

  return { positions, faceControlPointIds };
}

export function createSeparatedControlPointSetGeometry(
  controlPointIds: number[],
  controlPointGroups: number[][],
  padding = DISTINCT_OWNER_SEAM / 2,
  radius = CORE_RADIUS
): THREE.BufferGeometry {
  const { positions } = separatedControlPointData(
    controlPointIds,
    controlPointGroups,
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
