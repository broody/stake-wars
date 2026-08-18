import * as THREE from 'three';
import {
  SECTOR_COUNT,
  CORE_RADIUS,
  extractSectorPositions,
  isSectorId,
} from './sectorGeometry';

export const EXAMPLE_IMAGE_ATLAS_CELL_SIZE = 64;
export const EXAMPLE_IMAGE_ATLAS_COLUMNS = 64;
export const EXAMPLE_IMAGE_ATLAS_ROWS = Math.ceil(
  SECTOR_COUNT / EXAMPLE_IMAGE_ATLAS_COLUMNS
);
export const EXAMPLE_IMAGE_ATLAS_WIDTH =
  EXAMPLE_IMAGE_ATLAS_CELL_SIZE * EXAMPLE_IMAGE_ATLAS_COLUMNS;
export const EXAMPLE_IMAGE_ATLAS_HEIGHT =
  EXAMPLE_IMAGE_ATLAS_CELL_SIZE * EXAMPLE_IMAGE_ATLAS_ROWS;
export const EXAMPLE_IMAGE_ATLAS_GPU_BYTES =
  EXAMPLE_IMAGE_ATLAS_WIDTH * EXAMPLE_IMAGE_ATLAS_HEIGHT * 4;
export const EXAMPLE_IMAGE_DETAIL_SIZE = 512;
export const EXAMPLE_IMAGE_DETAIL_GPU_BYTES =
  EXAMPLE_IMAGE_DETAIL_SIZE * EXAMPLE_IMAGE_DETAIL_SIZE * 4;

const ATLAS_CELL_PADDING = 3;
const IMAGE_TRIANGLE_INSET = 0.08;
const IMAGE_SURFACE_RADIUS = CORE_RADIUS * 1.008;
const VALUES_PER_VERTEX = 3;
const VERTICES_PER_SECTOR = 3;

const ART_PALETTES = [
  ['#111827', '#f8fafc', '#ef4444'],
  ['#172554', '#fef3c7', '#38bdf8'],
  ['#3f0d12', '#fde68a', '#fb7185'],
  ['#052e2b', '#d1fae5', '#f59e0b'],
  ['#2e1065', '#f3e8ff', '#22d3ee'],
  ['#292524', '#f5f5f4', '#f97316'],
] as const;

let cachedAtlasTexture: THREE.CanvasTexture | null = null;

