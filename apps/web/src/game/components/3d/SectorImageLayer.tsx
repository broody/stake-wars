import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SectorArtwork } from '../../types';
import { useArtworkAtlas } from '../../hooks/useArtworkAtlas';
import {
  measureArtworkDetailCandidates,
  selectArtworkDetailIds,
} from '../../utils/sectorArtworkLod';
import {
  artworkAtlasSourceKey,
  createProjectedArtworkGeometry,
  type ArtworkAtlasSlot,
} from '../../utils/sectorArtworkProjection';

const ATLAS_MAX_COLUMNS = 16;
const ATLAS_PAGE_CAPACITY = 256;
const DETAIL_LOD_SAMPLE_INTERVAL_SECONDS = 0.2;

/** The Core's shared flip clock (see useFlipProgress). */
export interface FlipProgressRef {
  readonly current: number;
}

/** Art on these Sectors flips away and back with its own clock. */
export interface ArtworkPresence {
  sectorIds: ReadonlySet<number>;
  progress: FlipProgressRef;
  shown: boolean;
}

/** Raises art with the Sector relief it sits on. */
export interface ArtworkRelief {
  heights: ReadonlyMap<number, number>;
  /** 0 keeps art at its base heights; 1 places it on the relief. */
  progress: FlipProgressRef;
}

const vertexShader = `
  attribute vec3 projectorClip;
  attribute vec4 placement;
  attribute float viewportAspect;
  attribute float imageAspect;
  attribute vec4 atlasRect;
  attribute vec3 sectorCenter;
  attribute float concealable;
  attribute float reliefScale;
  uniform float reliefProgress;
  varying float vConcealable;
  varying vec3 vProjectorClip;
  varying vec4 vPlacement;
  varying float vViewportAspect;
  varying float vImageAspect;
  varying vec4 vAtlasRect;
  varying vec3 vSectorCenter;
  void main() {
    vProjectorClip = projectorClip;
    vPlacement = placement;
    vViewportAspect = viewportAspect;
    vImageAspect = imageAspect;
    vAtlasRect = atlasRect;
    vSectorCenter = sectorCenter;
    vConcealable = concealable;
    vec3 raisedPosition = position * mix(1.0, reliefScale, reliefProgress);
    gl_Position = projectionMatrix * modelViewMatrix
      * vec4(raisedPosition, 1.0);
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
  uniform float presenceProgress;
  uniform float presenceDirection;
  varying float vConcealable;
  varying vec3 vProjectorClip;
  varying vec4 vPlacement;
  varying float vViewportAspect;
  varying float vImageAspect;
  varying vec4 vAtlasRect;
  varying vec3 vSectorCenter;
  float localProgress(float progress, float direction, float delay) {
    float waveProgress = direction > 0.0 ? progress : 1.0 - progress;
    float localWaveProgress = clamp(
      (waveProgress - delay) / max(1.0 - waveDelayAmount, 0.000001),
      0.0,
      1.0
    );
    return direction > 0.0 ? localWaveProgress : 1.0 - localWaveProgress;
  }
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
    float localFlipProgress = localProgress(
      flipProgress,
      flipDirection,
      sectorWaveDelay
    );
    if (
      vConcealable > 0.5
        && localProgress(presenceProgress, presenceDirection, sectorWaveDelay)
          < 0.92
    ) {
      discard;
    }
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
    vec2 uv = vec2(local.x / vImageAspect, local.y)
      / (2.0 * vPlacement.z) + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
    vec2 atlasUv = vAtlasRect.xy + uv * vAtlasRect.zw;
    vec4 color = texture2D(artworkMap, atlasUv);
    if (color.a <= 0.001) discard;
    gl_FragColor = vec4(color.rgb, color.a * opacity);
  }
`;

