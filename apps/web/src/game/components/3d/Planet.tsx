import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { useSectors } from '../../contexts/SectorContext';
import { useWallet } from '../../contexts/WalletContext';
import { useSectorImages } from '../../contexts/SectorImageContext';
import { useTransactionToast } from '../../contexts/TransactionToastContext';
import {
  CORE_RADIUS,
  createSectorBoundaryGeometry,
  createSectorGeometry,
  createSectorGroupGridGeometries,
  createSectorSetGeometry,
  createExtrudedSectorGeometries,
  createRaisedSectorSetGeometry,
  updateInstancedLinePositions,
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
  addSectorLineFlipAttributes,
  randomOutsideSectorWaveOrigin,
  randomVisibleOutsideSectorWaveOrigin,
  sectorFlipWaveDelayForCount,
  sectorWaveDistanceRange as createSectorWaveDistanceRange,
  SECTOR_FLIP_DURATION_SECONDS,
} from '../../utils/sectorFlip';
import {
  combineSectorSelections,
  contiguousSectorIds,
} from '../../utils/sectorSelection';
import { MAX_SECTOR_SELECTION } from '../../services/sectorLimits';

const DRAG_SELECTION_THRESHOLD_PX = 5;
const TENURE_SURFACE_RADIUS = CORE_RADIUS * 1.004;
const TENURE_CLOCK_INTERVAL_MS = 60 * 60 * 1_000;
const SECTOR_GRID_FULL_DISTANCE = 10;
const SECTOR_GRID_FADE_DISTANCE = 22;
const DETAIL_IMAGE_CAMERA_DISTANCE = 10.5;
const FLAT_SECTOR_HEIGHTS = new Map<number, number>();
const MODE_FLIP_DURATION_MS = SECTOR_FLIP_DURATION_SECONDS * 1_000;
const RELIEF_TRANSITION_SECONDS = 0.55;
const RELIEF_TRANSITION_MS = RELIEF_TRANSITION_SECONDS * 1_000;

interface ReliefAnimationState {
  mix: number;
  visibility: number;
}

type ReliefAnimationRef = MutableRefObject<ReliefAnimationState>;

function useReliefAnimation(
  reliefTarget: number,
  reliefVisible: boolean
): ReliefAnimationRef {
  const animationRef = useRef<ReliefAnimationState>({
    mix: reliefTarget,
    visibility: reliefVisible ? 1 : 0,
  });
  const prefersReducedMotion = useMemo(
    () =>
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false,
    []
  );

  useFrame((_state, delta) => {
    const step = delta / RELIEF_TRANSITION_SECONDS;
    const mixDistance = reliefTarget - animationRef.current.mix;
    animationRef.current.mix =
      prefersReducedMotion || Math.abs(mixDistance) <= step
        ? reliefTarget
        : animationRef.current.mix + Math.sign(mixDistance) * step;
    const visibilityTarget = reliefVisible ? 1 : 0;
    const visibilityDistance =
      visibilityTarget - animationRef.current.visibility;
    animationRef.current.visibility =
      prefersReducedMotion || Math.abs(visibilityDistance) <= step
        ? visibilityTarget
        : animationRef.current.visibility +
          Math.sign(visibilityDistance) * step;
  });

  return animationRef;
}

const SECTOR_FLIP_VERTEX_SHADER = `
  attribute vec3 flipAxis;
  attribute vec3 flipNormal;
  attribute vec3 flipPivot;
  attribute vec3 reliefBasePosition;
  attribute vec3 reliefFlatPosition;
  attribute vec3 reliefStakedPosition;
  attribute vec3 reliefBasePivot;
  attribute vec3 reliefFlatPivot;
  attribute vec3 reliefStakedPivot;
  uniform float uFlipProgress;
  uniform float uFlipDirection;
  uniform float uReliefMix;
  uniform float uReliefVisibility;
  uniform vec3 uWaveOrigin;
  uniform vec2 uWaveDistanceRange;
  uniform float uWaveDelay;
  varying float vFlipProgress;
  varying vec3 vViewNormal;

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
    float reliefProgress = uReliefMix * uReliefMix
      * (3.0 - 2.0 * uReliefMix);
    float reliefVisibility = uReliefVisibility * uReliefVisibility
      * (3.0 - 2.0 * uReliefVisibility);
    vec3 reliefViewPosition = mix(
      reliefFlatPosition,
      reliefStakedPosition,
      reliefProgress
    );
    vec3 reliefPosition = mix(
      reliefBasePosition,
      reliefViewPosition,
      reliefVisibility
    );
    vec3 reliefViewPivot = mix(
      reliefFlatPivot,
      reliefStakedPivot,
      reliefProgress
    );
    vec3 reliefPivot = mix(
      reliefBasePivot,
      reliefViewPivot,
      reliefVisibility
    );
    vec3 localPosition = reliefPosition - reliefPivot;
    vec3 hingePosition = flipAxis * dot(localPosition, flipAxis);
    vec3 panelWidth = localPosition - hingePosition;
    float collapse = abs(cos(easedProgress * 3.14159265359));
    float lift = sin(easedProgress * 3.14159265359) * 0.018;
    vec3 flippedPosition = reliefPivot
      + hingePosition
      + panelWidth * collapse
      + flipNormal * lift;
    vFlipProgress = localProgress;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(flippedPosition, 1.0);
  }
`;

