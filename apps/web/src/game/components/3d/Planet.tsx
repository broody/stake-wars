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
import { sectorStakeHeights } from '../../utils/sectorStakeRelief';
import {
  SectorDetailImageLayer,
  SectorImageLayer,
  PlacementPreviewLayer,
} from './SectorImageLayer';
import { artworkForSector } from '../../utils/sectorArtworkProjection';
import {
  addSectorFlipAttributes,
  randomOutsideSectorWaveOrigin,
  randomVisibleOutsideSectorWaveOrigin,
  sectorFlipWaveDelayForCount,
  sectorWaveDistanceRange as createSectorWaveDistanceRange,
  SECTOR_FLIP_DURATION_SECONDS,
} from '../../utils/sectorFlip';

const DRAG_SELECTION_THRESHOLD_PX = 5;
const TENURE_SURFACE_RADIUS = CORE_RADIUS * 1.004;
const TENURE_CLOCK_INTERVAL_MS = 60 * 60 * 1_000;
const SECTOR_GRID_FULL_DISTANCE = 10;
const SECTOR_GRID_FADE_DISTANCE = 22;
const DETAIL_IMAGE_CAMERA_DISTANCE = 10.5;
const FLAT_SECTOR_HEIGHTS = new Map<number, number>();
const MODE_FLIP_DURATION_MS = SECTOR_FLIP_DURATION_SECONDS * 1_000;

const SECTOR_FLIP_VERTEX_SHADER = `
  attribute vec3 flipAxis;
  attribute vec3 flipNormal;
  attribute vec3 flipPivot;
  uniform float uFlipProgress;
  uniform float uFlipDirection;
  uniform vec3 uWaveOrigin;
  uniform vec2 uWaveDistanceRange;
  uniform float uWaveDelay;
  varying float vFlipProgress;

  void main() {
    float angularDistance = acos(clamp(
      dot(normalize(flipPivot), normalize(uWaveOrigin)),
      -1.0,
      1.0
    )) / 3.14159265359;
    float normalizedDistance = clamp(
      (angularDistance - uWaveDistanceRange.x)
        / max(uWaveDistanceRange.y - uWaveDistanceRange.x, 0.000001),
      0.0,
      1.0
    );
    float waveDelay = normalizedDistance * uWaveDelay;
    float waveProgress = uFlipDirection > 0.0
      ? uFlipProgress
      : 1.0 - uFlipProgress;
    float localWaveProgress = clamp(
      (waveProgress - waveDelay) / max(1.0 - uWaveDelay, 0.000001),
      0.0,
      1.0
    );
    float localProgress = uFlipDirection > 0.0
      ? localWaveProgress
      : 1.0 - localWaveProgress;
    float easedProgress = localProgress * localProgress
      * (3.0 - 2.0 * localProgress);
    vec3 localPosition = position - flipPivot;
    vec3 hingePosition = flipAxis * dot(localPosition, flipAxis);
    vec3 panelWidth = localPosition - hingePosition;
    float collapse = abs(cos(easedProgress * 3.14159265359));
    float lift = sin(easedProgress * 3.14159265359) * 0.018;
    vec3 flippedPosition = flipPivot
      + hingePosition
      + panelWidth * collapse
      + flipNormal * lift;
    vFlipProgress = localProgress;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(flippedPosition, 1.0);
  }
`;

