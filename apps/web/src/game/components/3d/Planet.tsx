import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { useSectors } from '../../contexts/SectorContext';
import { useWallet } from '../../contexts/WalletContext';
import { useSectorImages } from '../../contexts/SectorImageContext';
import {
  CORE_RADIUS,
  createSectorBoundaryGeometry,
  createSectorGeometry,
  createSectorGroupGridGeometries,
  createSectorSetGeometry,
  createExtrudedSectorGeometries,
  createRaisedSectorSetGeometry,
} from '../../utils/sectorGeometry';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';
import {
  sectorTenureHeights,
  DEFAULT_TENURE_EXTRUSION_ENABLED,
} from '../../utils/sectorTenure';
import {
  SectorDetailImageLayer,
  SectorImageLayer,
  PlacementPreviewLayer,
} from './SectorImageLayer';
import { artworkForSector } from '../../utils/sectorArtworkProjection';

const DRAG_SELECTION_THRESHOLD_PX = 5;
const TENURE_SURFACE_RADIUS = CORE_RADIUS * 1.004;
const TENURE_CLOCK_INTERVAL_MS = 60 * 60 * 1_000;
const SECTOR_GRID_FULL_DISTANCE = 10;
const SECTOR_GRID_FADE_DISTANCE = 22;
const DETAIL_IMAGE_CAMERA_DISTANCE = 10.5;
const FLAT_SECTOR_HEIGHTS = new Map<number, number>();