const SECTOR_TOP_FLIP_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform vec3 uBackColor;
  uniform float uBackVisible;
  varying float vFlipProgress;
  varying vec3 vViewNormal;

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
  varying vec3 vViewNormal;

  void main() {
    if (vFlipProgress >= 0.999) discard;
    vec3 viewNormal = normalize(vViewNormal);
    if (!gl_FrontFacing) viewNormal = -viewNormal;
    vec3 lightDirection = normalize(vec3(-0.45, 0.65, 0.60));
    float directionalLight = max(dot(viewNormal, lightDirection), 0.0);
    float shade = mix(0.36, 1.05, pow(directionalLight, 0.75));
    gl_FragColor = vec4(uColor * shade, 1.0);
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

const RELIEF_LINE_VERTEX_SHADER = `
  attribute vec3 flipAxis;
  attribute vec3 flipNormal;
  attribute vec3 flipPivot;
  attribute vec3 reliefBasePosition;
  attribute vec3 reliefFlatPosition;
  attribute vec3 reliefStakedPosition;
  attribute vec3 reliefBasePivot;
  attribute vec3 reliefFlatPivot;
  attribute vec3 reliefStakedPivot;
  uniform float uFlipProgress;
  uniform float uFlipDirection;
  uniform float uReliefMix;
  uniform float uReliefVisibility;
  uniform vec3 uWaveOrigin;
  uniform vec2 uWaveDistanceRange;
  uniform float uWaveDelay;

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
    float reliefProgress = uReliefMix * uReliefMix
      * (3.0 - 2.0 * uReliefMix);
    float reliefVisibility = uReliefVisibility * uReliefVisibility
      * (3.0 - 2.0 * uReliefVisibility);
    vec3 reliefViewPosition = mix(
      reliefFlatPosition,
      reliefStakedPosition,
      reliefProgress
    );
    vec3 reliefPosition = mix(
      reliefBasePosition,
      reliefViewPosition,
      reliefVisibility
    );
    vec3 reliefViewPivot = mix(
      reliefFlatPivot,
      reliefStakedPivot,
      reliefProgress
    );
    vec3 reliefPivot = mix(
      reliefBasePivot,
      reliefViewPivot,
      reliefVisibility
    );
    vec3 localPosition = reliefPosition - reliefPivot;
    vec3 hingePosition = flipAxis * dot(localPosition, flipAxis);
    vec3 panelWidth = localPosition - hingePosition;
    float collapse = abs(cos(easedProgress * 3.14159265359));
    float lift = sin(easedProgress * 3.14159265359) * 0.018;
    vec3 flippedPosition = reliefPivot
      + hingePosition
      + panelWidth * collapse
      + flipNormal * lift;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(flippedPosition, 1.0);
  }
`;

const RELIEF_LINE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
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
  renderOrder?: number;
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
  renderOrder,
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
      <mesh
        geometry={geometry}
        raycast={() => undefined}
        renderOrder={renderOrder}
      >
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
  extrusionHeights?: ReadonlyMap<number, number>;
  flatHeights?: ReadonlyMap<number, number>;
  stakedHeights?: ReadonlyMap<number, number>;
  reliefAnimation?: ReliefAnimationRef;
  flipped: boolean;
  waveOrigin: THREE.Vector3;
  waveDistanceRange: THREE.Vector2;
  waveDelay: number;
  opacity?: number;
  innerOpacity?: number;
}

function AnimatedReliefLineMaterial({
  color,
  opacity,
  reliefAnimation,
  flipped,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  cameraFade,
}: {
  color: THREE.ColorRepresentation;
  opacity: number;
  reliefAnimation: ReliefAnimationRef;
  flipped: boolean;
  waveOrigin: THREE.Vector3;
  waveDistanceRange: THREE.Vector2;
  waveDelay: number;
  cameraFade: boolean;
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
      uOpacity: { value: opacity },
      uFlipProgress: { value: progressRef.current },
      uFlipDirection: { value: flipped ? 1 : -1 },
      uReliefMix: { value: reliefAnimation.current.mix },
      uReliefVisibility: { value: reliefAnimation.current.visibility },
      uWaveOrigin: { value: waveOrigin },
      uWaveDistanceRange: { value: waveDistanceRange },
      uWaveDelay: { value: waveDelay },
    }),
    [
      color,
      flipped,
      opacity,
      reliefAnimation,
      waveDelay,
      waveDistanceRange,
      waveOrigin,
    ]
  );

  useFrame(({ camera }, delta) => {
    const target = flipped ? 1 : 0;
    const step = delta / SECTOR_FLIP_DURATION_SECONDS;
    const distance = target - progressRef.current;
    progressRef.current =
      prefersReducedMotion || Math.abs(distance) <= step
        ? target
        : progressRef.current + Math.sign(distance) * step;

    if (!materialRef.current) return;
    materialRef.current.uniforms.uFlipProgress.value = progressRef.current;
    materialRef.current.uniforms.uFlipDirection.value = flipped ? 1 : -1;
    materialRef.current.uniforms.uReliefMix.value = reliefAnimation.current.mix;
    materialRef.current.uniforms.uReliefVisibility.value =
      reliefAnimation.current.visibility;
    const fadeProgress = cameraFade
      ? THREE.MathUtils.smoothstep(
          camera.position.length(),
          SECTOR_GRID_FULL_DISTANCE,
          SECTOR_GRID_FADE_DISTANCE
        )
      : 0;
    materialRef.current.uniforms.uOpacity.value = opacity * (1 - fadeProgress);
  });

  return (
    <shaderMaterial
      ref={materialRef}
      uniforms={uniforms}
      vertexShader={RELIEF_LINE_VERTEX_SHADER}
      fragmentShader={RELIEF_LINE_FRAGMENT_SHADER}
      transparent
      depthWrite={false}
    />
  );
}

