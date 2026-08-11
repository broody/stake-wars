import * as THREE from 'three';

export const CONTROL_POINT_COUNT = 2_000;
export const CONTROL_POINT_DETAIL = 9;
export const CORE_RADIUS = 5;

const VERTICES_PER_CONTROL_POINT = 3;
const VALUES_PER_VERTEX = 3;
const VALUES_PER_CONTROL_POINT = VERTICES_PER_CONTROL_POINT * VALUES_PER_VERTEX;

interface Triangle {
  key: string;
  positions: number[];
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

export function isControlPointId(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < CONTROL_POINT_COUNT;
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
