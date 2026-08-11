import { useEffect, useMemo, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useControlPoints } from '../../contexts/ControlPointContext';
import {
  createControlPointGeometry,
  createControlPointSetGeometry,
} from '../../utils/controlPointGeometry';

interface ControlPointLayerProps {
  controlPointIds: number[];
  color: THREE.ColorRepresentation;
  opacity: number;
  scale: number;
  edges?: boolean;
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
          <lineBasicMaterial color={color} transparent opacity={0.9} />
        </lineSegments>
      )}
    </group>
  );
}

export function Planet() {
  const {
    mode,
    selectedControlPointId,
    occupiedControlPointIds,
    projectionControlPointIds,
    projectionLoadingId,
    selectControlPoint,
    toggleProjectionControlPoint,
  } = useControlPoints();
  const [hoveredControlPointId, setHoveredControlPointId] = useState<
    number | null
  >(null);
  const geometry = useMemo(() => createControlPointGeometry(), []);

  const getEventControlPointId = (
    event: ThreeEvent<PointerEvent | MouseEvent>
  ) => event.faceIndex ?? null;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const controlPointId = getEventControlPointId(event);
    if (controlPointId === null) return;

    if (mode === 'projection') {
      void toggleProjectionControlPoint(controlPointId);
      return;
    }

    selectControlPoint(controlPointId);
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHoveredControlPointId(getEventControlPointId(event));
  };

  const activeControlPointIds = useMemo(
    () =>
      mode === 'projection'
        ? projectionControlPointIds
        : selectedControlPointId === null
          ? []
          : [selectedControlPointId],
    [mode, projectionControlPointIds, selectedControlPointId]
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
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerOut={() => setHoveredControlPointId(null)}
      >
        <meshBasicMaterial color={0x050505} side={THREE.DoubleSide} />
      </mesh>

      <mesh geometry={geometry} scale={1.002}>
        <meshBasicMaterial
          color={0x777777}
          wireframe
          side={THREE.DoubleSide}
          transparent
          opacity={mode === 'projection' ? 0.24 : 0.42}
        />
      </mesh>

      <ControlPointLayer
        controlPointIds={occupiedControlPointIds}
        color={0xffffff}
        opacity={0.72}
        scale={1.004}
      />

      {hoveredControlPointId !== null && !isHoveredPointActive && (
        <ControlPointLayer
          controlPointIds={hoveredControlPointIds}
          color={0x888888}
          opacity={0.24}
          scale={1.007}
          edges
        />
      )}

      <ControlPointLayer
        controlPointIds={activeControlPointIds}
        color={0xffffff}
        opacity={mode === 'projection' ? 0.62 : 0.42}
        scale={1.008}
        edges
      />

      {projectionLoadingId !== null && (
        <ControlPointLayer
          controlPointIds={loadingControlPointIds}
          color={0xffb000}
          opacity={0.5}
          scale={1.009}
          edges
        />
      )}
    </group>
  );
}
