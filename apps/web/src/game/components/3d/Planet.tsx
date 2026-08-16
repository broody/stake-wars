import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useControlPoints } from '../../contexts/ControlPointContext';
import {
  CORE_RADIUS,
  createControlPointGeometry,
  createControlPointSetGeometry,
  createExtrudedControlPointGeometries,
  createRaisedControlPointSetGeometry,
} from '../../utils/controlPointGeometry';
import { CONTROL_POINT_COLORS } from '../../utils/controlPointVisuals';
import {
  controlPointTenureHeights,
  DEFAULT_TENURE_EXTRUSION_ENABLED,
} from '../../utils/controlPointTenure';

const DRAG_SELECTION_THRESHOLD_PX = 5;
const TENURE_SURFACE_RADIUS = CORE_RADIUS * 1.004;
const TENURE_CLOCK_INTERVAL_MS = 60 * 60 * 1_000;
const CONTROL_POINT_GRID_FULL_DISTANCE = 10;
const CONTROL_POINT_GRID_FADE_DISTANCE = 22;

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

  void main() {
    vec2 stripeDirection = normalize(vec2(1.0, 1.0));
    float stripePhase = dot(gl_FragCoord.xy, stripeDirection) * 0.28 - uTime * 7.0;
    float pulse = 0.12 * sin(uTime * 3.2);
    float stripe = smoothstep(-0.2 + pulse, 0.35 + pulse, sin(stripePhase));
    float opacity = mix(uBaseOpacity, uStripeOpacity, stripe);

    gl_FragColor = vec4(uColor, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface ControlPointLayerProps {
  controlPointIds: number[];
  color: THREE.ColorRepresentation;
  opacity: number;
  scale: number;
  edges?: boolean;
  edgeOpacity?: number;
  heights?: ReadonlyMap<number, number>;
}

function ControlPointLayer({
  controlPointIds,
  ...props
}: ControlPointLayerProps) {
  if (controlPointIds.length === 0) {
    return null;
  }

  return (
    <PopulatedControlPointLayer controlPointIds={controlPointIds} {...props} />
  );
}

function PopulatedControlPointLayer({
  controlPointIds,
  color,
  opacity,
  scale,
  edges = false,
  edgeOpacity = 0.9,
  heights,
}: ControlPointLayerProps) {
  const geometry = useMemo(
    () =>
      heights
        ? createRaisedControlPointSetGeometry(controlPointIds, heights)
        : createControlPointSetGeometry(controlPointIds),
    [controlPointIds, heights]
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

interface ControlPointGridLayerProps {
  controlPointIds: number[];
  color: THREE.ColorRepresentation;
  heights: ReadonlyMap<number, number>;
  opacity?: number;
}

function ControlPointGridLayer({
  controlPointIds,
  color,
  heights,
  opacity = 0.86,
}: ControlPointGridLayerProps) {
  const materialRef = useRef<THREE.LineBasicMaterial>(null);
  const geometry = useMemo(
    () =>
      createRaisedControlPointSetGeometry(
        controlPointIds,
        heights,
        TENURE_SURFACE_RADIUS
      ),
    [controlPointIds, heights]
  );
  const edgeGeometry = useMemo(
    () => new THREE.EdgesGeometry(geometry),
    [geometry]
  );

  useEffect(
    () => () => {
      edgeGeometry.dispose();
      geometry.dispose();
    },
    [edgeGeometry, geometry]
  );

  useFrame(({ camera }) => {
    if (!materialRef.current) return;

    const fadeProgress = THREE.MathUtils.smoothstep(
      camera.position.length(),
      CONTROL_POINT_GRID_FULL_DISTANCE,
      CONTROL_POINT_GRID_FADE_DISTANCE
    );
    materialRef.current.opacity = opacity * (1 - fadeProgress);
  });

  if (controlPointIds.length === 0) {
    return null;
  }

  return (
    <lineSegments
      geometry={edgeGeometry}
      scale={1.0015}
      raycast={() => undefined}
    >
      <lineBasicMaterial
        ref={materialRef}
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </lineSegments>
  );
}

function AnimatedStripeControlPointLayer({
  controlPointIds,
  heights,
  color,
  baseOpacity,
  stripeOpacity,
  scale,
}: {
  controlPointIds: number[];
  heights?: ReadonlyMap<number, number>;
  color: THREE.ColorRepresentation;
  baseOpacity: number;
  stripeOpacity: number;
  scale: number;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(
    () =>
      heights
        ? createRaisedControlPointSetGeometry(controlPointIds, heights)
        : createControlPointSetGeometry(controlPointIds),
    [controlPointIds, heights]
  );
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uBaseOpacity: { value: baseOpacity },
      uStripeOpacity: { value: stripeOpacity },
    }),
    [baseOpacity, color, stripeOpacity]
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

interface ExtrudedControlPointLayerProps {
  controlPointIds: number[];
  controlPointGroups: number[][];
  heights: ReadonlyMap<number, number>;
  topColor: THREE.ColorRepresentation;
  sideColor: THREE.ColorRepresentation;
  onClickControlPoint: (
    controlPointId: number,
    event: ThreeEvent<MouseEvent>
  ) => void;
  onHoverControlPoint: (
    controlPointId: number,
    event: ThreeEvent<PointerEvent>
  ) => void;
  onPointerOut: () => void;
}

function ExtrudedControlPointLayer({
  controlPointIds,
  controlPointGroups,
  heights,
  topColor,
  sideColor,
  onClickControlPoint,
  onHoverControlPoint,
  onPointerOut,
}: ExtrudedControlPointLayerProps) {
  const geometries = useMemo(
    () =>
      createExtrudedControlPointGeometries(
        controlPointIds,
        heights,
        TENURE_SURFACE_RADIUS,
        controlPointGroups
      ),
    [controlPointGroups, controlPointIds, heights]
  );

  useEffect(
    () => () => {
      geometries.tops.dispose();
      geometries.sides.dispose();
    },
    [geometries]
  );

  if (controlPointIds.length === 0) {
    return null;
  }

  const controlPointHandler = <TEvent extends PointerEvent | MouseEvent>(
    event: ThreeEvent<TEvent>,
    faceControlPointIds: number[],
    handle: (controlPointId: number, event: ThreeEvent<TEvent>) => void
  ) => {
    const controlPointId =
      event.faceIndex === undefined || event.faceIndex === null
        ? undefined
        : faceControlPointIds[event.faceIndex];
    if (controlPointId !== undefined) handle(controlPointId, event);
  };

  return (
    <group>
      <mesh
        geometry={geometries.sides}
        onClick={(event) =>
          controlPointHandler(
            event,
            geometries.sideControlPointIds,
            onClickControlPoint
          )
        }
        onPointerMove={(event) =>
          controlPointHandler(
            event,
            geometries.sideControlPointIds,
            onHoverControlPoint
          )
        }
        onPointerOut={onPointerOut}
      >
        <meshBasicMaterial color={sideColor} side={THREE.DoubleSide} />
      </mesh>
      <mesh
        geometry={geometries.tops}
        onClick={(event) =>
          controlPointHandler(
            event,
            geometries.topControlPointIds,
            onClickControlPoint
          )
        }
        onPointerMove={(event) =>
          controlPointHandler(
            event,
            geometries.topControlPointIds,
            onHoverControlPoint
          )
        }
        onPointerOut={onPointerOut}
      >
        <meshBasicMaterial color={topColor} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

interface PlanetProps {
  tenureExtrusionEnabled?: boolean;
}

export function Planet({
  tenureExtrusionEnabled = DEFAULT_TENURE_EXTRUSION_ENABLED,
}: PlanetProps) {
  const {
    mode,
    isControlPointInteractionLocked,
    selectedControlPointIds,
    ownedControlPointIds,
    opponentControlPointIds,
    contestedControlPointIds,
    occupiedControlPointIds,
    controlPointOwnerGroups,
    controlPointControlledSince,
    projectionControlPointIds,
    projectionLoadingId,
    selectControlPoint,
    toggleProjectionControlPoint,
  } = useControlPoints();
  const [hoveredControlPointId, setHoveredControlPointId] = useState<
    number | null
  >(null);
  const geometry = useMemo(() => createControlPointGeometry(), []);
  const ownedControlPointIdSet = useMemo(
    () => new Set(ownedControlPointIds),
    [ownedControlPointIds]
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

  const controlPointHeights = useMemo(
    () =>
      controlPointTenureHeights(
        tenureExtrusionEnabled,
        occupiedControlPointIds,
        controlPointOwnerGroups,
        controlPointControlledSince,
        tenureClock
      ),
    [
      controlPointControlledSince,
      controlPointOwnerGroups,
      occupiedControlPointIds,
      tenureClock,
      tenureExtrusionEnabled,
    ]
  );

  const getEventControlPointId = (
    event: ThreeEvent<PointerEvent | MouseEvent>
  ) => event.faceIndex ?? null;

  const handleControlPointClick = (
    controlPointId: number,
    event: ThreeEvent<MouseEvent>
  ) => {
    event.stopPropagation();
    if (
      isControlPointInteractionLocked ||
      event.delta > DRAG_SELECTION_THRESHOLD_PX
    ) {
      return;
    }

    if (mode === 'projection') {
      if (!ownedControlPointIdSet.has(controlPointId)) return;
      void toggleProjectionControlPoint(controlPointId);
      return;
    }

    selectControlPoint(controlPointId, event.nativeEvent.shiftKey);
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    const controlPointId = getEventControlPointId(event);
    if (controlPointId === null) return;
    handleControlPointClick(controlPointId, event);
  };

  const handleControlPointHover = (
    controlPointId: number,
    event: ThreeEvent<PointerEvent>
  ) => {
    event.stopPropagation();
    setHoveredControlPointId(
      mode === 'projection' &&
        (controlPointId === null || !ownedControlPointIdSet.has(controlPointId))
        ? null
        : controlPointId
    );
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    const controlPointId = getEventControlPointId(event);
    if (controlPointId === null) return;
    handleControlPointHover(controlPointId, event);
  };

  const activeControlPointIds = useMemo(
    () =>
      mode === 'projection'
        ? projectionControlPointIds
        : selectedControlPointIds,
    [mode, projectionControlPointIds, selectedControlPointIds]
  );
  const hoveredControlPointIds = useMemo(
    () => (hoveredControlPointId === null ? [] : [hoveredControlPointId]),
    [hoveredControlPointId]
  );
  const loadingControlPointIds = useMemo(
    () => (projectionLoadingId === null ? [] : [projectionLoadingId]),
    [projectionLoadingId]
  );
  const isHoveredPointActive =
    hoveredControlPointId !== null &&
    activeControlPointIds.includes(hoveredControlPointId);

  return (
    <group>
      <mesh
        geometry={geometry}
        onClick={isControlPointInteractionLocked ? undefined : handleClick}
        onPointerMove={handlePointerMove}
        onPointerOut={() => setHoveredControlPointId(null)}
      >
        <meshBasicMaterial
          color={CONTROL_POINT_COLORS.neutral}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh geometry={geometry} scale={1.002}>
        <meshBasicMaterial
          color={CONTROL_POINT_COLORS.neutralGrid}
          wireframe
          side={THREE.DoubleSide}
          transparent
          opacity={mode === 'projection' ? 0.24 : 0.42}
        />
      </mesh>

      {mode === 'control' ? (
        <>
          <ExtrudedControlPointLayer
            controlPointIds={opponentControlPointIds}
            controlPointGroups={controlPointOwnerGroups}
            heights={controlPointHeights}
            topColor={CONTROL_POINT_COLORS.opponent}
            sideColor={CONTROL_POINT_COLORS.opponentSide}
            onClickControlPoint={handleControlPointClick}
            onHoverControlPoint={handleControlPointHover}
            onPointerOut={() => setHoveredControlPointId(null)}
          />
          <ExtrudedControlPointLayer
            controlPointIds={ownedControlPointIds}
            controlPointGroups={controlPointOwnerGroups}
            heights={controlPointHeights}
            topColor={CONTROL_POINT_COLORS.owned}
            sideColor={CONTROL_POINT_COLORS.ownedSide}
            onClickControlPoint={handleControlPointClick}
            onHoverControlPoint={handleControlPointHover}
            onPointerOut={() => setHoveredControlPointId(null)}
          />
          <ControlPointGridLayer
            controlPointIds={opponentControlPointIds}
            color={CONTROL_POINT_COLORS.opponentGrid}
            heights={controlPointHeights}
          />
          <ControlPointGridLayer
            controlPointIds={ownedControlPointIds}
            color={CONTROL_POINT_COLORS.ownedGrid}
            heights={controlPointHeights}
            opacity={0.42}
          />
        </>
      ) : (
        <ControlPointLayer
          controlPointIds={ownedControlPointIds}
          color={CONTROL_POINT_COLORS.owned}
          opacity={0.72}
          scale={1.004}
        />
      )}

      {hoveredControlPointId !== null && !isHoveredPointActive && (
        <ControlPointLayer
          controlPointIds={hoveredControlPointIds}
          color={CONTROL_POINT_COLORS.hover}
          opacity={0.12}
          scale={1.007}
          edges
          edgeOpacity={0.62}
          heights={mode === 'control' ? controlPointHeights : undefined}
        />
      )}

      <ControlPointLayer
        controlPointIds={activeControlPointIds}
        color={
          mode === 'control'
            ? CONTROL_POINT_COLORS.selected
            : CONTROL_POINT_COLORS.owned
        }
        opacity={mode === 'projection' ? 0.62 : 0.2}
        scale={1.01}
        edges={mode === 'control'}
        edgeOpacity={1}
        heights={mode === 'control' ? controlPointHeights : undefined}
      />

      {mode === 'control' && contestedControlPointIds.length > 0 ? (
        <AnimatedStripeControlPointLayer
          controlPointIds={contestedControlPointIds}
          heights={controlPointHeights}
          color={CONTROL_POINT_COLORS.contested}
          baseOpacity={0}
          stripeOpacity={0.9}
          scale={1.012}
        />
      ) : null}

      {isControlPointInteractionLocked && selectedControlPointIds.length > 0 ? (
        <AnimatedStripeControlPointLayer
          controlPointIds={selectedControlPointIds}
          heights={controlPointHeights}
          color={CONTROL_POINT_COLORS.transaction}
          baseOpacity={0.08}
          stripeOpacity={0.88}
          scale={1.016}
        />
      ) : null}

      {projectionLoadingId !== null && (
        <ControlPointLayer
          controlPointIds={loadingControlPointIds}
          color={CONTROL_POINT_COLORS.selected}
          opacity={0.5}
          scale={1.009}
          edges
        />
      )}
    </group>
  );
}