function ProjectedArtworkMesh({
  slots,
  heights,
  texture,
  flipped,
  flipProgress,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  visibleOnBothFaces = false,
  presence,
  relief,
  opacity = 1,
  renderOrder = 3,
  atlasColumns = 1,
  atlasRows = 1,
}: {
  slots: readonly ArtworkAtlasSlot[];
  heights: ReadonlyMap<number, number>;
  texture: THREE.Texture;
  flipped: boolean;
  flipProgress: FlipProgressRef;
  waveOrigin: THREE.Vector3;
  waveDistanceRange: THREE.Vector2;
  waveDelay: number;
  visibleOnBothFaces?: boolean;
  presence?: ArtworkPresence;
  relief?: ArtworkRelief;
  opacity?: number;
  renderOrder?: number;
  atlasColumns?: number;
  atlasRows?: number;
}) {
  const presenceSectorIds = presence?.sectorIds;
  const reliefHeights = relief?.heights;
  const geometry = useMemo(
    () =>
      createProjectedArtworkGeometry(
        slots,
        heights,
        atlasColumns,
        atlasRows,
        0.02,
        presenceSectorIds,
        reliefHeights
      ),
    [atlasColumns, atlasRows, heights, presenceSectorIds, reliefHeights, slots]
  );
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          artworkMap: { value: texture },
          opacity: { value: opacity },
          flipProgress: { value: flipProgress.current },
          flipDirection: { value: flipped ? 1 : -1 },
          visibleOnBothFaces: { value: visibleOnBothFaces ? 1 : 0 },
          waveOrigin: { value: waveOrigin },
          waveDistanceRange: { value: waveDistanceRange },
          waveDelayAmount: { value: waveDelay },
          presenceProgress: { value: 1 },
          presenceDirection: { value: 1 },
          reliefProgress: { value: 0 },
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
      flipProgress,
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
  useFrame(() => {
    material.uniforms.flipProgress.value = flipProgress.current;
    material.uniforms.flipDirection.value = flipped ? 1 : -1;
    material.uniforms.presenceProgress.value = presence?.progress.current ?? 1;
    material.uniforms.presenceDirection.value =
      presence && !presence.shown ? -1 : 1;
    material.uniforms.reliefProgress.value = relief?.progress.current ?? 0;
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
  flipProgress,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  visibleOnBothFaces,
  presence,
  relief,
  onLoadingChange,
}: {
  artworks: readonly SectorArtwork[];
  heights: ReadonlyMap<number, number>;
  flipped: boolean;
  flipProgress: FlipProgressRef;
  waveOrigin: THREE.Vector3;
  waveDistanceRange: THREE.Vector2;
  waveDelay: number;
  visibleOnBothFaces: boolean;
  presence?: ArtworkPresence;
  relief?: ArtworkRelief;
  onLoadingChange?: (pageId: string, loading: boolean) => void;
}) {
  const pageId = artworks[0].id;
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
  const sourceKey = useMemo(() => artworkAtlasSourceKey(slots), [slots]);
  const texture = useArtworkAtlas(
    sourceKey,
    columns,
    rows,
    pageId,
    onLoadingChange
  );
  if (!texture || slots.length === 0) return null;
  return (
    <ProjectedArtworkMesh
      slots={slots}
      heights={heights}
      texture={texture}
      flipped={flipped}
      flipProgress={flipProgress}
      waveOrigin={waveOrigin}
      waveDistanceRange={waveDistanceRange}
      waveDelay={waveDelay}
      visibleOnBothFaces={visibleOnBothFaces}
      presence={presence}
      relief={relief}
      atlasColumns={columns}
      atlasRows={rows}
    />
  );
}

export function SectorImageLayer({
  artworks,
  heights,
  flipped,
  flipProgress,
  visible = true,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  visibleOnBothFaces = false,
  presence,
  relief,
  onLoadingChange,
}: {
  artworks: readonly SectorArtwork[];
  heights: ReadonlyMap<number, number>;
  flipped: boolean;
  flipProgress: FlipProgressRef;
  visible?: boolean;
  waveOrigin: THREE.Vector3;
  waveDistanceRange: THREE.Vector2;
  waveDelay: number;
  visibleOnBothFaces?: boolean;
  presence?: ArtworkPresence;
  relief?: ArtworkRelief;
  onLoadingChange?: (loading: boolean) => void;
}) {
  const loadingPageIdsRef = useRef(new Set<string>());
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
  const reportPageLoading = useCallback(
    (pageId: string, loading: boolean) => {
      if (loading) loadingPageIdsRef.current.add(pageId);
      else loadingPageIdsRef.current.delete(pageId);
      onLoadingChange?.(loadingPageIdsRef.current.size > 0);
    },
    [onLoadingChange]
  );

  useEffect(() => {
    if (pages.length === 0) onLoadingChange?.(false);
  }, [onLoadingChange, pages.length]);

  return (
    <group visible={visible}>
      {pages.map((page) => (
        <ArtworkAtlasPage
          key={page[0].id}
          artworks={page}
          heights={heights}
          flipped={flipped}
          flipProgress={flipProgress}
          waveOrigin={waveOrigin}
          waveDistanceRange={waveDistanceRange}
          waveDelay={waveDelay}
          visibleOnBothFaces={visibleOnBothFaces}
          presence={presence}
          relief={relief}
          onLoadingChange={reportPageLoading}
        />
      ))}
    </group>
  );
}

export function SectorDetailImageLayer({
  artwork,
  heights,
  flipped,
  flipProgress,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  visibleOnBothFaces = false,
  presence,
  relief,
}: {
  artwork: SectorArtwork;
  heights: ReadonlyMap<number, number>;
  flipped: boolean;
  flipProgress: FlipProgressRef;
  waveOrigin: THREE.Vector3;
  waveDistanceRange: THREE.Vector2;
  waveDelay: number;
  visibleOnBothFaces?: boolean;
  presence?: ArtworkPresence;
  relief?: ArtworkRelief;
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
      flipProgress={flipProgress}
      waveOrigin={waveOrigin}
      waveDistanceRange={waveDistanceRange}
      waveDelay={waveDelay}
      visibleOnBothFaces={visibleOnBothFaces}
      presence={presence}
      relief={relief}
      renderOrder={4}
      atlasColumns={1}
      atlasRows={1}
    />
  );
}

export function SectorDetailImageLayers({
  artworks,
  priorityArtworkIds,
  heights,
  flipped,
  flipProgress,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  visibleOnBothFaces = false,
  presence,
  relief,
}: {
  artworks: readonly SectorArtwork[];
  priorityArtworkIds: readonly string[];
  heights: ReadonlyMap<number, number>;
  flipped: boolean;
  flipProgress: FlipProgressRef;
  waveOrigin: THREE.Vector3;
  waveDistanceRange: THREE.Vector2;
  waveDelay: number;
  visibleOnBothFaces?: boolean;
  presence?: ArtworkPresence;
  relief?: ArtworkRelief;
}) {
  const { camera, gl } = useThree();
  const [detailArtworkIds, setDetailArtworkIds] = useState<string[]>([]);
  const detailArtworkIdsRef = useRef<readonly string[]>([]);
  const sampleElapsedRef = useRef(DETAIL_LOD_SAMPLE_INTERVAL_SECONDS);
  const drawingBufferSizeRef = useRef(new THREE.Vector2());
  const priorityArtworkIdSet = useMemo(
    () => new Set(priorityArtworkIds),
    [priorityArtworkIds]
  );
  const artworkById = useMemo(
    () => new Map(artworks.map((artwork) => [artwork.id, artwork])),
    [artworks]
  );

  useFrame((_state, delta) => {
    sampleElapsedRef.current += delta;
    if (sampleElapsedRef.current < DETAIL_LOD_SAMPLE_INTERVAL_SECONDS) return;
    sampleElapsedRef.current = 0;

    const viewport = gl.getDrawingBufferSize(drawingBufferSizeRef.current);
    const nextIds = selectArtworkDetailIds(
      measureArtworkDetailCandidates(
        artworks,
        priorityArtworkIdSet,
        heights,
        camera,
        viewport
      ),
      detailArtworkIdsRef.current
    );
    if (
      nextIds.length === detailArtworkIdsRef.current.length &&
      nextIds.every((id, index) => id === detailArtworkIdsRef.current[index])
    ) {
      return;
    }
    detailArtworkIdsRef.current = nextIds;
    setDetailArtworkIds(nextIds);
  });

  return detailArtworkIds.map((artworkId) => {
    const artwork = artworkById.get(artworkId);
    if (!artwork) return null;
    return (
      <SectorDetailImageLayer
        key={artwork.id}
        artwork={artwork}
        heights={heights}
        flipped={flipped}
        flipProgress={flipProgress}
        waveOrigin={waveOrigin}
        waveDistanceRange={waveDistanceRange}
        waveDelay={waveDelay}
        visibleOnBothFaces={visibleOnBothFaces}
        presence={presence}
        relief={relief}
      />
    );
  });
}

export function PlacementPreviewLayer({
  artwork,
  heights,
  flipped,
  flipProgress,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  visibleOnBothFaces = false,
}: {
  artwork: SectorArtwork;
  heights: ReadonlyMap<number, number>;
  flipped: boolean;
  flipProgress: FlipProgressRef;
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
      flipProgress={flipProgress}
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