function SectorGridLayer({
  sectorGroups,
  color,
  heights,
  extrusionHeights = heights,
  flatHeights = heights,
  stakedHeights = heights,
  reliefAnimation,
  flipped,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  opacity = 0.86,
  innerOpacity = 0.42,
}: SectorGridLayerProps) {
  const staticReliefAnimation = useRef<ReliefAnimationState>({
    mix: 1,
    visibility: 1,
  });
  const activeReliefAnimation = reliefAnimation ?? staticReliefAnimation;
  const geometries = useMemo(() => {
    const createGeometries = (reliefHeights: ReadonlyMap<number, number>) =>
      createSectorGroupGridGeometries(
        sectorGroups,
        reliefHeights,
        TENURE_SURFACE_RADIUS
      );
    const envelope = createGeometries(extrusionHeights);
    const base = createGeometries(FLAT_SECTOR_HEIGHTS);
    const flat = createGeometries(flatHeights);
    const staked = createGeometries(stakedHeights);
    (['boundaries', 'interiors'] as const).forEach((part) => {
      const sectorIds =
        part === 'boundaries'
          ? envelope.boundarySectorIds
          : envelope.interiorSectorIds;
      addSectorLineFlipAttributes(
        envelope[part],
        sectorIds,
        extrusionHeights,
        TENURE_SURFACE_RADIUS
      );
      addSectorLineFlipAttributes(
        base[part],
        sectorIds,
        FLAT_SECTOR_HEIGHTS,
        TENURE_SURFACE_RADIUS
      );
      addSectorLineFlipAttributes(
        flat[part],
        sectorIds,
        flatHeights,
        TENURE_SURFACE_RADIUS
      );
      addSectorLineFlipAttributes(
        staked[part],
        sectorIds,
        stakedHeights,
        TENURE_SURFACE_RADIUS
      );
      addReliefPositionAttributes(
        envelope[part],
        base[part],
        flat[part],
        staked[part]
      );
      copyReliefVectorAttribute(
        envelope[part],
        'reliefBasePivot',
        base[part],
        'flipPivot'
      );
      copyReliefVectorAttribute(
        envelope[part],
        'reliefFlatPivot',
        flat[part],
        'flipPivot'
      );
      copyReliefVectorAttribute(
        envelope[part],
        'reliefStakedPivot',
        staked[part],
        'flipPivot'
      );
    });
    base.boundaries.dispose();
    base.interiors.dispose();
    flat.boundaries.dispose();
    flat.interiors.dispose();
    staked.boundaries.dispose();
    staked.interiors.dispose();
    return envelope;
  }, [extrusionHeights, flatHeights, sectorGroups, stakedHeights]);

  useEffect(
    () => () => {
      geometries.boundaries.dispose();
      geometries.interiors.dispose();
    },
    [geometries]
  );

  if (sectorGroups.length === 0) {
    return null;
  }

  return (
    <group scale={1.0015}>
      <lineSegments geometry={geometries.interiors} raycast={() => undefined}>
        <AnimatedReliefLineMaterial
          color={color}
          opacity={innerOpacity}
          reliefAnimation={activeReliefAnimation}
          flipped={flipped}
          waveOrigin={waveOrigin}
          waveDistanceRange={waveDistanceRange}
          waveDelay={waveDelay}
          cameraFade
        />
      </lineSegments>
      <lineSegments geometry={geometries.boundaries} raycast={() => undefined}>
        <AnimatedReliefLineMaterial
          color={color}
          opacity={opacity}
          reliefAnimation={activeReliefAnimation}
          flipped={flipped}
          waveOrigin={waveOrigin}
          waveDistanceRange={waveDistanceRange}
          waveDelay={waveDelay}
          cameraFade
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

function copyReliefVectorAttribute(
  geometry: THREE.BufferGeometry,
  name: string,
  source: THREE.BufferGeometry,
  sourceName: string
) {
  const sourceAttribute = source.getAttribute(sourceName);
  if (geometry.getAttribute('position').count !== sourceAttribute.count) {
    throw new Error(`Relief geometry mismatch for ${name}`);
  }
  geometry.setAttribute(name, sourceAttribute.clone());
}

function addReliefPositionAttributes(
  geometry: THREE.BufferGeometry,
  base: THREE.BufferGeometry,
  flat: THREE.BufferGeometry,
  staked: THREE.BufferGeometry
) {
  copyReliefVectorAttribute(geometry, 'reliefBasePosition', base, 'position');
  copyReliefVectorAttribute(geometry, 'reliefFlatPosition', flat, 'position');
  copyReliefVectorAttribute(
    geometry,
    'reliefStakedPosition',
    staked,
    'position'
  );
}

interface ExtrudedSectorLayerProps {
  sectorIds: number[];
  sectorGroups: number[][];
  heights: ReadonlyMap<number, number>;
  flatHeights: ReadonlyMap<number, number>;
  stakedHeights: ReadonlyMap<number, number>;
  reliefAnimation: ReliefAnimationRef;
  flipped: boolean;
  interactive: boolean;
  waveOrigin: THREE.Vector3;
  waveDistanceRange: THREE.Vector2;
  waveDelay: number;
  topColor: THREE.ColorRepresentation;
  topBackColor?: THREE.ColorRepresentation;
  sideColor: THREE.ColorRepresentation;
  onClickSector: (sectorId: number, event: ThreeEvent<MouseEvent>) => void;
  onDoubleClickSector?: (
    sectorId: number,
    event: ThreeEvent<MouseEvent>
  ) => void;
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
  reliefAnimation,
}: {
  color: THREE.ColorRepresentation;
  backColor?: THREE.ColorRepresentation;
  flipped: boolean;
  panelSide: boolean;
  waveOrigin: THREE.Vector3;
  waveDistanceRange: THREE.Vector2;
  waveDelay: number;
  reliefAnimation: ReliefAnimationRef;
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
      uReliefMix: { value: reliefAnimation.current.mix },
      uReliefVisibility: { value: reliefAnimation.current.visibility },
    }),
    [
      backColor,
      color,
      flipped,
      reliefAnimation,
      waveDelay,
      waveDistanceRange,
      waveOrigin,
    ]
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
      materialRef.current.uniforms.uReliefMix.value =
        reliefAnimation.current.mix;
      materialRef.current.uniforms.uReliefVisibility.value =
        reliefAnimation.current.visibility;
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
  flatHeights,
  stakedHeights,
  reliefAnimation,
  flipped,
  interactive,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  topColor,
  topBackColor,
  sideColor,
  onClickSector,
  onDoubleClickSector,
  onHoverSector,
  onPointerOut,
}: ExtrudedSectorLayerProps) {
  const geometries = useMemo(() => {
    const createGeometries = (reliefHeights: ReadonlyMap<number, number>) => {
      const result = createExtrudedSectorGeometries(
        sectorIds,
        reliefHeights,
        TENURE_SURFACE_RADIUS,
        sectorGroups,
        true
      );
      addSectorFlipAttributes(
        result.tops,
        result.topSectorIds,
        reliefHeights,
        TENURE_SURFACE_RADIUS
      );
      addSectorFlipAttributes(
        result.sides,
        result.sideSectorIds,
        reliefHeights,
        TENURE_SURFACE_RADIUS
      );
      return result;
    };
    const envelope = createGeometries(heights);
    const base = createGeometries(FLAT_SECTOR_HEIGHTS);
    const flat = createGeometries(flatHeights);
    const staked = createGeometries(stakedHeights);

    (['tops', 'sides'] as const).forEach((part) => {
      copyReliefVectorAttribute(
        envelope[part],
        'reliefBasePosition',
        base[part],
        'position'
      );
      copyReliefVectorAttribute(
        envelope[part],
        'reliefFlatPosition',
        flat[part],
        'position'
      );
      copyReliefVectorAttribute(
        envelope[part],
        'reliefStakedPosition',
        staked[part],
        'position'
      );
      copyReliefVectorAttribute(
        envelope[part],
        'reliefBasePivot',
        base[part],
        'flipPivot'
      );
      copyReliefVectorAttribute(
        envelope[part],
        'reliefFlatPivot',
        flat[part],
        'flipPivot'
      );
      copyReliefVectorAttribute(
        envelope[part],
        'reliefStakedPivot',
        staked[part],
        'flipPivot'
      );
    });

    base.tops.dispose();
    base.sides.dispose();
    flat.tops.dispose();
    flat.sides.dispose();
    staked.tops.dispose();
    staked.sides.dispose();
    return envelope;
  }, [flatHeights, sectorGroups, sectorIds, heights, stakedHeights]);

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
        onDoubleClick={
          interactive && onDoubleClickSector
            ? (event) =>
                sectorHandler(
                  event,
                  geometries.sideSectorIds,
                  onDoubleClickSector
                )
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
          reliefAnimation={reliefAnimation}
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
        onDoubleClick={
          interactive && onDoubleClickSector
            ? (event) =>
                sectorHandler(
                  event,
                  geometries.topSectorIds,
                  onDoubleClickSector
                )
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
          reliefAnimation={reliefAnimation}
        />
      </mesh>
    </group>
  );
}

interface ReliefContourLayerProps {
  sectorIds: number[];
  heights: ReadonlyMap<number, number>;
  extrusionHeights?: ReadonlyMap<number, number>;
  flatHeights?: ReadonlyMap<number, number>;
  stakedHeights?: ReadonlyMap<number, number>;
  reliefAnimation?: ReliefAnimationRef;
  rimColor: THREE.ColorRepresentation;
  showBaseShadow: boolean;
}

function ReliefContourLayer(props: ReliefContourLayerProps) {
  if (props.sectorIds.length === 0) return null;
  return <PopulatedReliefContourLayer {...props} />;
}

function PopulatedReliefContourLayer({
  sectorIds,
  heights,
  extrusionHeights = heights,
  flatHeights = heights,
  stakedHeights = heights,
  reliefAnimation,
  rimColor,
  showBaseShadow,
}: ReliefContourLayerProps) {
  const staticReliefAnimation = useRef<ReliefAnimationState>({
    mix: 1,
    visibility: 1,
  });
  const activeReliefAnimation = reliefAnimation ?? staticReliefAnimation;
  const reliefGeometries = useMemo(() => {
    const createGeometry = (reliefHeights: ReadonlyMap<number, number>) =>
      createSectorBoundaryGeometry(
        sectorIds,
        reliefHeights,
        TENURE_SURFACE_RADIUS
      );
    return {
      envelope: createGeometry(extrusionHeights),
      base: createGeometry(FLAT_SECTOR_HEIGHTS),
      flat: createGeometry(flatHeights),
      staked: createGeometry(stakedHeights),
    };
  }, [extrusionHeights, flatHeights, sectorIds, stakedHeights]);
  const baseBoundaryGeometry = useMemo(
    () =>
      createSectorBoundaryGeometry(sectorIds, undefined, TENURE_SURFACE_RADIUS),
    [sectorIds]
  );
  const shadowLineGeometry = useMemo(
    () =>
      new LineSegmentsGeometry().setPositions(
        baseBoundaryGeometry.getAttribute('position').array as Float32Array
      ),
    [baseBoundaryGeometry]
  );
  const topLineGeometry = useMemo(
    () =>
      new LineSegmentsGeometry().setPositions(
        reliefGeometries.envelope.getAttribute('position').array as Float32Array
      ),
    [reliefGeometries]
  );
  const shadowMaterial = useMemo(
    () =>
      new LineMaterial({
        color: SECTOR_COLORS.reliefShadow,
        linewidth: 5,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
      }),
    []
  );
  const topEdgeMaterial = useMemo(
    () =>
      new LineMaterial({
        color: SECTOR_COLORS.reliefTopEdge,
        linewidth: 4,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
      }),
    []
  );
  const rimMaterial = useMemo(
    () =>
      new LineMaterial({
        color: rimColor,
        linewidth: 1.25,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      }),
    [rimColor]
  );
  const shadow = useMemo(
    () => new LineSegments2(shadowLineGeometry, shadowMaterial),
    [shadowLineGeometry, shadowMaterial]
  );
  const topEdge = useMemo(
    () => new LineSegments2(topLineGeometry, topEdgeMaterial),
    [topEdgeMaterial, topLineGeometry]
  );
  const rim = useMemo(
    () => new LineSegments2(topLineGeometry, rimMaterial),
    [rimMaterial, topLineGeometry]
  );
  const renderedReliefMixRef = useRef(-1);
  const renderedReliefVisibilityRef = useRef(-1);
  const reliefPositionArrays = useMemo(
    () => ({
      base: reliefGeometries.base.getAttribute('position')
        .array as Float32Array,
      flat: reliefGeometries.flat.getAttribute('position')
        .array as Float32Array,
      staked: reliefGeometries.staked.getAttribute('position')
        .array as Float32Array,
      current: new Float32Array(
        reliefGeometries.envelope.getAttribute('position').count * 3
      ),
    }),
    [reliefGeometries]
  );
  const flatHasRelief = sectorIds.some(
    (sectorId) => (flatHeights.get(sectorId) ?? 0) > 0
  );
  const stakedHasRelief = sectorIds.some(
    (sectorId) => (stakedHeights.get(sectorId) ?? 0) > 0
  );

  useFrame(() => {
    if (
      renderedReliefMixRef.current === activeReliefAnimation.current.mix &&
      renderedReliefVisibilityRef.current ===
        activeReliefAnimation.current.visibility
    ) {
      return;
    }
    renderedReliefMixRef.current = activeReliefAnimation.current.mix;
    renderedReliefVisibilityRef.current =
      activeReliefAnimation.current.visibility;
    const easedMix = THREE.MathUtils.smoothstep(
      activeReliefAnimation.current.mix,
      0,
      1
    );
    const easedVisibility = THREE.MathUtils.smoothstep(
      activeReliefAnimation.current.visibility,
      0,
      1
    );
    for (
      let index = 0;
      index < reliefPositionArrays.current.length;
      index += 1
    ) {
      const viewPosition = THREE.MathUtils.lerp(
        reliefPositionArrays.flat[index],
        reliefPositionArrays.staked[index],
        easedMix
      );
      reliefPositionArrays.current[index] = THREE.MathUtils.lerp(
        reliefPositionArrays.base[index],
        viewPosition,
        easedVisibility
      );
    }
    updateInstancedLinePositions(topLineGeometry, reliefPositionArrays.current);
    const viewShadowOpacity = THREE.MathUtils.lerp(
      flatHasRelief ? 1 : 0,
      stakedHasRelief ? 1 : 0,
      easedMix
    );
    shadowMaterial.opacity = 0.86 * viewShadowOpacity * easedVisibility;
  });

  useEffect(() => {
    renderedReliefMixRef.current = -1;
    renderedReliefVisibilityRef.current = -1;
  }, [topLineGeometry]);

  useEffect(
    () => () => {
      reliefGeometries.envelope.dispose();
      reliefGeometries.base.dispose();
      reliefGeometries.flat.dispose();
      reliefGeometries.staked.dispose();
      baseBoundaryGeometry.dispose();
      shadowLineGeometry.dispose();
      topLineGeometry.dispose();
      shadowMaterial.dispose();
      topEdgeMaterial.dispose();
      rimMaterial.dispose();
    },
    [
      baseBoundaryGeometry,
      shadowLineGeometry,
      shadowMaterial,
      reliefGeometries,
      topEdgeMaterial,
      topLineGeometry,
      rimMaterial,
    ]
  );

  return (
    <group raycast={() => undefined}>
      {showBaseShadow ? (
        <primitive object={shadow} scale={1.0004} raycast={() => undefined} />
      ) : null}
      <primitive
        object={topEdge}
        scale={1.0008}
        renderOrder={12}
        raycast={() => undefined}
      />
      <primitive
        object={rim}
        scale={1.0009}
        renderOrder={13}
        raycast={() => undefined}
      />
    </group>
  );
}

interface SectorOwnershipLayersProps {
  ownedSectorIds: number[];
  opponentSectorIds: number[];
  sectorOwnerGroups: number[][];
  sectorHeights: ReadonlyMap<number, number>;
  extrusionHeights?: ReadonlyMap<number, number>;
  flatHeights?: ReadonlyMap<number, number>;
  stakedHeights?: ReadonlyMap<number, number>;
  reliefTarget?: number;
  reliefVisible?: boolean;
  flipped?: boolean;
  interactive?: boolean;
  waveOrigin?: THREE.Vector3;
  waveDistanceRange?: THREE.Vector2;
  waveDelay?: number;
  onClickSector: (sectorId: number, event: ThreeEvent<MouseEvent>) => void;
  onDoubleClickSector?: (
    sectorId: number,
    event: ThreeEvent<MouseEvent>
  ) => void;
  onHoverSector: (sectorId: number, event: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
}

export function SectorOwnershipLayers({
  ownedSectorIds,
  opponentSectorIds,
  sectorOwnerGroups,
  sectorHeights,
  extrusionHeights = sectorHeights,
  flatHeights = sectorHeights,
  stakedHeights = sectorHeights,
  reliefTarget = 1,
  reliefVisible = true,
  flipped = false,
  interactive = true,
  waveOrigin,
  waveDistanceRange,
  waveDelay,
  onClickSector,
  onDoubleClickSector,
  onHoverSector,
  onPointerOut,
}: SectorOwnershipLayersProps) {
  const reliefAnimation = useReliefAnimation(reliefTarget, reliefVisible);
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
  const ownedSectorsHaveRelief = ownedSectorIds.some(
    (sectorId) => (extrusionHeights.get(sectorId) ?? 0) > 0
  );
  const opponentSectorsHaveRelief = opponentSectorIds.some(
    (sectorId) => (extrusionHeights.get(sectorId) ?? 0) > 0
  );

  return (
    <>
      <ExtrudedSectorLayer
        sectorIds={opponentSectorIds}
        sectorGroups={sectorOwnerGroups}
        heights={extrusionHeights}
        flatHeights={flatHeights}
        stakedHeights={stakedHeights}
        reliefAnimation={reliefAnimation}
        flipped={flipped}
        interactive={interactive}
        waveOrigin={activeWaveOrigin}
        waveDistanceRange={activeWaveDistanceRange}
        waveDelay={activeWaveDelay}
        topColor={SECTOR_COLORS.opponent}
        topBackColor={SECTOR_COLORS.opponent}
        sideColor={SECTOR_COLORS.opponentSide}
        onClickSector={onClickSector}
        onDoubleClickSector={onDoubleClickSector}
        onHoverSector={onHoverSector}
        onPointerOut={onPointerOut}
      />
      <ExtrudedSectorLayer
        sectorIds={ownedSectorIds}
        sectorGroups={sectorOwnerGroups}
        heights={extrusionHeights}
        flatHeights={flatHeights}
        stakedHeights={stakedHeights}
        reliefAnimation={reliefAnimation}
        flipped={flipped}
        interactive={interactive}
        waveOrigin={activeWaveOrigin}
        waveDistanceRange={activeWaveDistanceRange}
        waveDelay={activeWaveDelay}
        topColor={SECTOR_COLORS.owned}
        topBackColor={SECTOR_COLORS.owned}
        sideColor={SECTOR_COLORS.ownedSide}
        onClickSector={onClickSector}
        onDoubleClickSector={onDoubleClickSector}
        onHoverSector={onHoverSector}
        onPointerOut={onPointerOut}
      />
      <SectorGridLayer
        sectorGroups={opponentSectorGroups}
        color={SECTOR_COLORS.opponentGrid}
        heights={sectorHeights}
        extrusionHeights={extrusionHeights}
        flatHeights={flatHeights}
        stakedHeights={stakedHeights}
        reliefAnimation={reliefAnimation}
        flipped={flipped}
        waveOrigin={activeWaveOrigin}
        waveDistanceRange={activeWaveDistanceRange}
        waveDelay={activeWaveDelay}
      />
      <SectorGridLayer
        sectorGroups={ownedSectorGroups}
        color={SECTOR_COLORS.ownedGrid}
        heights={sectorHeights}
        extrusionHeights={extrusionHeights}
        flatHeights={flatHeights}
        stakedHeights={stakedHeights}
        reliefAnimation={reliefAnimation}
        flipped={flipped}
        waveOrigin={activeWaveOrigin}
        waveDistanceRange={activeWaveDistanceRange}
        waveDelay={activeWaveDelay}
        opacity={0.76}
        innerOpacity={0.5}
      />
      <ReliefContourLayer
        sectorIds={opponentSectorIds}
        heights={sectorHeights}
        extrusionHeights={extrusionHeights}
        flatHeights={flatHeights}
        stakedHeights={stakedHeights}
        reliefAnimation={reliefAnimation}
        rimColor={SECTOR_COLORS.opponentReliefRim}
        showBaseShadow={opponentSectorsHaveRelief}
      />
      <ReliefContourLayer
        sectorIds={ownedSectorIds}
        heights={sectorHeights}
        extrusionHeights={extrusionHeights}
        flatHeights={flatHeights}
        stakedHeights={stakedHeights}
        reliefAnimation={reliefAnimation}
        rimColor={SECTOR_COLORS.ownedReliefRim}
        showBaseShadow={ownedSectorsHaveRelief}
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
  const { notifyWarning } = useTransactionToast();
  const { artworks, placementDraft, featuredArtworkId } = useSectorImages();
  const {
    mode,
    controlView,
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
    selectSectors,
    toggleProjectionSector,
    selectProjectionSectors,
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
  const [projectionFlipActive, setProjectionFlipActive] = useState(
    mode === 'projection'
  );
  const [reliefSurfaceVisible, setReliefSurfaceVisible] = useState(
    mode === 'control'
  );
  const previousModeRef = useRef(mode);
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

  useEffect(() => {
    const previousMode = previousModeRef.current;
    previousModeRef.current = mode;

    if (prefersReducedMotion) {
      setReliefSurfaceVisible(mode === 'control');
      setProjectionFlipActive(mode === 'projection');
      return;
    }

    if (mode === 'projection') {
      setReliefSurfaceVisible(false);
      if (previousMode === 'control' && controlView === 'staked') {
        setProjectionFlipActive(false);
        const timeout = window.setTimeout(
          () => setProjectionFlipActive(true),
          RELIEF_TRANSITION_MS
        );
        return () => window.clearTimeout(timeout);
      }
      setProjectionFlipActive(true);
      return;
    }

    setProjectionFlipActive(false);
    if (previousMode === 'projection' && controlView === 'staked') {
      setReliefSurfaceVisible(false);
      const timeout = window.setTimeout(
        () => setReliefSurfaceVisible(true),
        MODE_FLIP_DURATION_MS
      );
      return () => window.clearTimeout(timeout);
    }
    setReliefSurfaceVisible(true);
  }, [controlView, mode, prefersReducedMotion]);

  const flatSectorHeights = useMemo(
    () =>
      sectorTenureHeights(
        tenureExtrusionEnabled,
        occupiedSectorIds,
        sectorOwnerGroups,
        sectorControlledSince,
        tenureClock
      ),
    [
      occupiedSectorIds,
      sectorControlledSince,
      sectorOwnerGroups,
      tenureClock,
      tenureExtrusionEnabled,
    ]
  );
  const stakedSectorHeights = useMemo(
    () => sectorStakeHeights(true, occupiedSectorIds, sectorCaptureForce, true),
    [occupiedSectorIds, sectorCaptureForce]
  );
  const extrusionHeights = useMemo(() => {
    const heights = new Map<number, number>();
    occupiedSectorIds.forEach((sectorId) => {
      heights.set(
        sectorId,
        Math.max(
          flatSectorHeights.get(sectorId) ?? 0,
          stakedSectorHeights.get(sectorId) ?? 0
        )
      );
    });
    return heights;
  }, [flatSectorHeights, occupiedSectorIds, stakedSectorHeights]);
  const sectorHeights = useMemo(() => {
    if (mode !== 'control') return FLAT_SECTOR_HEIGHTS;
    return controlView === 'staked' ? stakedSectorHeights : flatSectorHeights;
  }, [controlView, flatSectorHeights, mode, stakedSectorHeights]);
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

  const handleSectorDoubleClick = (
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

    if (mode === 'projection' && !ownedSectorIdSet.has(sectorId)) return;

    const extendSelection = event.nativeEvent.shiftKey;
    const ownerGroup = sectorOwnerGroups.find((group) =>
      group.includes(sectorId)
    );
    if (mode === 'control' && !ownerGroup) {
      selectSectors(
        combineSectorSelections(selectedSectorIds, [sectorId], extendSelection)
      );
      return;
    }

    const candidateSectorIds =
      mode === 'projection' ? ownedSectorIds : (ownerGroup ?? []);
    const contiguous = contiguousSectorIds(sectorId, candidateSectorIds);
    const currentSelection =
      mode === 'projection' ? projectionSectorIds : selectedSectorIds;
    const nextSelection = combineSectorSelections(
      currentSelection,
      contiguous,
      extendSelection
    );

    if (nextSelection.length > MAX_SECTOR_SELECTION) {
      notifyWarning(
        `This selection would contain ${nextSelection.length} Sectors. Select no more than ${MAX_SECTOR_SELECTION} Sectors.`,
        'SELECTION LIMIT'
      );
      return;
    }

    if (mode === 'projection') {
      selectProjectionSectors(nextSelection);
      return;
    }

    selectSectors(nextSelection);
  };

  const handleDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    const sectorId = getEventSectorId(event);
    if (sectorId === null) return;
    handleSectorDoubleClick(sectorId, event);
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
        onDoubleClick={
          isSectorInteractionLocked ? undefined : handleDoubleClick
        }
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
            flipped={projectionFlipActive}
            waveOrigin={flipWaveOrigin}
            waveDistanceRange={flipWaveDistanceRange}
            waveDelay={flipWaveDelay}
          />

          {mode === 'projection' && detailArtwork ? (
            <SectorDetailImageLayer
              artwork={detailArtwork}
              heights={imageHeights}
              flipped={projectionFlipActive}
              waveOrigin={flipWaveOrigin}
              waveDistanceRange={flipWaveDistanceRange}
              waveDelay={flipWaveDelay}
            />
          ) : null}

          {mode === 'projection' && placementArtwork ? (
            <PlacementPreviewLayer
              artwork={placementArtwork}
              heights={imageHeights}
              flipped={projectionFlipActive}
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
        extrusionHeights={extrusionHeights}
        flatHeights={flatSectorHeights}
        stakedHeights={stakedSectorHeights}
        reliefTarget={controlView === 'staked' ? 1 : 0}
        reliefVisible={reliefSurfaceVisible}
        flipped={projectionFlipActive}
        interactive={mode === 'control'}
        waveOrigin={flipWaveOrigin}
        waveDistanceRange={flipWaveDistanceRange}
        waveDelay={flipWaveDelay}
        onClickSector={handleSectorClick}
        onDoubleClickSector={handleSectorDoubleClick}
        onHoverSector={handleSectorHover}
        onPointerOut={() => setHoveredSectorId(null)}
      />

      {hoveredSectorId !== null && !isHoveredSectorActive && (
        <SectorLayer
          sectorIds={hoveredSectorIds}
          color={SECTOR_COLORS.hover}
          opacity={0.12}
          scale={mode === 'projection' ? 1.0044 : 1.007}
          edges={mode === 'control'}
          edgeOpacity={0.62}
          heights={mode === 'control' ? sectorHeights : undefined}
          renderOrder={mode === 'projection' ? 10 : undefined}
        />
      )}

      {placementDraft === null ? (
        <>
          <SectorLayer
            sectorIds={standardActiveSectorIds}
            color={SECTOR_COLORS.selected}
            opacity={mode === 'projection' ? 0.62 : 0.2}
            scale={mode === 'projection' ? 1.0042 : 1.01}
            heights={mode === 'control' ? sectorHeights : undefined}
            renderOrder={mode === 'projection' ? 9 : undefined}
          />

          {mode === 'control' && standardActiveSectorIds.length > 0 ? (
            <ThickSectorBorderLayer
              sectorIds={standardActiveSectorIds}
              color={SECTOR_COLORS.selected}
              scale={1.014}
              heights={sectorHeights}
            />
          ) : null}
        </>
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
          scale={1.0046}
          renderOrder={11}
        />
      )}
    </group>
  );
}
