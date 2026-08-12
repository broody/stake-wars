import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useControlPoints } from '../../contexts/ControlPointContext';
import {
  createControlPointGeometry,
  createControlPointSetGeometry,
  createSeparatedControlPointSetGeometry,
} from '../../utils/controlPointGeometry';
import { CONTROL_POINT_COLORS } from '../../utils/controlPointVisuals';

const DRAG_SELECTION_THRESHOLD_PX = 5;

const TRANSACTION_VERTEX_SHADER = `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRANSACTION_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec3 uColor;

  void main() {
    float stripePhase = gl_FragCoord.y * 0.28 - uTime * 7.0;
    float pulse = 0.12 * sin(uTime * 3.2);
    float stripe = smoothstep(-0.2 + pulse, 0.35 + pulse, sin(stripePhase));
    float opacity = mix(0.08, 0.88, stripe);

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
}: ControlPointLayerProps) {
  const geometry = useMemo(
    () => createControlPointSetGeometry(controlPointIds),
    [controlPointIds]
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
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {edgeGeometry && (
        <lineSegments geometry={edgeGeometry}>
          <lineBasicMaterial color={color} transparent opacity={edgeOpacity} />
        </lineSegments>
      )}
    </group>
  );
}

function TransactionControlPointLayer({
  controlPointIds,
}: {
  controlPointIds: number[];
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(
    () => createControlPointSetGeometry(controlPointIds),
    [controlPointIds]
  );
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(CONTROL_POINT_COLORS.transaction) },
    }),
    []
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
    <mesh geometry={geometry} scale={1.012}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={TRANSACTION_VERTEX_SHADER}
        fragmentShader={TRANSACTION_FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

interface SeparatedControlPointLayerProps {
  controlPointIds: number[];
  controlPointGroups: number[][];
  color: THREE.ColorRepresentation;
  opacity: number;
  scale: number;
}

function SeparatedControlPointLayer({
  controlPointIds,
  controlPointGroups,
  color,
  opacity,
  scale,
}: SeparatedControlPointLayerProps) {
  const geometry = useMemo(
    () =>
      createSeparatedControlPointSetGeometry(
        controlPointIds,
        controlPointGroups
      ),
    [controlPointGroups, controlPointIds]
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  if (controlPointIds.length === 0) {
    return null;
  }

  return (
    <mesh geometry={geometry} scale={scale}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

export function Planet() {
  const {
    mode,
    isControlPointInteractionLocked,
    selectedControlPointIds,
    ownedControlPointIds,
    opponentControlPointIds,
    controlPointOwnerGroups,
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

  const getEventControlPointId = (
    event: ThreeEvent<PointerEvent | MouseEvent>
  ) => event.faceIndex ?? null;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (
      isControlPointInteractionLocked ||
      event.delta > DRAG_SELECTION_THRESHOLD_PX
    ) {
      return;
    }

    const controlPointId = getEventControlPointId(event);
    if (controlPointId === null) return;

    if (mode === 'projection') {
      if (!ownedControlPointIdSet.has(controlPointId)) return;
      void toggleProjectionControlPoint(controlPointId);
      return;
    }

    selectControlPoint(controlPointId, event.nativeEvent.shiftKey);
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const controlPointId = getEventControlPointId(event);
    setHoveredControlPointId(
      mode === 'projection' &&
        (controlPointId === null || !ownedControlPointIdSet.has(controlPointId))
        ? null
        : controlPointId
    );
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
          <SeparatedControlPointLayer
            controlPointIds={opponentControlPointIds}
            controlPointGroups={controlPointOwnerGroups}
            color={CONTROL_POINT_COLORS.opponent}
            opacity={0.74}
            scale={1.004}
          />
          <SeparatedControlPointLayer
            controlPointIds={ownedControlPointIds}
            controlPointGroups={controlPointOwnerGroups}
            color={CONTROL_POINT_COLORS.owned}
            opacity={0.88}
            scale={1.005}
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
        edges
        edgeOpacity={1}
      />

      {isControlPointInteractionLocked && selectedControlPointIds.length > 0 ? (
        <TransactionControlPointLayer
          controlPointIds={selectedControlPointIds}
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