function mixedHash(value: number): number {
  let hash = value >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function selectExampleImageSectorIds(
  ownerBySector: readonly number[],
  requestedCount: number,
  seed: number
): number[] {
  const count = Number.isFinite(requestedCount)
    ? Math.max(0, Math.floor(requestedCount))
    : 0;

  return ownerBySector
    .flatMap((owner, sectorId) => (owner >= 0 ? [sectorId] : []))
    .sort(
      (left, right) =>
        mixedHash(left ^ seed) - mixedHash(right ^ seed) || left - right
    )
    .slice(0, count);
}

function atlasUv(
  sectorId: number,
  horizontal: number,
  vertical: number
): [number, number] {
  if (!isSectorId(sectorId)) {
    throw new RangeError(`Invalid Sector ID: ${sectorId}`);
  }

  const column = sectorId % EXAMPLE_IMAGE_ATLAS_COLUMNS;
  const row = Math.floor(sectorId / EXAMPLE_IMAGE_ATLAS_COLUMNS);
  const usableSize = EXAMPLE_IMAGE_ATLAS_CELL_SIZE - ATLAS_CELL_PADDING * 2;

  return [
    (column * EXAMPLE_IMAGE_ATLAS_CELL_SIZE +
      ATLAS_CELL_PADDING +
      horizontal * usableSize) /
      EXAMPLE_IMAGE_ATLAS_WIDTH,
    (row * EXAMPLE_IMAGE_ATLAS_CELL_SIZE +
      ATLAS_CELL_PADDING +
      vertical * usableSize) /
      EXAMPLE_IMAGE_ATLAS_HEIGHT,
  ];
}

export function createExampleImageGeometry(
  sectorIds: readonly number[],
  heights: ReadonlyMap<number, number>
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];

  sectorIds.forEach((sectorId) => {
    const triangle = Array.from(
      extractSectorPositions([sectorId], IMAGE_SURFACE_RADIUS)
    );
    const height = heights.get(sectorId) ?? 0;
    if (!Number.isFinite(height) || height < 0) {
      throw new RangeError(`Invalid Sector height: ${height}`);
    }

    const radialScale = (IMAGE_SURFACE_RADIUS + height) / IMAGE_SURFACE_RADIUS;
    const raisedTriangle = triangle.map((value) => value * radialScale);
    const centroid = Array.from({ length: VALUES_PER_VERTEX }, (_, axis) =>
      Array.from(
        { length: VERTICES_PER_SECTOR },
        (_, vertex) => raisedTriangle[vertex * VALUES_PER_VERTEX + axis]
      ).reduce((total, value) => total + value / VERTICES_PER_SECTOR, 0)
    );

    for (let vertex = 0; vertex < VERTICES_PER_SECTOR; vertex += 1) {
      for (let axis = 0; axis < VALUES_PER_VERTEX; axis += 1) {
        const value = raisedTriangle[vertex * VALUES_PER_VERTEX + axis];
        positions.push(
          centroid[axis] + (value - centroid[axis]) * (1 - IMAGE_TRIANGLE_INSET)
        );
      }
    }

    const localUvs: readonly [number, number][] = [
      [0.5, 1],
      [0, 0],
      [1, 0],
    ];
    localUvs.forEach(([horizontal, vertical]) => {
      uvs.push(...atlasUv(sectorId, horizontal, vertical));
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, VALUES_PER_VERTEX)
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createExampleDetailImageGeometry(
  sectorId: number,
  heights: ReadonlyMap<number, number>
): THREE.BufferGeometry {
  const geometry = createExampleImageGeometry([sectorId], heights);
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([0.5, 1, 0, 0, 1, 0], 2)
  );
  return geometry;
}

function drawExampleArtwork(
  context: CanvasRenderingContext2D,
  sectorId: number,
  left: number,
  top: number,
  size: number
) {
  const [background, foreground, accent] =
    ART_PALETTES[mixedHash(sectorId) % ART_PALETTES.length];
  const variant = mixedHash(sectorId + 97) % 4;

  context.save();
  context.beginPath();
  context.rect(left, top, size, size);
  context.clip();
  context.fillStyle = background;
  context.fillRect(left, top, size, size);

  context.translate(left + size / 2, top + size / 2);
  context.scale(
    size / EXAMPLE_IMAGE_ATLAS_CELL_SIZE,
    size / EXAMPLE_IMAGE_ATLAS_CELL_SIZE
  );
  context.rotate(((mixedHash(sectorId + 31) % 12) * Math.PI) / 24);
  context.lineWidth = 6;
  context.strokeStyle = foreground;
  context.fillStyle = accent;

  if (variant === 0) {
    for (let offset = -48; offset <= 48; offset += 16) {
      context.beginPath();
      context.moveTo(-48, offset);
      context.lineTo(48, offset + 24);
      context.stroke();
    }
  } else if (variant === 1) {
    context.fillRect(-34, -10, 68, 20);
    context.strokeRect(-20, -28, 40, 56);
  } else if (variant === 2) {
    context.beginPath();
    context.arc(0, 0, 23, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(0, 0, 12, 0, Math.PI * 2);
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(0, -34);
    context.lineTo(34, 28);
    context.lineTo(-34, 28);
    context.closePath();
    context.fill();
    context.stroke();
  }

  context.restore();
}

function configureCanvasTexture(
  texture: THREE.CanvasTexture,
  name: string
): THREE.CanvasTexture {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.name = name;
  return texture;
}

export function getExampleImageAtlasTexture(): THREE.CanvasTexture {
  if (cachedAtlasTexture) return cachedAtlasTexture;
  if (typeof document === 'undefined') {
    throw new Error('The example image atlas requires a browser document');
  }

  const canvas = document.createElement('canvas');
  canvas.width = EXAMPLE_IMAGE_ATLAS_WIDTH;
  canvas.height = EXAMPLE_IMAGE_ATLAS_HEIGHT;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Unable to create the image atlas canvas');

  for (let sectorId = 0; sectorId < SECTOR_COUNT; sectorId += 1) {
    const column = sectorId % EXAMPLE_IMAGE_ATLAS_COLUMNS;
    const row = Math.floor(sectorId / EXAMPLE_IMAGE_ATLAS_COLUMNS);
    drawExampleArtwork(
      context,
      sectorId,
      column * EXAMPLE_IMAGE_ATLAS_CELL_SIZE,
      row * EXAMPLE_IMAGE_ATLAS_CELL_SIZE,
      EXAMPLE_IMAGE_ATLAS_CELL_SIZE
    );
  }

  cachedAtlasTexture = configureCanvasTexture(
    new THREE.CanvasTexture(canvas),
    'Stake Wars example artwork atlas'
  );
  cachedAtlasTexture.generateMipmaps = false;
  cachedAtlasTexture.minFilter = THREE.LinearFilter;
  return cachedAtlasTexture;
}

export function createExampleDetailTexture(
  sectorId: number
): THREE.CanvasTexture {
  if (!isSectorId(sectorId)) {
    throw new RangeError(`Invalid Sector ID: ${sectorId}`);
  }
  if (typeof document === 'undefined') {
    throw new Error('The example detail texture requires a browser document');
  }

  const canvas = document.createElement('canvas');
  canvas.width = EXAMPLE_IMAGE_DETAIL_SIZE;
  canvas.height = EXAMPLE_IMAGE_DETAIL_SIZE;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Unable to create the detail texture canvas');

  drawExampleArtwork(context, sectorId, 0, 0, EXAMPLE_IMAGE_DETAIL_SIZE);
  const texture = configureCanvasTexture(
    new THREE.CanvasTexture(canvas),
    `Stake Wars example detail SECTOR-${sectorId}`
  );
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}
