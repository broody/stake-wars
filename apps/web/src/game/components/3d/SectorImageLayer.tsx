import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { SectorArtwork } from '../../types';
import {
  createProjectedArtworkGeometry,
  type ArtworkAtlasSlot,
} from '../../utils/sectorArtworkProjection';

const ATLAS_CELL_SIZE = 256;
const ATLAS_MAX_COLUMNS = 16;
const ATLAS_PAGE_CAPACITY = 256;
const IMAGE_LOAD_CONCURRENCY = 16;

const vertexShader = `
  attribute vec3 projectorClip;
  attribute vec4 placement;
  attribute float viewportAspect;
  attribute vec4 atlasRect;
  varying vec3 vProjectorClip;
  varying vec4 vPlacement;
  varying float vViewportAspect;
  varying vec4 vAtlasRect;
  void main() {
    vProjectorClip = projectorClip;
    vPlacement = placement;
    vViewportAspect = viewportAspect;
    vAtlasRect = atlasRect;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D artworkMap;
  uniform float opacity;
  varying vec3 vProjectorClip;
  varying vec4 vPlacement;
  varying float vViewportAspect;
  varying vec4 vAtlasRect;
  void main() {
    if (vProjectorClip.z <= 0.0) discard;
    vec2 ndc = vProjectorClip.xy / vProjectorClip.z;
    vec2 delta = vec2(
      (ndc.x - vPlacement.x) * vViewportAspect,
      ndc.y - vPlacement.y
    );
    float c = cos(-vPlacement.w);
    float s = sin(-vPlacement.w);
    vec2 local = mat2(c, -s, s, c) * delta;
    vec2 uv = local / (2.0 * vPlacement.z) + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
    vec2 atlasUv = vAtlasRect.xy + uv * vAtlasRect.zw;
    vec4 color = texture2D(artworkMap, atlasUv);
    gl_FragColor = vec4(color.rgb, color.a * opacity);
  }
`;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${url}`));
    image.src = url;
  });
}

function useArtworkAtlas(
  slots: readonly ArtworkAtlasSlot[],
  columns: number,
  rows: number
) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    if (slots.length === 0) {
      setTexture(null);
      return;
    }
    let active = true;
    const canvas = document.createElement('canvas');
    canvas.width = columns * ATLAS_CELL_SIZE;
    canvas.height = rows * ATLAS_CELL_SIZE;
    const context = canvas.getContext('2d');
    if (!context) return;
    const atlas = new THREE.CanvasTexture(canvas);
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.generateMipmaps = false;
    atlas.minFilter = THREE.LinearFilter;
    atlas.magFilter = THREE.LinearFilter;
    setTexture(atlas);
    let next = 0;
    const worker = async () => {
      while (active && next < slots.length) {
        const slot = slots[next++];
        try {
          const source = await loadImage(slot.artwork.thumbnailUrl);
          if (!active) return;
          context.drawImage(
            source,
            slot.column * ATLAS_CELL_SIZE,
            slot.row * ATLAS_CELL_SIZE,
            ATLAS_CELL_SIZE,
            ATLAS_CELL_SIZE
          );
          atlas.needsUpdate = true;
        } catch {
          // Keep the ownership color visible when an object cannot be loaded.
        }
      }
    };
    void Promise.all(
      Array.from(
        { length: Math.min(IMAGE_LOAD_CONCURRENCY, slots.length) },
        worker
      )
    );
    return () => {
      active = false;
      atlas.dispose();
    };
  }, [columns, rows, slots]);
  return texture;
}

function ProjectedArtworkMesh({
  slots,
  heights,
  texture,
  opacity = 1,
  renderOrder = 3,
  atlasColumns = 1,
  atlasRows = 1,
}: {
  slots: readonly ArtworkAtlasSlot[];
  heights: ReadonlyMap<number, number>;
  texture: THREE.Texture;
  opacity?: number;
  renderOrder?: number;
  atlasColumns?: number;
  atlasRows?: number;
}) {
  const geometry = useMemo(
    () =>
      createProjectedArtworkGeometry(
        slots,
        heights,
        atlasColumns,
        atlasRows,
        0.02
      ),
    [atlasColumns, atlasRows, heights, slots]
  );
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          artworkMap: { value: texture },
          opacity: { value: opacity },
        },
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide,
        transparent: opacity < 1,
        depthWrite: opacity >= 1,
        toneMapped: false,
      }),
    [opacity, texture]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh
      geometry={geometry}
      material={material}
      raycast={() => undefined}
      renderOrder={renderOrder}
    />
  );
}

function ArtworkAtlasPage({
  artworks,
  heights,
}: {
  artworks: readonly SectorArtwork[];
  heights: ReadonlyMap<number, number>;
}) {
  const columns = Math.min(
    ATLAS_MAX_COLUMNS,
    Math.max(1, Math.ceil(Math.sqrt(artworks.length)))
  );
  const rows = Math.ceil(artworks.length / columns);
  const slots = useMemo(
    () =>
      artworks.map((artwork, index) => ({
        artwork,
        column: index % columns,
        row: Math.floor(index / columns),
      })),
    [artworks, columns]
  );
  const texture = useArtworkAtlas(slots, columns, rows);
  if (!texture || slots.length === 0) return null;
  return (
    <ProjectedArtworkMesh
      slots={slots}
      heights={heights}
      texture={texture}
      atlasColumns={columns}
      atlasRows={rows}
    />
  );
}

export function SectorImageLayer({
  artworks,
  heights,
}: {
  artworks: readonly SectorArtwork[];
  heights: ReadonlyMap<number, number>;
}) {
  const pages = useMemo(() => {
    const result: SectorArtwork[][] = [];
    for (
      let offset = 0;
      offset < artworks.length;
      offset += ATLAS_PAGE_CAPACITY
    ) {
      result.push(artworks.slice(offset, offset + ATLAS_PAGE_CAPACITY));
    }
    return result;
  }, [artworks]);

  return pages.map((page) => (
    <ArtworkAtlasPage key={page[0].id} artworks={page} heights={heights} />
  ));
}

export function SectorDetailImageLayer({
  artwork,
  heights,
}: {
  artwork: SectorArtwork;
  heights: ReadonlyMap<number, number>;
}) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const slots = useMemo(() => [{ artwork, column: 0, row: 0 }], [artwork]);
  useEffect(() => {
    let active = true;
    let loaded: THREE.Texture | null = null;
    new THREE.TextureLoader().load(artwork.imageUrl, (texture) => {
      if (!active) return texture.dispose();
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      loaded = texture;
      setTexture(texture);
    });
    return () => {
      active = false;
      loaded?.dispose();
      setTexture(null);
    };
  }, [artwork.id, artwork.imageUrl]);
  if (!texture) return null;
  return (
    <ProjectedArtworkMesh
      slots={slots}
      heights={heights}
      texture={texture}
      renderOrder={4}
      atlasColumns={1}
      atlasRows={1}
    />
  );
}

export function PlacementPreviewLayer({
  artwork,
  heights,
}: {
  artwork: SectorArtwork;
  heights: ReadonlyMap<number, number>;
}) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const slots = useMemo(() => [{ artwork, column: 0, row: 0 }], [artwork]);
  useEffect(() => {
    const loaded = new THREE.TextureLoader().load(artwork.imageUrl, (value) => {
      value.colorSpace = THREE.SRGBColorSpace;
      setTexture(value);
    });
    return () => loaded.dispose();
  }, [artwork.imageUrl]);
  if (!texture) return null;
  return (
    <ProjectedArtworkMesh
      slots={slots}
      heights={heights}
      texture={texture}
      opacity={0.82}
      renderOrder={8}
      atlasColumns={1}
      atlasRows={1}
    />
  );
}
