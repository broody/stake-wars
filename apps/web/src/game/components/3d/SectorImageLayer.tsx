import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SectorArtwork } from '../../types';
import {
  createProjectedArtworkGeometry,
  type ArtworkAtlasSlot,
} from '../../utils/sectorArtworkProjection';
import { SECTOR_FLIP_DURATION_SECONDS } from '../../utils/sectorFlip';

const ATLAS_CELL_SIZE = 256;
const ATLAS_MAX_COLUMNS = 16;
const ATLAS_PAGE_CAPACITY = 256;
const IMAGE_LOAD_CONCURRENCY = 16;

const vertexShader = `
  attribute vec3 projectorClip;
  attribute vec4 placement;
  attribute float viewportAspect;
  attribute vec4 atlasRect;
  attribute vec3 sectorCenter;
  varying vec3 vProjectorClip;
  varying vec4 vPlacement;
  varying float vViewportAspect;
  varying vec4 vAtlasRect;
  varying vec3 vSectorCenter;
  void main() {
    vProjectorClip = projectorClip;
    vPlacement = placement;
    vViewportAspect = viewportAspect;
    vAtlasRect = atlasRect;
    vSectorCenter = sectorCenter;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D artworkMap;
  uniform float opacity;
  uniform float flipProgress;
  uniform float flipDirection;
  uniform float visibleOnBothFaces;
  uniform vec3 waveOrigin;
  uniform vec2 waveDistanceRange;
  uniform float waveDelayAmount;
  varying vec3 vProjectorClip;
  varying vec4 vPlacement;
  varying float vViewportAspect;
  varying vec4 vAtlasRect;
  varying vec3 vSectorCenter;
  void main() {
    float angularDistance = acos(clamp(
      dot(normalize(vSectorCenter), normalize(waveOrigin)),
      -1.0,
      1.0
    )) / 3.14159265359;
    float normalizedDistance = clamp(
      (angularDistance - waveDistanceRange.x)
        / max(waveDistanceRange.y - waveDistanceRange.x, 0.000001),
      0.0,
      1.0
    );
    float sectorWaveDelay = normalizedDistance * waveDelayAmount;
    float waveProgress = flipDirection > 0.0
      ? flipProgress
      : 1.0 - flipProgress;
    float localWaveProgress = clamp(
      (waveProgress - sectorWaveDelay)
        / max(1.0 - waveDelayAmount, 0.000001),
      0.0,
      1.0
    );
    float localFlipProgress = flipDirection > 0.0
      ? localWaveProgress
      : 1.0 - localWaveProgress;
    // Artwork is normally visible on the unified Core's settled front and
    // back faces, but disappears through the middle of a wave flip so it
    // never reads as a static panel behind the moving Sector.
    if (visibleOnBothFaces > 0.5) {
      if (localFlipProgress > 0.08 && localFlipProgress < 0.92) discard;
    } else if (localFlipProgress < 0.92) {
      discard;
    }
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
  flipped,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  visibleOnBothFaces = false,
  opacity = 1,
  renderOrder = 3,
  atlasColumns = 1,
  atlasRows = 1,
}: {
  slots: readonly ArtworkAtlasSlot[];
  heights: ReadonlyMap<number, number>;
  texture: THREE.Texture;
  flipped: boolean;
  waveOrigin: THREE.Vector3;
  waveDistanceRange: THREE.Vector2;
  waveDelay: number;
  visibleOnBothFaces?: boolean;
  opacity?: number;
  renderOrder?: number;
  atlasColumns?: number;
  atlasRows?: number;
}) {
  const progressRef = useRef(flipped ? 1 : 0);
  const prefersReducedMotion = useMemo(
    () =>
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false,
    []
  );
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
          flipProgress: { value: progressRef.current },
          flipDirection: { value: flipped ? 1 : -1 },
          visibleOnBothFaces: { value: visibleOnBothFaces ? 1 : 0 },
          waveOrigin: { value: waveOrigin },
          waveDistanceRange: { value: waveDistanceRange },
          waveDelayAmount: { value: waveDelay },
        },
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide,
        transparent: opacity < 1,
        depthWrite: opacity >= 1,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        toneMapped: false,
      }),
    [
      flipped,
      opacity,
      texture,
      visibleOnBothFaces,
      waveDelay,
      waveDistanceRange,
      waveOrigin,
    ]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_state, delta) => {
    const target = flipped ? 1 : 0;
    const step = delta / SECTOR_FLIP_DURATION_SECONDS;
    const distance = target - progressRef.current;
    progressRef.current =
      prefersReducedMotion || Math.abs(distance) <= step
        ? target
        : progressRef.current + Math.sign(distance) * step;
    material.uniforms.flipProgress.value = progressRef.current;
    material.uniforms.flipDirection.value = flipped ? 1 : -1;
  });
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
  flipped,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  visibleOnBothFaces,
}: {
  artworks: readonly SectorArtwork[];
  heights: ReadonlyMap<number, number>;
  flipped: boolean;
  waveOrigin: THREE.Vector3;
  waveDistanceRange: THREE.Vector2;
  waveDelay: number;
  visibleOnBothFaces: boolean;
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
      flipped={flipped}
      waveOrigin={waveOrigin}
      waveDistanceRange={waveDistanceRange}
      waveDelay={waveDelay}
      visibleOnBothFaces={visibleOnBothFaces}
      atlasColumns={columns}
      atlasRows={rows}
    />
  );
}

export function SectorImageLayer({
  artworks,
  heights,
  flipped,
  visible = true,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  visibleOnBothFaces = false,
}: {
  artworks: readonly SectorArtwork[];
  heights: ReadonlyMap<number, number>;
  flipped: boolean;
  visible?: boolean;
  waveOrigin: THREE.Vector3;
  waveDistanceRange: THREE.Vector2;
  waveDelay: number;
  visibleOnBothFaces?: boolean;
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

  return (
    <group visible={visible}>
      {pages.map((page) => (
        <ArtworkAtlasPage
          key={page[0].id}
          artworks={page}
          heights={heights}
          flipped={flipped}
          waveOrigin={waveOrigin}
          waveDistanceRange={waveDistanceRange}
          waveDelay={waveDelay}
          visibleOnBothFaces={visibleOnBothFaces}
        />
      ))}
    </group>
  );
}

export function SectorDetailImageLayer({
  artwork,
  heights,
  flipped,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  visibleOnBothFaces = false,
}: {
  artwork: SectorArtwork;
  heights: ReadonlyMap<number, number>;
  flipped: boolean;
  waveOrigin: THREE.Vector3;
  waveDistanceRange: THREE.Vector2;
  waveDelay: number;
  visibleOnBothFaces?: boolean;
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
      flipped={flipped}
      waveOrigin={waveOrigin}
      waveDistanceRange={waveDistanceRange}
      waveDelay={waveDelay}
      visibleOnBothFaces={visibleOnBothFaces}
      renderOrder={4}
      atlasColumns={1}
      atlasRows={1}
    />
  );
}

export function PlacementPreviewLayer({
  artwork,
  heights,
  flipped,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  visibleOnBothFaces = false,
}: {
  artwork: SectorArtwork;
  heights: ReadonlyMap<number, number>;
  flipped: boolean;
  waveOrigin: THREE.Vector3;
  waveDistanceRange: THREE.Vector2;
  waveDelay: number;
  visibleOnBothFaces?: boolean;
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
      flipped={flipped}
      waveOrigin={waveOrigin}
      waveDistanceRange={waveDistanceRange}
      waveDelay={waveDelay}
      visibleOnBothFaces={visibleOnBothFaces}
      renderOrder={8}
      atlasColumns={1}
      atlasRows={1}
    />
  );
}
