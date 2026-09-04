import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { SectorArtwork } from '../types';
import {
  ARTWORK_DETAIL_DEMOTE_PHYSICAL_PX,
  ARTWORK_DETAIL_PROMOTE_PHYSICAL_PX,
  measureArtworkScreenSize,
  selectArtworkDetailIds,
  type ArtworkDetailCandidate,
} from './sectorArtworkLod';
import { SECTOR_COUNT, extractSectorPositions } from './sectorGeometry';

function candidate(
  id: string,
  physicalPixels: number,
  overrides: Partial<ArtworkDetailCandidate> = {}
): ArtworkDetailCandidate {
  return {
    id,
    physicalPixels,
    visible: true,
    priority: false,
    ...overrides,
  };
}

function artwork(sectorId: number): SectorArtwork {
  return {
    id: `artwork-${sectorId}`,
    network: 'SN_MAIN',
    ownerAddress: '0xabc',
    targets: [{ sectorId, ownershipGeneration: 1 }],
    placement: {
      projectorMatrix: Array.from({ length: 16 }, () => 0),
      centerX: 0,
      centerY: 0,
      scale: 1,
      rotation: 0,
      viewportAspect: 1,
      imageAspect: 1,
    },
    imageUrl: 'https://images.example/detail.webp',
    thumbnailUrl: 'https://images.example/thumbnail.webp',
    contentHash: 'hash',
    updatedAt: '2026-09-01T00:00:00Z',
  };
}

function sectorNearestZ(direction: 1 | -1): number {
  let result = 0;
  let best = -Infinity;
  for (let sectorId = 0; sectorId < SECTOR_COUNT; sectorId += 1) {
    const positions = extractSectorPositions([sectorId]);
    const z = ((positions[2] + positions[5] + positions[8]) / 3) * direction;
    if (z > best) {
      best = z;
      result = sectorId;
    }
  }
  return result;
}

function cameraAt(distance: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  camera.position.set(0, 0, distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

describe('artwork detail LOD selection', () => {
  it('promotes and demotes with separate screen-size thresholds', () => {
    expect(
      selectArtworkDetailIds(
        [
          candidate('below', ARTWORK_DETAIL_PROMOTE_PHYSICAL_PX - 1),
          candidate('promoted', ARTWORK_DETAIL_PROMOTE_PHYSICAL_PX),
        ],
        []
      )
    ).toEqual(['promoted']);

    expect(
      selectArtworkDetailIds(
        [
          candidate('retained', ARTWORK_DETAIL_DEMOTE_PHYSICAL_PX),
          candidate('demoted', ARTWORK_DETAIL_DEMOTE_PHYSICAL_PX - 1),
        ],
        ['retained', 'demoted']
      )
    ).toEqual(['retained']);
  });

  it('keeps priority artwork and enforces the texture budget', () => {
    const candidates = Array.from({ length: 10 }, (_, index) =>
      candidate(`artwork-${index}`, 500 - index)
    );
    candidates.push(
      candidate('selected', 0, { priority: true, visible: false })
    );

    const selected = selectArtworkDetailIds(candidates, [], 4);

    expect(selected).toHaveLength(4);
    expect(selected[0]).toBe('selected');
    expect(selected.slice(1)).toEqual(['artwork-0', 'artwork-1', 'artwork-2']);
  });
});

describe('artwork screen-space measurement', () => {
  const frontSectorId = sectorNearestZ(1);
  const backSectorId = sectorNearestZ(-1);
  const viewport = { width: 1_000, height: 1_000 };

  it('reports only artwork on the visible side of the Core', () => {
    expect(
      measureArtworkScreenSize(
        artwork(frontSectorId),
        new Map(),
        cameraAt(15),
        viewport
      )
    ).toMatchObject({ visible: true });
    expect(
      measureArtworkScreenSize(
        artwork(backSectorId),
        new Map(),
        cameraAt(15),
        viewport
      )
    ).toEqual({ visible: false, physicalPixels: 0 });
  });

  it('grows the measured footprint as the camera approaches', () => {
    const far = measureArtworkScreenSize(
      artwork(frontSectorId),
      new Map(),
      cameraAt(30),
      viewport
    );
    const near = measureArtworkScreenSize(
      artwork(frontSectorId),
      new Map(),
      cameraAt(8),
      viewport
    );

    expect(near.physicalPixels).toBeGreaterThan(far.physicalPixels);
  });
});