const STRIPE_VERTEX_SHADER = `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STRIPE_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uBaseOpacity;
  uniform float uStripeOpacity;
  uniform vec2 uStripeDirection;

  void main() {
    vec2 stripeDirection = normalize(uStripeDirection);
    float stripePhase = dot(gl_FragCoord.xy, stripeDirection) * 0.28 - uTime * 7.0;
    float pulse = 0.12 * sin(uTime * 3.2);
    float stripe = smoothstep(-0.2 + pulse, 0.35 + pulse, sin(stripePhase));
    float opacity = mix(uBaseOpacity, uStripeOpacity, stripe);

    gl_FragColor = vec4(uColor, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface SectorLayerProps {
  sectorIds: number[];
  color: THREE.ColorRepresentation;
  opacity: number;
  scale: number;
  edges?: boolean;
  edgeOpacity?: number;
  heights?: ReadonlyMap<number, number>;
}

function SectorLayer({ sectorIds, ...props }: SectorLayerProps) {
  if (sectorIds.length === 0) {
    return null;
  }

  return <PopulatedSectorLayer sectorIds={sectorIds} {...props} />;
}

function PopulatedSectorLayer({
  sectorIds,
  color,
  opacity,
  scale,
  edges = false,
  edgeOpacity = 0.9,
  heights,
}: SectorLayerProps) {
  const geometry = useMemo(
    () =>
      heights
        ? createRaisedSectorSetGeometry(sectorIds, heights)
        : createSectorSetGeometry(sectorIds),
    [sectorIds, heights]
  );
  const edgeGeometry = useMemo(
    () => (edges ? new THREE.EdgesGeometry(geometry) : null),
    [edges, geometry]
  );

  useEffect(
    () => () => {
      edgeGeometry?.dispose();
      geometry.dispose();
    },
    [edgeGeometry, geometry]
  );

  return (
    <group scale={scale}>
      <mesh geometry={geometry} raycast={() => undefined}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {edgeGeometry && (
        <lineSegments geometry={edgeGeometry} raycast={() => undefined}>
          <lineBasicMaterial color={color} transparent opacity={edgeOpacity} />
        </lineSegments>
      )}
    </group>
  );
}

interface ThickSectorBorderLayerProps {
  sectorIds: number[];
  color: THREE.ColorRepresentation;
  scale: number;
  heights?: ReadonlyMap<number, number>;
}

function ThickSectorBorderLayer({
  sectorIds,
  ...props
}: ThickSectorBorderLayerProps) {
  if (sectorIds.length === 0) {
    return null;
  }

  return <PopulatedThickSectorBorderLayer sectorIds={sectorIds} {...props} />;
}

function PopulatedThickSectorBorderLayer({
  sectorIds,
  color,
  scale,
  heights,
}: ThickSectorBorderLayerProps) {
  const boundaryGeometry = useMemo(
    () => createSectorBoundaryGeometry(sectorIds, heights),
    [sectorIds, heights]
  );
  const lineGeometry = useMemo(
    () =>
      new LineSegmentsGeometry().setPositions(
        boundaryGeometry.getAttribute('position').array as Float32Array
      ),
    [boundaryGeometry]
  );
  const material = useMemo(
    () =>
      new LineMaterial({
        color,
        linewidth: 3,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      }),
    [color]
  );
  const border = useMemo(
    () => new LineSegments2(lineGeometry, material),
    [lineGeometry, material]
  );

  useEffect(
    () => () => {
      boundaryGeometry.dispose();
      lineGeometry.dispose();
      material.dispose();
    },
    [boundaryGeometry, lineGeometry, material]
  );

  return <primitive object={border} scale={scale} raycast={() => undefined} />;
}

interface SectorGridLayerProps {
  sectorGroups: number[][];
  color: THREE.ColorRepresentation;
  heights: ReadonlyMap<number, number>;
  opacity?: number;
  innerOpacity?: number;
}

function SectorGridLayer({
  sectorGroups,
  color,
  heights,
  opacity = 0.86,
  innerOpacity = 0.42,
}: SectorGridLayerProps) {
  const boundaryMaterialRef = useRef<THREE.LineBasicMaterial>(null);
  const internalMaterialRef = useRef<THREE.LineBasicMaterial>(null);
  const geometries = useMemo(
    () =>
      createSectorGroupGridGeometries(
        sectorGroups,
        heights,
        TENURE_SURFACE_RADIUS
      ),
    [sectorGroups, heights]
  );

  useEffect(
    () => () => {
      geometries.boundaries.dispose();
      geometries.interiors.dispose();
    },
    [geometries]
  );

  useFrame(({ camera }) => {
    const fadeProgress = THREE.MathUtils.smoothstep(
      camera.position.length(),
      SECTOR_GRID_FULL_DISTANCE,
      SECTOR_GRID_FADE_DISTANCE
    );
    if (boundaryMaterialRef.current) {
      boundaryMaterialRef.current.opacity = opacity * (1 - fadeProgress);
    }
    if (internalMaterialRef.current) {
      internalMaterialRef.current.opacity = innerOpacity * (1 - fadeProgress);
    }
  });

  if (sectorGroups.length === 0) {
    return null;
  }

  return (
    <group scale={1.0015}>
      <lineSegments geometry={geometries.interiors} raycast={() => undefined}>
        <lineBasicMaterial
          ref={internalMaterialRef}
          color={color}
          transparent
          opacity={innerOpacity}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments geometry={geometries.boundaries} raycast={() => undefined}>
        <lineBasicMaterial
          ref={boundaryMaterialRef}
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}

function AnimatedStripeSectorLayer({
  sectorIds,
  heights,
  color,
  baseOpacity,
  stripeOpacity,
  stripeAngleDegrees,
  scale,
}: {
  sectorIds: number[];
  heights?: ReadonlyMap<number, number>;
  color: THREE.ColorRepresentation;
  baseOpacity: number;
  stripeOpacity: number;
  stripeAngleDegrees: number;
  scale: number;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(
    () =>
      heights
        ? createRaisedSectorSetGeometry(sectorIds, heights)
        : createSectorSetGeometry(sectorIds),
    [sectorIds, heights]
  );
  const stripeAngleRadians = THREE.MathUtils.degToRad(stripeAngleDegrees);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uBaseOpacity: { value: baseOpacity },
      uStripeOpacity: { value: stripeOpacity },
      uStripeDirection: {
        value: new THREE.Vector2(
          Math.cos(stripeAngleRadians),
          Math.sin(stripeAngleRadians)
        ),
      },
    }),
    [baseOpacity, color, stripeAngleRadians, stripeOpacity]
  );
  const prefersReducedMotion = useMemo(
    () =>
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false,
    []
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_state, delta) => {
    if (!materialRef.current || prefersReducedMotion) return;
    materialRef.current.uniforms.uTime.value += delta;
  });

  return (
    <mesh geometry={geometry} scale={scale} raycast={() => undefined}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={STRIPE_VERTEX_SHADER}
        fragmentShader={STRIPE_FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function SectorContestLayer({
  sectorIds,
  heights,
  color,
}: {
  sectorIds: number[];
  heights: ReadonlyMap<number, number>;
  color: THREE.ColorRepresentation;
}) {
  if (sectorIds.length === 0) return null;

  return (
    <AnimatedStripeSectorLayer
      sectorIds={sectorIds}
      heights={heights}
      color={color}
      baseOpacity={0}
      stripeOpacity={1}
      stripeAngleDegrees={45}
      scale={1.012}
    />
  );
}

interface ExtrudedSectorLayerProps {
  sectorIds: number[];
  sectorGroups: number[][];
  heights: ReadonlyMap<number, number>;
  topColor: THREE.ColorRepresentation;
  sideColor: THREE.ColorRepresentation;
  onClickSector: (sectorId: number, event: ThreeEvent<MouseEvent>) => void;
  onHoverSector: (sectorId: number, event: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
}

function ExtrudedSectorLayer({
  sectorIds,
  sectorGroups,
  heights,
  topColor,
  sideColor,
  onClickSector,
  onHoverSector,
  onPointerOut,
}: ExtrudedSectorLayerProps) {
  const geometries = useMemo(
    () =>
      createExtrudedSectorGeometries(
        sectorIds,
        heights,
        TENURE_SURFACE_RADIUS,
        sectorGroups
      ),
    [sectorGroups, sectorIds, heights]
  );

  useEffect(
    () => () => {
      geometries.tops.dispose();
      geometries.sides.dispose();
    },
    [geometries]
  );

  if (sectorIds.length === 0) {
    return null;
  }

  const sectorHandler = <TEvent extends PointerEvent | MouseEvent>(
    event: ThreeEvent<TEvent>,
    faceSectorIds: number[],
    handle: (sectorId: number, event: ThreeEvent<TEvent>) => void
  ) => {
    const sectorId =
      event.faceIndex === undefined || event.faceIndex === null
        ? undefined
        : faceSectorIds[event.faceIndex];
    if (sectorId !== undefined) handle(sectorId, event);
  };

  return (
    <group>
      <mesh
        geometry={geometries.sides}
        onClick={(event) =>
          sectorHandler(event, geometries.sideSectorIds, onClickSector)
        }
        onPointerMove={(event) =>
          sectorHandler(event, geometries.sideSectorIds, onHoverSector)
        }
        onPointerOut={onPointerOut}
      >
        <meshBasicMaterial color={sideColor} side={THREE.DoubleSide} />
      </mesh>
      <mesh
        geometry={geometries.tops}
        onClick={(event) =>
          sectorHandler(event, geometries.topSectorIds, onClickSector)
        }
        onPointerMove={(event) =>
          sectorHandler(event, geometries.topSectorIds, onHoverSector)
        }
        onPointerOut={onPointerOut}
      >
        <meshBasicMaterial color={topColor} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

interface SectorOwnershipLayersProps {
  ownedSectorIds: number[];
  opponentSectorIds: number[];
  sectorOwnerGroups: number[][];
  sectorHeights: ReadonlyMap<number, number>;
  onClickSector: (sectorId: number, event: ThreeEvent<MouseEvent>) => void;
  onHoverSector: (sectorId: number, event: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
}

export function SectorOwnershipLayers({
  ownedSectorIds,
  opponentSectorIds,
  sectorOwnerGroups,
  sectorHeights,
  onClickSector,
  onHoverSector,
  onPointerOut,
}: SectorOwnershipLayersProps) {
  const { ownedSectorGroups, opponentSectorGroups } = useMemo(() => {
    const ownedSectorIdSet = new Set(ownedSectorIds);
    const ownedGroups: number[][] = [];
    const opponentGroups: number[][] = [];

    sectorOwnerGroups.forEach((sectorIds) => {
      const firstSectorId = sectorIds[0];
      if (firstSectorId === undefined) return;
      if (ownedSectorIdSet.has(firstSectorId)) {
        ownedGroups.push(sectorIds);
      } else {
        opponentGroups.push(sectorIds);
      }
    });

    return {
      ownedSectorGroups: ownedGroups,
      opponentSectorGroups: opponentGroups,
    };
  }, [sectorOwnerGroups, ownedSectorIds]);

  return (
    <>
      <ExtrudedSectorLayer
        sectorIds={opponentSectorIds}
        sectorGroups={sectorOwnerGroups}
        heights={sectorHeights}
        topColor={SECTOR_COLORS.opponent}
        sideColor={SECTOR_COLORS.opponentSide}
        onClickSector={onClickSector}
        onHoverSector={onHoverSector}
        onPointerOut={onPointerOut}
      />
      <ExtrudedSectorLayer
        sectorIds={ownedSectorIds}
        sectorGroups={sectorOwnerGroups}
        heights={sectorHeights}
        topColor={SECTOR_COLORS.owned}
        sideColor={SECTOR_COLORS.ownedSide}
        onClickSector={onClickSector}
        onHoverSector={onHoverSector}
        onPointerOut={onPointerOut}
      />
      <SectorGridLayer
        sectorGroups={opponentSectorGroups}
        color={SECTOR_COLORS.opponentGrid}
        heights={sectorHeights}
      />
      <SectorGridLayer
        sectorGroups={ownedSectorGroups}
        color={SECTOR_COLORS.ownedGrid}
        heights={sectorHeights}
        opacity={0.42}
        innerOpacity={0.2}
      />
    </>
  );
}

interface PlanetProps {
  tenureExtrusionEnabled?: boolean;
}

export function Planet({
  tenureExtrusionEnabled = DEFAULT_TENURE_EXTRUSION_ENABLED,
}: PlanetProps) {
  const { camera } = useThree();
  const { isConnected } = useWallet();
  const { artworks, placementDraft, featuredArtworkId } = useSectorImages();
  const {
    mode,
    isSectorInteractionLocked,
    selectedSectorIds,
    selectedSectorId,
    ownedSectorIds,
    opponentSectorIds,
    contestedSectorIds,
    occupiedSectorIds,
    sectorOwnerGroups,
    sectorControlledSince,
    projectionSectorIds,
    projectionLoadingId,
    selectSector,
    toggleProjectionSector,
  } = useSectors();
  const [hoveredSectorId, setHoveredSectorId] = useState<number | null>(null);
  const geometry = useMemo(() => createSectorGeometry(), []);
  const ownedSectorIdSet = useMemo(
    () => new Set(ownedSectorIds),
    [ownedSectorIds]
  );
  const opponentSectorIdSet = useMemo(
    () => new Set(opponentSectorIds),
    [opponentSectorIds]
  );
  const contestedSectorIdSet = useMemo(
    () => new Set(contestedSectorIds),
    [contestedSectorIds]
  );
  const [tenureClock, setTenureClock] = useState(() => Date.now() / 1_000);

  useEffect(() => {
    if (!tenureExtrusionEnabled) return;
    const interval = window.setInterval(
      () => setTenureClock(Date.now() / 1_000),
      TENURE_CLOCK_INTERVAL_MS
    );
    return () => window.clearInterval(interval);
  }, [tenureExtrusionEnabled]);

  const sectorHeights = useMemo(
    () =>
      sectorTenureHeights(
        tenureExtrusionEnabled,
        occupiedSectorIds,
        sectorOwnerGroups,
        sectorControlledSince,
        tenureClock
      ),
    [
      sectorControlledSince,
      sectorOwnerGroups,
      occupiedSectorIds,
      tenureClock,
      tenureExtrusionEnabled,
    ]
  );
  const detailArtwork = useMemo(() => {
    if (mode === 'projection' && featuredArtworkId) {
      const featured = artworks.find(
        (artwork) => artwork.id === featuredArtworkId
      );
      if (featured) return featured;
    }
    const selectedArtwork =
      mode === 'control' && selectedSectorId !== null
        ? artworkForSector(artworks, selectedSectorId)
        : null;
    if (selectedArtwork) return selectedArtwork;
    if (
      hoveredSectorId !== null &&
      camera.position.length() <= DETAIL_IMAGE_CAMERA_DISTANCE
    ) {
      return artworkForSector(artworks, hoveredSectorId);
    }
    return null;
  }, [
    camera,
    hoveredSectorId,
    artworks,
    featuredArtworkId,
    mode,
    selectedSectorId,
  ]);
  const imageHeights = mode === 'control' ? sectorHeights : FLAT_SECTOR_HEIGHTS;
  const placementArtwork = useMemo(() => {
    if (!placementDraft?.placement) return null;
    return {
      id: 'placement-preview',
      network: 'preview',
      ownerAddress: '',
      targets: projectionSectorIds.map((sectorId) => ({
        sectorId,
        ownershipGeneration: 1,
      })),
      placement: placementDraft.placement,
      imageUrl: placementDraft.previewUrl,
      thumbnailUrl: placementDraft.previewUrl,
      contentHash: '',
      updatedAt: '',
    };
  }, [placementDraft, projectionSectorIds]);

  const getEventSectorId = (event: ThreeEvent<PointerEvent | MouseEvent>) =>
    event.faceIndex ?? null;

  const handleSectorClick = (
    sectorId: number,
    event: ThreeEvent<MouseEvent>
  ) => {
    event.stopPropagation();
    if (
      isSectorInteractionLocked ||
      placementDraft !== null ||
      event.delta > DRAG_SELECTION_THRESHOLD_PX
    ) {
      return;
    }

    if (mode === 'projection') {
      if (!ownedSectorIdSet.has(sectorId)) return;
      void toggleProjectionSector(sectorId);
      return;
    }

    selectSector(sectorId, event.nativeEvent.shiftKey);
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    const sectorId = getEventSectorId(event);
    if (sectorId === null) return;
    handleSectorClick(sectorId, event);
  };

  const handleSectorHover = (
    sectorId: number,
    event: ThreeEvent<PointerEvent>
  ) => {
    event.stopPropagation();
    if (placementDraft !== null) {
      setHoveredSectorId(null);
      return;
    }
    setHoveredSectorId(
      mode === 'projection' &&
        (sectorId === null || !ownedSectorIdSet.has(sectorId))
        ? null
        : sectorId
    );
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    const sectorId = getEventSectorId(event);
    if (sectorId === null) return;
    handleSectorHover(sectorId, event);
  };

  const activeSectorIds = useMemo(
    () => (mode === 'projection' ? projectionSectorIds : selectedSectorIds),
    [mode, projectionSectorIds, selectedSectorIds]
  );
  const selectedContestedSectorIds = useMemo(
    () =>
      mode === 'control'
        ? selectedSectorIds.filter((sectorId) =>
            contestedSectorIdSet.has(sectorId)
          )
        : [],
    [contestedSectorIdSet, mode, selectedSectorIds]
  );
  const standardActiveSectorIds = useMemo(
    () =>
      mode === 'control'
        ? selectedSectorIds.filter(
            (sectorId) => !contestedSectorIdSet.has(sectorId)
          )
        : projectionSectorIds,
    [contestedSectorIdSet, mode, projectionSectorIds, selectedSectorIds]
  );
  const pendingChallengeSectorIds = useMemo(
    () =>
      selectedSectorIds.filter(
        (sectorId) =>
          opponentSectorIdSet.has(sectorId) &&
          !contestedSectorIdSet.has(sectorId)
      ),
    [contestedSectorIdSet, opponentSectorIdSet, selectedSectorIds]
  );
  const pendingStandardSectorIds = useMemo(
    () =>
      selectedSectorIds.filter(
        (sectorId) =>
          !opponentSectorIdSet.has(sectorId) &&
          !contestedSectorIdSet.has(sectorId)
      ),
    [contestedSectorIdSet, opponentSectorIdSet, selectedSectorIds]
  );
  const hoveredSectorIds = useMemo(
    () => (hoveredSectorId === null ? [] : [hoveredSectorId]),
    [hoveredSectorId]
  );
  const loadingSectorIds = useMemo(
    () => (projectionLoadingId === null ? [] : [projectionLoadingId]),
    [projectionLoadingId]
  );
  const isHoveredSectorActive =
    hoveredSectorId !== null && activeSectorIds.includes(hoveredSectorId);

  return (
    <group>
      <mesh
        geometry={geometry}
        onClick={isSectorInteractionLocked ? undefined : handleClick}
        onPointerMove={handlePointerMove}
        onPointerOut={() => setHoveredSectorId(null)}
      >
        <meshBasicMaterial
          color={SECTOR_COLORS.neutral}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh geometry={geometry} scale={1.002}>
        <meshBasicMaterial
          color={SECTOR_COLORS.neutralGrid}
          wireframe
          side={THREE.DoubleSide}
          transparent
          opacity={mode === 'projection' ? 0.24 : 0.42}
        />
      </mesh>

      {mode === 'control' ? (
        <SectorOwnershipLayers
          ownedSectorIds={ownedSectorIds}
          opponentSectorIds={opponentSectorIds}
          sectorOwnerGroups={sectorOwnerGroups}
          sectorHeights={sectorHeights}
          onClickSector={handleSectorClick}
          onHoverSector={handleSectorHover}
          onPointerOut={() => setHoveredSectorId(null)}
        />
      ) : (
        <SectorLayer
          sectorIds={ownedSectorIds}
          color={SECTOR_COLORS.owned}
          opacity={0.72}
          scale={1.004}
        />
      )}

      {mode === 'projection' ? (
        <>
          <SectorImageLayer artworks={artworks} heights={imageHeights} />

          {detailArtwork ? (
            <SectorDetailImageLayer
              artwork={detailArtwork}
              heights={imageHeights}
            />
          ) : null}

          {placementArtwork ? (
            <PlacementPreviewLayer
              artwork={placementArtwork}
              heights={imageHeights}
            />
          ) : null}
        </>
      ) : null}

      {hoveredSectorId !== null && !isHoveredSectorActive && (
        <SectorLayer
          sectorIds={hoveredSectorIds}
          color={SECTOR_COLORS.hover}
          opacity={0.12}
          scale={1.007}
          edges
          edgeOpacity={0.62}
          heights={mode === 'control' ? sectorHeights : undefined}
        />
      )}

      <SectorLayer
        sectorIds={standardActiveSectorIds}
        color={
          mode === 'control' ? SECTOR_COLORS.selected : SECTOR_COLORS.owned
        }
        opacity={mode === 'projection' ? 0.62 : 0.2}
        scale={1.01}
        heights={mode === 'control' ? sectorHeights : undefined}
      />

      {mode === 'control' ? (
        <ThickSectorBorderLayer
          sectorIds={standardActiveSectorIds}
          color={SECTOR_COLORS.selected}
          scale={1.014}
          heights={sectorHeights}
        />
      ) : null}

      {mode === 'control' && contestedSectorIds.length > 0 ? (
        <SectorContestLayer
          sectorIds={contestedSectorIds}
          heights={sectorHeights}
          color={
            isConnected ? SECTOR_COLORS.contested : SECTOR_COLORS.neutralGrid
          }
        />
      ) : null}

      {selectedContestedSectorIds.length > 0 ? (
        <ThickSectorBorderLayer
          sectorIds={selectedContestedSectorIds}
          color={SECTOR_COLORS.contested}
          scale={1.018}
          heights={sectorHeights}
        />
      ) : null}

      {isSectorInteractionLocked && pendingStandardSectorIds.length > 0 ? (
        <AnimatedStripeSectorLayer
          sectorIds={pendingStandardSectorIds}
          heights={sectorHeights}
          color={SECTOR_COLORS.transaction}
          baseOpacity={0.08}
          stripeOpacity={0.88}
          stripeAngleDegrees={315}
          scale={1.016}
        />
      ) : null}

      {isSectorInteractionLocked && pendingChallengeSectorIds.length > 0 ? (
        <AnimatedStripeSectorLayer
          sectorIds={pendingChallengeSectorIds}
          heights={sectorHeights}
          color={SECTOR_COLORS.contested}
          baseOpacity={0}
          stripeOpacity={0.5}
          stripeAngleDegrees={45}
          scale={1.016}
        />
      ) : null}

      {projectionLoadingId !== null && (
        <SectorLayer
          sectorIds={loadingSectorIds}
          color={SECTOR_COLORS.selected}
          opacity={0.5}
          scale={1.009}
          edges
        />
      )}
    </group>
  );
}
