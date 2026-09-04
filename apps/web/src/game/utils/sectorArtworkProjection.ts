import * as THREE from 'three';
import type { ArtworkPlacement, SectorArtwork } from '../types';
import { CORE_RADIUS, extractSectorPositions } from './sectorGeometry';

const IMAGE_SURFACE_RADIUS = CORE_RADIUS * 1.004;
const VALUES_PER_VERTEX = 3;

export interface ArtworkAtlasSlot {
  artwork: SectorArtwork;
  column: number;
  row: number;
}

export interface ArtworkAtlasSource {
  thumbnailUrl: string;
  column: number;
  row: number;
}

export function artworkAtlasSourceKey(
  slots: readonly ArtworkAtlasSlot[]
): string {
  return JSON.stringify(
    slots.map(({ artwork, column, row }) => ({
      thumbnailUrl: artwork.thumbnailUrl,
      column,
      row,
    }))
  );
}

export function artworkAtlasSourcesFromKey(key: string): ArtworkAtlasSource[] {
  return JSON.parse(key) as ArtworkAtlasSource[];
}

export function createProjectedArtworkGeometry(
  slots: readonly ArtworkAtlasSlot[],
  heights: ReadonlyMap<number, number>,
  columns: number,
  rows: number,
  paddingFraction = 0
): THREE.BufferGeometry {
  const positions: number[] = [];
  const projectorClips: number[] = [];
  const placements: number[] = [];
  const aspects: number[] = [];
  const imageAspects: number[] = [];
  const atlasRects: number[] = [];
  const sectorCenters: number[] = [];
  const position = new THREE.Vector3();
  const sectorCenter = new THREE.Vector3();
  const clip = new THREE.Vector4();

  slots.forEach(({ artwork, column, row }) => {
    const projector = new THREE.Matrix4().fromArray(
      artwork.placement.projectorMatrix
    );
    const cellWidth = 1 / columns;
    const cellHeight = 1 / rows;
    const left = column * cellWidth + cellWidth * paddingFraction;
    const bottom = 1 - (row + 1) * cellHeight + cellHeight * paddingFraction;
    const width = cellWidth * (1 - paddingFraction * 2);
    const height = cellHeight * (1 - paddingFraction * 2);

    artwork.targets.forEach(({ sectorId }) => {
      const raw = extractSectorPositions([sectorId], IMAGE_SURFACE_RADIUS);
      sectorCenter
        .set(
          (raw[0] + raw[3] + raw[6]) / 3,
          (raw[1] + raw[4] + raw[7]) / 3,
          (raw[2] + raw[5] + raw[8]) / 3
        )
        .normalize();
      const radialScale =
        (IMAGE_SURFACE_RADIUS + (heights.get(sectorId) ?? 0)) /
        IMAGE_SURFACE_RADIUS;
      for (let offset = 0; offset < raw.length; offset += VALUES_PER_VERTEX) {
        position
          .set(raw[offset], raw[offset + 1], raw[offset + 2])
          .multiplyScalar(radialScale);
        positions.push(position.x, position.y, position.z);
        clip.set(position.x, position.y, position.z, 1).applyMatrix4(projector);
        projectorClips.push(clip.x, clip.y, clip.w);
        placements.push(
          artwork.placement.centerX,
          artwork.placement.centerY,
          artwork.placement.scale,
          artwork.placement.rotation
        );
        aspects.push(artwork.placement.viewportAspect);
        imageAspects.push(artwork.placement.imageAspect ?? 1);
        atlasRects.push(left, bottom, width, height);
        sectorCenters.push(sectorCenter.x, sectorCenter.y, sectorCenter.z);
      }
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute(
    'projectorClip',
    new THREE.Float32BufferAttribute(projectorClips, 3)
  );
  geometry.setAttribute(
    'placement',
    new THREE.Float32BufferAttribute(placements, 4)
  );
  geometry.setAttribute(
    'viewportAspect',
    new THREE.Float32BufferAttribute(aspects, 1)
  );
  geometry.setAttribute(
    'imageAspect',
    new THREE.Float32BufferAttribute(imageAspects, 1)
  );
  geometry.setAttribute(
    'atlasRect',
    new THREE.Float32BufferAttribute(atlasRects, 4)
  );
  geometry.setAttribute(
    'sectorCenter',
    new THREE.Float32BufferAttribute(sectorCenters, 3)
  );
  geometry.computeBoundingSphere();
  return geometry;
}

export function artworkForSector(
  artworks: readonly SectorArtwork[],
  sectorId: number
): SectorArtwork | null {
  return (
    artworks.find((artwork) =>
      artwork.targets.some((target) => target.sectorId === sectorId)
    ) ?? null
  );
}

export function suggestedPlacement(
  projectorMatrix: readonly number[],
  viewportAspect: number,
  imageAspect: number,
  sectorIds: readonly number[]
): ArtworkPlacement {
  const projector = new THREE.Matrix4().fromArray([...projectorMatrix]);
  const clip = new THREE.Vector4();
  const positions = extractSectorPositions(
    [...sectorIds],
    IMAGE_SURFACE_RADIUS
  );
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let offset = 0; offset < positions.length; offset += 3) {
    clip
      .set(positions[offset], positions[offset + 1], positions[offset + 2], 1)
      .applyMatrix4(projector);
    if (clip.w <= 0) continue;
    const x = clip.x / clip.w;
    const y = clip.y / clip.w;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) {
    minX = -0.2;
    maxX = 0.2;
    minY = -0.2;
    maxY = 0.2;
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const halfExtent = Math.max(
    ((maxX - minX) * viewportAspect) / (2 * imageAspect),
    (maxY - minY) / 2
  );
  return {
    projectorMatrix: [...projectorMatrix],
    centerX,
    centerY,
    scale: THREE.MathUtils.clamp(halfExtent * 1.12, 0.08, 1.8),
    rotation: 0,
    viewportAspect,
    imageAspect,
  };
}