const SECTOR_TOP_FLIP_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform vec3 uBackColor;
  uniform float uBackVisible;
  varying float vFlipProgress;

  void main() {
    vec3 panelColor = uColor;
    if (vFlipProgress >= 0.5) {
      if (uBackVisible < 0.5) discard;
      panelColor = uBackColor;
    }
    gl_FragColor = vec4(panelColor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const SECTOR_SIDE_FLIP_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  varying float vFlipProgress;

  void main() {
    if (vFlipProgress >= 0.999) discard;
    gl_FragColor = vec4(uColor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

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
  flipped: boolean;
  interactive: boolean;
  waveOrigin: THREE.Vector3;
  waveDistanceRange: THREE.Vector2;
  waveDelay: number;
  topColor: THREE.ColorRepresentation;
  topBackColor?: THREE.ColorRepresentation;
  sideColor: THREE.ColorRepresentation;
  onClickSector: (sectorId: number, event: ThreeEvent<MouseEvent>) => void;
  onHoverSector: (sectorId: number, event: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
}

function FlippingSectorMaterial({
  color,
  backColor,
  flipped,
  panelSide,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
}: {
  color: THREE.ColorRepresentation;
  backColor?: THREE.ColorRepresentation;
  flipped: boolean;
  panelSide: boolean;
  waveOrigin: THREE.Vector3;
  waveDistanceRange: THREE.Vector2;
  waveDelay: number;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const progressRef = useRef(flipped ? 1 : 0);
  const prefersReducedMotion = useMemo(
    () =>
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false,
    []
  );
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uBackColor: { value: new THREE.Color(backColor ?? color) },
      uBackVisible: { value: backColor === undefined ? 0 : 1 },
      uFlipProgress: { value: progressRef.current },
      uFlipDirection: { value: flipped ? 1 : -1 },
      uWaveOrigin: { value: waveOrigin },
      uWaveDistanceRange: { value: waveDistanceRange },
      uWaveDelay: { value: waveDelay },
    }),
    [backColor, color, flipped, waveDelay, waveDistanceRange, waveOrigin]
  );

  useFrame((_state, delta) => {
    const target = flipped ? 1 : 0;
    const step = delta / SECTOR_FLIP_DURATION_SECONDS;
    const distance = target - progressRef.current;
    progressRef.current =
      prefersReducedMotion || Math.abs(distance) <= step
        ? target
        : progressRef.current + Math.sign(distance) * step;
    if (materialRef.current) {
      materialRef.current.uniforms.uFlipProgress.value = progressRef.current;
      materialRef.current.uniforms.uFlipDirection.value = flipped ? 1 : -1;
    }
  });

  return (
    <shaderMaterial
      ref={materialRef}
      uniforms={uniforms}
      vertexShader={SECTOR_FLIP_VERTEX_SHADER}
      fragmentShader={
        panelSide
          ? SECTOR_TOP_FLIP_FRAGMENT_SHADER
          : SECTOR_SIDE_FLIP_FRAGMENT_SHADER
      }
      side={THREE.DoubleSide}
    />
  );
}

function ExtrudedSectorLayer({
  sectorIds,
  sectorGroups,
  heights,
  flipped,
  interactive,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  topColor,
  topBackColor,
  sideColor,
  onClickSector,
  onHoverSector,
  onPointerOut,
}: ExtrudedSectorLayerProps) {
  const geometries = useMemo(() => {
    const nextGeometries = createExtrudedSectorGeometries(
      sectorIds,
      heights,
      TENURE_SURFACE_RADIUS,
      sectorGroups
    );
    addSectorFlipAttributes(
      nextGeometries.tops,
      nextGeometries.topSectorIds,
      heights,
      TENURE_SURFACE_RADIUS
    );
    addSectorFlipAttributes(
      nextGeometries.sides,
      nextGeometries.sideSectorIds,
      heights,
      TENURE_SURFACE_RADIUS
    );
    return nextGeometries;
  }, [sectorGroups, sectorIds, heights]);

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
        onClick={
          interactive
            ? (event) =>
                sectorHandler(event, geometries.sideSectorIds, onClickSector)
            : undefined
        }
        onPointerMove={
          interactive
            ? (event) =>
                sectorHandler(event, geometries.sideSectorIds, onHoverSector)
            : undefined
        }
        onPointerOut={interactive ? onPointerOut : undefined}
        raycast={interactive ? undefined : () => undefined}
      >
        <FlippingSectorMaterial
          color={sideColor}
          flipped={flipped}
          panelSide={false}
          waveOrigin={waveOrigin}
          waveDistanceRange={waveDistanceRange}
          waveDelay={waveDelay}
        />
      </mesh>
      <mesh
        geometry={geometries.tops}
        onClick={
          interactive
            ? (event) =>
                sectorHandler(event, geometries.topSectorIds, onClickSector)
            : undefined
        }
        onPointerMove={
          interactive
            ? (event) =>
                sectorHandler(event, geometries.topSectorIds, onHoverSector)
            : undefined
        }
        onPointerOut={interactive ? onPointerOut : undefined}
        raycast={interactive ? undefined : () => undefined}
      >
        <FlippingSectorMaterial
          color={topColor}
          backColor={topBackColor}
          flipped={flipped}
          panelSide
          waveOrigin={waveOrigin}
          waveDistanceRange={waveDistanceRange}
          waveDelay={waveDelay}
        />
      </mesh>
    </group>
  );
}

interface SectorOwnershipLayersProps {
  ownedSectorIds: number[];
  opponentSectorIds: number[];
  sectorOwnerGroups: number[][];
  sectorHeights: ReadonlyMap<number, number>;
  flipped?: boolean;
  interactive?: boolean;
  waveOrigin?: THREE.Vector3;
  waveDistanceRange?: THREE.Vector2;
  waveDelay?: number;
  onClickSector: (sectorId: number, event: ThreeEvent<MouseEvent>) => void;
  onHoverSector: (sectorId: number, event: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
}

export function SectorOwnershipLayers({
  ownedSectorIds,
  opponentSectorIds,
  sectorOwnerGroups,
  sectorHeights,
  flipped = false,
  interactive = true,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  onClickSector,
  onHoverSector,
  onPointerOut,
}: SectorOwnershipLayersProps) {
  const occupiedSectorIds = useMemo(
    () => [...ownedSectorIds, ...opponentSectorIds],
    [opponentSectorIds, ownedSectorIds]
  );
  const activeWaveOrigin = useMemo(() => {
    void flipped;
    return (
      waveOrigin ??
      randomOutsideSectorWaveOrigin(occupiedSectorIds, TENURE_SURFACE_RADIUS)
    );
  }, [flipped, occupiedSectorIds, waveOrigin]);
  const activeWaveDistanceRange = useMemo(
    () =>
      waveDistanceRange ??
      createSectorWaveDistanceRange(
        occupiedSectorIds,
        activeWaveOrigin,
        TENURE_SURFACE_RADIUS
      ),
    [activeWaveOrigin, occupiedSectorIds, waveDistanceRange]
  );
  const activeWaveDelay =
    waveDelay ?? sectorFlipWaveDelayForCount(occupiedSectorIds.length);
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
        flipped={flipped}
        interactive={interactive}
        waveOrigin={activeWaveOrigin}
        waveDistanceRange={activeWaveDistanceRange}
        waveDelay={activeWaveDelay}
        topColor={SECTOR_COLORS.opponent}
        topBackColor={SECTOR_COLORS.opponent}
        sideColor={SECTOR_COLORS.opponentSide}
        onClickSector={onClickSector}
        onHoverSector={onHoverSector}
        onPointerOut={onPointerOut}
      />
      <ExtrudedSectorLayer
        sectorIds={ownedSectorIds}
        sectorGroups={sectorOwnerGroups}
        heights={sectorHeights}
        flipped={flipped}
        interactive={interactive}
        waveOrigin={activeWaveOrigin}
        waveDistanceRange={activeWaveDistanceRange}
        waveDelay={activeWaveDelay}
        topColor={SECTOR_COLORS.owned}
        topBackColor={SECTOR_COLORS.owned}
        sideColor={SECTOR_COLORS.ownedSide}
        onClickSector={onClickSector}
        onHoverSector={onHoverSector}
        onPointerOut={onPointerOut}
      />
      {!flipped ? (
        <>
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
      ) : null}
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
    controlView,
    stakeScale,
    isSectorInteractionLocked,
    selectedSectorIds,
    selectedSectorId,
    ownedSectorIds,
    opponentSectorIds,
    contestedSectorIds,
    occupiedSectorIds,
    sectorOwnerGroups,
    sectorControlledSince,
    sectorCaptureForce,
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
  const prefersReducedMotion = useMemo(
    () =>
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false,
    []
  );
  const [projectionSurfaceVisible, setProjectionSurfaceVisible] = useState(
    mode === 'projection'
  );
  const flipWaveOrigin = useMemo(() => {
    void mode;
    return randomVisibleOutsideSectorWaveOrigin(
      occupiedSectorIds,
      camera,
      TENURE_SURFACE_RADIUS
    );
  }, [camera, mode, occupiedSectorIds]);
  const flipWaveDistanceRange = useMemo(
    () =>
      createSectorWaveDistanceRange(
        occupiedSectorIds,
        flipWaveOrigin,
        TENURE_SURFACE_RADIUS
      ),
    [flipWaveOrigin, occupiedSectorIds]
  );
  const flipWaveDelay = sectorFlipWaveDelayForCount(occupiedSectorIds.length);

  useEffect(() => {
    if (!tenureExtrusionEnabled) return;
    const interval = window.setInterval(
      () => setTenureClock(Date.now() / 1_000),
      TENURE_CLOCK_INTERVAL_MS
    );
    return () => window.clearInterval(interval);
  }, [tenureExtrusionEnabled]);

  useEffect(() => {
    if (mode === 'projection') {
      setProjectionSurfaceVisible(true);
      return;
    }
    if (prefersReducedMotion) {
      setProjectionSurfaceVisible(false);
      return;
    }
    const timeout = window.setTimeout(
      () => setProjectionSurfaceVisible(false),
      MODE_FLIP_DURATION_MS
    );
    return () => window.clearTimeout(timeout);
  }, [mode, prefersReducedMotion]);

  const sectorHeights = useMemo(() => {
    const stakeReliefEnabled = mode === 'control' && controlView === 'staked';
    if (stakeReliefEnabled) {
      return sectorStakeHeights(
        true,
        occupiedSectorIds,
        sectorCaptureForce,
        stakeScale === 'logarithmic'
      );
    }

    return sectorTenureHeights(
      tenureExtrusionEnabled && mode === 'control',
      occupiedSectorIds,
      sectorOwnerGroups,
      sectorControlledSince,
      tenureClock
    );
  }, [
    controlView,
    mode,
    sectorControlledSince,
    sectorCaptureForce,
    sectorOwnerGroups,
    occupiedSectorIds,
    stakeScale,
    tenureClock,
    tenureExtrusionEnabled,
  ]);
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
  const imageHeights = FLAT_SECTOR_HEIGHTS;
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

      {projectionSurfaceVisible ? (
        <>
          <SectorImageLayer
            artworks={artworks}
            heights={imageHeights}
            flipped={mode === 'projection'}
            waveOrigin={flipWaveOrigin}
            waveDistanceRange={flipWaveDistanceRange}
            waveDelay={flipWaveDelay}
          />

          {mode === 'projection' && detailArtwork ? (
            <SectorDetailImageLayer
              artwork={detailArtwork}
              heights={imageHeights}
              flipped
              waveOrigin={flipWaveOrigin}
              waveDistanceRange={flipWaveDistanceRange}
              waveDelay={flipWaveDelay}
            />
          ) : null}

          {mode === 'projection' && placementArtwork ? (
            <PlacementPreviewLayer
              artwork={placementArtwork}
              heights={imageHeights}
              flipped
              waveOrigin={flipWaveOrigin}
              waveDistanceRange={flipWaveDistanceRange}
              waveDelay={flipWaveDelay}
            />
          ) : null}
        </>
      ) : null}

      <SectorOwnershipLayers
        ownedSectorIds={ownedSectorIds}
        opponentSectorIds={opponentSectorIds}
        sectorOwnerGroups={sectorOwnerGroups}
        sectorHeights={sectorHeights}
        flipped={mode === 'projection'}
        interactive={mode === 'control'}
        waveOrigin={flipWaveOrigin}
        waveDistanceRange={flipWaveDistanceRange}
        waveDelay={flipWaveDelay}
        onClickSector={handleSectorClick}
        onHoverSector={handleSectorHover}
        onPointerOut={() => setHoveredSectorId(null)}
      />

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
        color={SECTOR_COLORS.selected}
        opacity={mode === 'projection' ? 0.62 : 0.2}
        scale={1.01}
        heights={mode === 'control' ? sectorHeights : undefined}
      />

      {standardActiveSectorIds.length > 0 ? (
        <ThickSectorBorderLayer
          sectorIds={standardActiveSectorIds}
          color={SECTOR_COLORS.selected}
          scale={1.014}
          heights={mode === 'control' ? sectorHeights : undefined}
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
