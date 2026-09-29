import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { SectorArtwork } from '../types';
import {
  artworkAtlasSourceKey,
  artworkAtlasSourcesFromKey,
  createProjectedArtworkGeometry,
  suggestedPlacement,
  type ArtworkAtlasSlot,
} from './sectorArtworkProjection';

function artwork(thumbnailUrl: string): SectorArtwork {
  return {
    id: 'artwork-1',
    network: 'SN_MAIN',
    ownerAddress: '0xabc',
    targets: [{ sectorId: 1977, ownershipGeneration: 1 }],
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
    thumbnailUrl,
    contentHash: 'hash',
    updatedAt: '2026-08-31T00:00:00Z',
  };
}

describe('artwork atlas source key', () => {
  it('stays stable when RPC-derived artwork objects are recreated', () => {
    const first: ArtworkAtlasSlot[] = [
      {
        artwork: artwork('https://images.example/thumb.webp'),
        column: 0,
        row: 0,
      },
    ];
    const recreated: ArtworkAtlasSlot[] = [
      {
        artwork: {
          ...first[0].artwork,
          targets: [...first[0].artwork.targets],
        },
        column: 0,
        row: 0,
      },
    ];

    expect(artworkAtlasSourceKey(recreated)).toBe(artworkAtlasSourceKey(first));
  });

  it('changes when the thumbnail or atlas placement changes', () => {
    const original: ArtworkAtlasSlot[] = [
      {
        artwork: artwork('https://images.example/one.webp'),
        column: 0,
        row: 0,
      },
    ];
    const changed: ArtworkAtlasSlot[] = [
      {
        artwork: artwork('https://images.example/two.webp'),
        column: 1,
        row: 0,
      },
    ];

    expect(artworkAtlasSourceKey(changed)).not.toBe(
      artworkAtlasSourceKey(original)
    );
    expect(artworkAtlasSourcesFromKey(artworkAtlasSourceKey(changed))).toEqual([
      {
        thumbnailUrl: 'https://images.example/two.webp',
        column: 1,
        row: 0,
      },
    ]);
  });

  it('carries the source aspect ratio into projected geometry', () => {
    const rectangular = artwork('https://images.example/wide.webp');
    rectangular.placement.imageAspect = 1.75;
    const geometry = createProjectedArtworkGeometry(
      [{ artwork: rectangular, column: 0, row: 0 }],
      new Map(),
      1,
      1
    );

    expect(geometry.getAttribute('imageAspect').getX(0)).toBeCloseTo(1.75);
    geometry.dispose();
  });

  it('marks art on Sectors that can flip away', () => {
    const shared = artwork('https://images.example/shared.webp');
    shared.targets = [
      { sectorId: 1977, ownershipGeneration: 1 },
      { sectorId: 1978, ownershipGeneration: 1 },
    ];
    const slots = [{ artwork: shared, column: 0, row: 0 }];
    const concealable = (hiddenSectorIds?: ReadonlySet<number>) => {
      const geometry = createProjectedArtworkGeometry(
        slots,
        new Map(),
        1,
        1,
        0,
        hiddenSectorIds
      );
      const values = Array.from(
        geometry.getAttribute('concealable').array as Float32Array
      );
      geometry.dispose();
      return values;
    };

    expect(concealable(new Set([1978]))).toEqual([0, 0, 0, 1, 1, 1]);
    expect(concealable()).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('raises art onto relief without moving its projection', () => {
    const shared = artwork('https://images.example/shared.webp');
    shared.targets = [
      { sectorId: 1977, ownershipGeneration: 1 },
      { sectorId: 1978, ownershipGeneration: 1 },
    ];
    const slots = [{ artwork: shared, column: 0, row: 0 }];
    const flat = createProjectedArtworkGeometry(slots, new Map(), 1, 1);
    const raised = createProjectedArtworkGeometry(
      slots,
      new Map(),
      1,
      1,
      0,
      undefined,
      new Map([[1978, 0.5]])
    );
    const surfaceRadius = new THREE.Vector3()
      .fromBufferAttribute(raised.getAttribute('position'), 0)
      .length();

    expect(
      Array.from(raised.getAttribute('reliefScale').array as Float32Array)
    ).toEqual(
      [1, 1, 1, ...Array(3).fill((surfaceRadius + 0.5) / surfaceRadius)].map(
        Math.fround
      )
    );
    expect(raised.getAttribute('position').array).toEqual(
      flat.getAttribute('position').array
    );
    expect(raised.getAttribute('projectorClip').array).toEqual(
      flat.getAttribute('projectorClip').array
    );
    expect(Array.from(flat.getAttribute('reliefScale').array)).toEqual(
      Array(6).fill(1)
    );
    expect(raised.boundingSphere!.radius).toBeCloseTo(
      flat.boundingSphere!.radius + 0.5
    );
    flat.dispose();
    raised.dispose();
  });

  it('fits a wide image to the same selected surface at a lower height', () => {
    const projectorMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const square = suggestedPlacement(projectorMatrix, 10, 1, [1977]);
    const wide = suggestedPlacement(projectorMatrix, 10, 2, [1977]);

    expect(wide.imageAspect).toBe(2);
    expect(wide.scale).toBeLessThan(square.scale);
  });
});
