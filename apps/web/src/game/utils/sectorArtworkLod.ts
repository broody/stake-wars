import * as THREE from 'three';
import type { SectorArtwork } from '../types';
import {
  CORE_RADIUS,
  SECTOR_COUNT,
  extractSectorPositions,
} from './sectorGeometry';

export const MAX_ARTWORK_DETAIL_TEXTURES = 8;
export const ARTWORK_DETAIL_PROMOTE_PHYSICAL_PX = 224;
export const ARTWORK_DETAIL_DEMOTE_PHYSICAL_PX = 160;

const IMAGE_SURFACE_RADIUS = CORE_RADIUS * 1.004;
const ACTIVE_DETAIL_RANK_BONUS_PX = 32;
const VALUES_PER_VERTEX = 3;
const VALUES_PER_SECTOR = 9;
const ALL_SECTOR_POSITIONS = extractSectorPositions(
  Array.from({ length: SECTOR_COUNT }, (_, sectorId) => sectorId),
  IMAGE_SURFACE_RADIUS
);

export interface ArtworkScreenMeasurement {
  visible: boolean;
  physicalPixels: number;
}

export interface ArtworkDetailCandidate extends ArtworkScreenMeasurement {
  id: string;
  priority: boolean;
}

interface ArtworkMeasurementScratch {
  cameraPosition: THREE.Vector3;
  centroid: THREE.Vector3;
  toCamera: THREE.Vector3;
  vertex: THREE.Vector3;
}

function measureArtworkScreenSizeWithScratch(
  artwork: SectorArtwork,
  heights: ReadonlyMap<number, number>,
  camera: THREE.Camera,
  viewport: { width: number; height: number },
  scratch: ArtworkMeasurementScratch
): ArtworkScreenMeasurement {
  const { cameraPosition, centroid, toCamera, vertex } = scratch;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  artwork.targets.forEach(({ sectorId }) => {
    const sectorOffset = sectorId * VALUES_PER_SECTOR;
    centroid
      .set(
        (ALL_SECTOR_POSITIONS[sectorOffset] +
          ALL_SECTOR_POSITIONS[sectorOffset + 3] +
          ALL_SECTOR_POSITIONS[sectorOffset + 6]) /
          3,
        (ALL_SECTOR_POSITIONS[sectorOffset + 1] +
          ALL_SECTOR_POSITIONS[sectorOffset + 4] +
          ALL_SECTOR_POSITIONS[sectorOffset + 7]) /
          3,
        (ALL_SECTOR_POSITIONS[sectorOffset + 2] +
          ALL_SECTOR_POSITIONS[sectorOffset + 5] +
          ALL_SECTOR_POSITIONS[sectorOffset + 8]) /
          3
      )
      .multiplyScalar(
        (IMAGE_SURFACE_RADIUS + (heights.get(sectorId) ?? 0)) /
          IMAGE_SURFACE_RADIUS
      );
    toCamera.copy(cameraPosition).sub(centroid);
    if (centroid.dot(toCamera) <= 0) return;

    const radialScale = centroid.length() / IMAGE_SURFACE_RADIUS;
    for (
      let offset = sectorOffset;
      offset < sectorOffset + VALUES_PER_SECTOR;
      offset += VALUES_PER_VERTEX
    ) {
      vertex
        .set(
          ALL_SECTOR_POSITIONS[offset],
          ALL_SECTOR_POSITIONS[offset + 1],
          ALL_SECTOR_POSITIONS[offset + 2]
        )
        .multiplyScalar(radialScale)
        .project(camera);
      minX = Math.min(minX, vertex.x);
      maxX = Math.max(maxX, vertex.x);
      minY = Math.min(minY, vertex.y);
      maxY = Math.max(maxY, vertex.y);
    }
  });

  const visible =
    Number.isFinite(minX) && maxX >= -1 && minX <= 1 && maxY >= -1 && minY <= 1;
  if (!visible) return { visible: false, physicalPixels: 0 };

  const width =
    ((THREE.MathUtils.clamp(maxX, -1, 1) - THREE.MathUtils.clamp(minX, -1, 1)) /
      2) *
    viewport.width;
  const height =
    ((THREE.MathUtils.clamp(maxY, -1, 1) - THREE.MathUtils.clamp(minY, -1, 1)) /
      2) *
    viewport.height;
  return {
    visible: true,
    physicalPixels: Math.max(width, height),
  };
}

export function measureArtworkScreenSize(
  artwork: SectorArtwork,
  heights: ReadonlyMap<number, number>,
  camera: THREE.Camera,
  viewport: { width: number; height: number }
): ArtworkScreenMeasurement {
  camera.updateMatrixWorld(true);
  const scratch: ArtworkMeasurementScratch = {
    cameraPosition: camera.getWorldPosition(new THREE.Vector3()),
    centroid: new THREE.Vector3(),
    toCamera: new THREE.Vector3(),
    vertex: new THREE.Vector3(),
  };
  return measureArtworkScreenSizeWithScratch(
    artwork,
    heights,
    camera,
    viewport,
    scratch
  );
}

export function measureArtworkDetailCandidates(
  artworks: readonly SectorArtwork[],
  priorityArtworkIds: ReadonlySet<string>,
  heights: ReadonlyMap<number, number>,
  camera: THREE.Camera,
  viewport: { width: number; height: number }
): ArtworkDetailCandidate[] {
  camera.updateMatrixWorld(true);
  const scratch: ArtworkMeasurementScratch = {
    cameraPosition: camera.getWorldPosition(new THREE.Vector3()),
    centroid: new THREE.Vector3(),
    toCamera: new THREE.Vector3(),
    vertex: new THREE.Vector3(),
  };
  return artworks.map((artwork) => ({
    id: artwork.id,
    priority: priorityArtworkIds.has(artwork.id),
    ...measureArtworkScreenSizeWithScratch(
      artwork,
      heights,
      camera,
      viewport,
      scratch
    ),
  }));
}

export function selectArtworkDetailIds(
  candidates: readonly ArtworkDetailCandidate[],
  activeIds: readonly string[],
  maximum = MAX_ARTWORK_DETAIL_TEXTURES
): string[] {
  const activeIdSet = new Set(activeIds);
  return candidates
    .filter((candidate) => {
      if (candidate.priority) return true;
      if (!candidate.visible) return false;
      return (
        candidate.physicalPixels >=
        (activeIdSet.has(candidate.id)
          ? ARTWORK_DETAIL_DEMOTE_PHYSICAL_PX
          : ARTWORK_DETAIL_PROMOTE_PHYSICAL_PX)
      );
    })
    .sort((first, second) => {
      if (first.priority !== second.priority) {
        return first.priority ? -1 : 1;
      }
      const firstRank =
        first.physicalPixels +
        (activeIdSet.has(first.id) ? ACTIVE_DETAIL_RANK_BONUS_PX : 0);
      const secondRank =
        second.physicalPixels +
        (activeIdSet.has(second.id) ? ACTIVE_DETAIL_RANK_BONUS_PX : 0);
      return secondRank - firstRank || first.id.localeCompare(second.id);
    })
    .slice(0, Math.max(0, maximum))
    .map((candidate) => candidate.id);
}
