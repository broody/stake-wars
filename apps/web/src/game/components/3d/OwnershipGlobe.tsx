import { memo, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { ArcballControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  createControlPointGeometry,
  isControlPointId,
} from '../../utils/controlPointGeometry';
import { CONTROL_POINT_COLORS } from '../../utils/controlPointVisuals';
import {
  stakeReliefHeight,
  type OwnershipScenario,
} from '../../utils/ownershipScenarios';
import {
  ControlPointContestLayer,
  ControlPointOwnershipLayers,
} from './Planet';

const DRAG_SELECTION_THRESHOLD_PX = 5;
export type OwnershipReliefMode = 'flat' | 'stake';

function OwnershipSphere({
  scenario,
  markedOwner,
  reliefMode,
  logarithmicScale,
  onHoverControlPoint,
  onSelectOwner,
}: {
  scenario: OwnershipScenario;
  markedOwner: number;
  reliefMode: OwnershipReliefMode;
  logarithmicScale: boolean;
  onHoverControlPoint: (controlPointId: number | null) => void;
  onSelectOwner: (owner: number) => void;
}) {
  const geometry = useMemo(() => createControlPointGeometry(), []);
  const controlPointOwnerGroups = useMemo(
    () => scenario.controlPointIdsByOwner.map((ids) => [...ids]),
    [scenario]
  );
  const ownedControlPointIds =
    controlPointOwnerGroups[markedOwner] ?? controlPointOwnerGroups[0] ?? [];
  const opponentControlPointIds = useMemo(
    () =>
      controlPointOwnerGroups.flatMap((controlPointIds, owner) =>
        owner === markedOwner ? [] : controlPointIds
      ),
    [controlPointOwnerGroups, markedOwner]
  );
  const controlPointHeights = useMemo(() => {
    const heights = new Map<number, number>();
    if (reliefMode === 'flat') return heights;

    controlPointOwnerGroups.forEach((controlPointIds, owner) => {
      const height = stakeReliefHeight(
        scenario.stakedStrkByOwner[owner] ?? 0,
        logarithmicScale
      );
      controlPointIds.forEach((controlPointId) => {
        heights.set(controlPointId, height);
      });
    });
    return heights;
  }, [controlPointOwnerGroups, logarithmicScale, reliefMode, scenario]);
  const contestedControlPointIds = useMemo(
    () => [...scenario.contestedControlPointIds],
    [scenario]
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  const controlPointIdFromEvent = (
    event: ThreeEvent<PointerEvent | MouseEvent>
  ): number | null => {
    const controlPointId = event.faceIndex;
    return typeof controlPointId === 'number' &&
      isControlPointId(controlPointId)
      ? controlPointId
      : null;
  };

  const handleHoverControlPoint = (
    controlPointId: number,
    event: ThreeEvent<PointerEvent>
  ) => {
    event.stopPropagation();
    onHoverControlPoint(controlPointId);
  };

  const handleClickControlPoint = (
    controlPointId: number,
    event: ThreeEvent<MouseEvent>
  ) => {
    event.stopPropagation();
    if (event.delta > DRAG_SELECTION_THRESHOLD_PX) return;
    const owner = scenario.ownerByControlPoint[controlPointId];
    if (owner >= 0) onSelectOwner(owner);
  };

  return (
    <group rotation={[0.08, scenario.seed * 0.013, -0.08]}>
      <mesh
        geometry={geometry}
        onPointerMove={(event) => {
          const controlPointId = controlPointIdFromEvent(event);
          if (controlPointId !== null) {
            handleHoverControlPoint(controlPointId, event);
          }
        }}
        onPointerOut={() => onHoverControlPoint(null)}
        onClick={(event) => {
          const controlPointId = controlPointIdFromEvent(event);
          if (controlPointId !== null) {
            handleClickControlPoint(controlPointId, event);
          }
        }}
      >
        <meshBasicMaterial
          color={CONTROL_POINT_COLORS.neutral}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh geometry={geometry} scale={1.002} raycast={() => undefined}>
        <meshBasicMaterial
          color={CONTROL_POINT_COLORS.neutralGrid}
          wireframe
          side={THREE.DoubleSide}
          transparent
          opacity={0.42}
        />
      </mesh>

      <ControlPointOwnershipLayers
        ownedControlPointIds={ownedControlPointIds}
        opponentControlPointIds={opponentControlPointIds}
        controlPointOwnerGroups={controlPointOwnerGroups}
        controlPointHeights={controlPointHeights}
        onClickControlPoint={handleClickControlPoint}
        onHoverControlPoint={handleHoverControlPoint}
        onPointerOut={() => onHoverControlPoint(null)}
      />

      <ControlPointContestLayer
        controlPointIds={contestedControlPointIds}
        heights={controlPointHeights}
        color={CONTROL_POINT_COLORS.contested}
      />
    </group>
  );
}

export const OwnershipGlobe = memo(function OwnershipGlobe({
  scenario,
  markedOwner,
  reliefMode,
  logarithmicScale,
  onHoverControlPoint,
  onSelectOwner,
}: {
  scenario: OwnershipScenario;
  markedOwner: number;
  reliefMode: OwnershipReliefMode;
  logarithmicScale: boolean;
  onHoverControlPoint: (controlPointId: number | null) => void;
  onSelectOwner: (owner: number) => void;
}) {
  const validMarkedOwner =
    markedOwner >= 0 && markedOwner < scenario.ownerCount ? markedOwner : 0;

  return (
    <div
      className="h-full min-h-[320px] w-full"
      role="img"
      aria-label={`${scenario.title}: ${scenario.ownerCount} simulated owners, ${scenario.unoccupiedControlPointIds.length} unoccupied Control Points, ${scenario.contestedControlPointIds.length} contested, and ${reliefMode === 'stake' ? `stake-based ${logarithmicScale ? 'logarithmic' : 'linear'} relief` : 'flat relief'}`}
    >
      <Canvas
        camera={{ position: [0, 0, 13], fov: 48 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true }}
        style={{ background: '#020202' }}
      >
        <OwnershipSphere
          scenario={scenario}
          markedOwner={validMarkedOwner}
          reliefMode={reliefMode}
          logarithmicScale={logarithmicScale}
          onHoverControlPoint={onHoverControlPoint}
          onSelectOwner={onSelectOwner}
        />
        <ArcballControls minDistance={8} maxDistance={18} enablePan={false} />
      </Canvas>
    </div>
  );
});
