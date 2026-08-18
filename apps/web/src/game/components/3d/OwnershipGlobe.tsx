import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { ArcballControls } from '@react-three/drei';
import * as THREE from 'three';
import { createSectorGeometry, isSectorId } from '../../utils/sectorGeometry';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';
import {
  stakeReliefHeight,
  type OwnershipScenario,
} from '../../utils/ownershipScenarios';
import { SectorContestLayer, SectorOwnershipLayers } from './Planet';
import {
  ExampleDetailImageLayer,
  ExampleImageLayer,
} from './ExampleImageLayer';

const DRAG_SELECTION_THRESHOLD_PX = 5;
const DETAIL_HOVER_CAMERA_DISTANCE = 10.5;
export type OwnershipReliefMode = 'flat' | 'stake';
export interface GlobePerformanceMetrics {
  fps: number;
  drawCalls: number;
  triangles: number;
  textures: number;
  cameraDistance: number;
}

function PerformanceProbe({
  onSample,
}: {
  onSample: (metrics: GlobePerformanceMetrics) => void;
}) {
  const elapsed = useRef(0);
  const frames = useRef(0);

  useFrame(({ camera, gl }, delta) => {
    elapsed.current += delta;
    frames.current += 1;
    if (elapsed.current < 1) return;

    onSample({
      fps: Math.round(frames.current / elapsed.current),
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      textures: gl.info.memory.textures,
      cameraDistance: Number(camera.position.length().toFixed(1)),
    });
    elapsed.current = 0;
    frames.current = 0;
  });

  return null;
}

function OwnershipSphere({
  scenario,
  markedOwner,
  reliefMode,
  logarithmicScale,
  imageSectorIds,
  selectedDetailSectorId,
  onHoverSector,
  onSelectSector,
}: {
  scenario: OwnershipScenario;
  markedOwner: number;
  reliefMode: OwnershipReliefMode;
  logarithmicScale: boolean;
  imageSectorIds: readonly number[];
  selectedDetailSectorId: number | null;
  onHoverSector: (sectorId: number | null) => void;
  onSelectSector: (sectorId: number, owner: number) => void;
}) {
  const { camera } = useThree();
  const [hoveredDetailSectorId, setHoveredDetailSectorId] = useState<
    number | null
  >(null);
  const geometry = useMemo(() => createSectorGeometry(), []);
  const imageSectorIdSet = useMemo(
    () => new Set(imageSectorIds),
    [imageSectorIds]
  );
  const sectorOwnerGroups = useMemo(
    () => scenario.sectorIdsByOwner.map((ids) => [...ids]),
    [scenario]
  );
  const ownedSectorIds =
    sectorOwnerGroups[markedOwner] ?? sectorOwnerGroups[0] ?? [];
  const opponentSectorIds = useMemo(
    () =>
      sectorOwnerGroups.flatMap((sectorIds, owner) =>
        owner === markedOwner ? [] : sectorIds
      ),
    [sectorOwnerGroups, markedOwner]
  );
  const sectorHeights = useMemo(() => {
    const heights = new Map<number, number>();
    if (reliefMode === 'flat') return heights;

    sectorOwnerGroups.forEach((sectorIds, owner) => {
      const height = stakeReliefHeight(
        scenario.stakedStrkByOwner[owner] ?? 0,
        logarithmicScale
      );
      sectorIds.forEach((sectorId) => {
        heights.set(sectorId, height);
      });
    });
    return heights;
  }, [sectorOwnerGroups, logarithmicScale, reliefMode, scenario]);
  const contestedSectorIds = useMemo(
    () => [...scenario.contestedSectorIds],
    [scenario]
  );
  const detailSectorId =
    selectedDetailSectorId !== null &&
    imageSectorIdSet.has(selectedDetailSectorId)
      ? selectedDetailSectorId
      : hoveredDetailSectorId;

  useEffect(() => () => geometry.dispose(), [geometry]);

  const sectorIdFromEvent = (
    event: ThreeEvent<PointerEvent | MouseEvent>
  ): number | null => {
    const sectorId = event.faceIndex;
    return typeof sectorId === 'number' && isSectorId(sectorId)
      ? sectorId
      : null;
  };

  const handleHoverSector = (
    sectorId: number,
    event: ThreeEvent<PointerEvent>
  ) => {
    event.stopPropagation();
    onHoverSector(sectorId);
    const nextDetailSectorId =
      imageSectorIdSet.has(sectorId) &&
      camera.position.length() <= DETAIL_HOVER_CAMERA_DISTANCE
        ? sectorId
        : null;
    setHoveredDetailSectorId((current) =>
      current === nextDetailSectorId ? current : nextDetailSectorId
    );
  };

  const handleClickSector = (
    sectorId: number,
    event: ThreeEvent<MouseEvent>
  ) => {
    event.stopPropagation();
    if (event.delta > DRAG_SELECTION_THRESHOLD_PX) return;
    const owner = scenario.ownerBySector[sectorId];
    onSelectSector(sectorId, owner);
  };

  return (
    <group rotation={[0.08, scenario.seed * 0.013, -0.08]}>
      <mesh
        geometry={geometry}
        onPointerMove={(event) => {
          const sectorId = sectorIdFromEvent(event);
          if (sectorId !== null) {
            handleHoverSector(sectorId, event);
          }
        }}
        onPointerOut={() => {
          onHoverSector(null);
          setHoveredDetailSectorId(null);
        }}
        onClick={(event) => {
          const sectorId = sectorIdFromEvent(event);
          if (sectorId !== null) {
            handleClickSector(sectorId, event);
          }
        }}
      >
        <meshBasicMaterial
          color={SECTOR_COLORS.neutral}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh geometry={geometry} scale={1.002} raycast={() => undefined}>
        <meshBasicMaterial
          color={SECTOR_COLORS.neutralGrid}
          wireframe
          side={THREE.DoubleSide}
          transparent
          opacity={0.42}
        />
      </mesh>

      <SectorOwnershipLayers
        ownedSectorIds={ownedSectorIds}
        opponentSectorIds={opponentSectorIds}
        sectorOwnerGroups={sectorOwnerGroups}
        sectorHeights={sectorHeights}
        onClickSector={handleClickSector}
        onHoverSector={handleHoverSector}
        onPointerOut={() => {
          onHoverSector(null);
          setHoveredDetailSectorId(null);
        }}
      />

      <ExampleImageLayer sectorIds={imageSectorIds} heights={sectorHeights} />

      {detailSectorId === null ? null : (
        <ExampleDetailImageLayer
          sectorId={detailSectorId}
          heights={sectorHeights}
        />
      )}

      <SectorContestLayer
        sectorIds={contestedSectorIds}
        heights={sectorHeights}
        color={SECTOR_COLORS.contested}
      />
    </group>
  );
}

export const OwnershipGlobe = memo(function OwnershipGlobe({
  scenario,
  markedOwner,
  reliefMode,
  logarithmicScale,
  imageSectorIds,
  selectedDetailSectorId,
  onPerformanceSample,
  onHoverSector,
  onSelectSector,
}: {
  scenario: OwnershipScenario;
  markedOwner: number;
  reliefMode: OwnershipReliefMode;
  logarithmicScale: boolean;
  imageSectorIds: readonly number[];
  selectedDetailSectorId: number | null;
  onPerformanceSample: (metrics: GlobePerformanceMetrics) => void;
  onHoverSector: (sectorId: number | null) => void;
  onSelectSector: (sectorId: number, owner: number) => void;
}) {
  const validMarkedOwner =
    markedOwner >= 0 && markedOwner < scenario.ownerCount ? markedOwner : 0;

  return (
    <div
      className="h-full min-h-[320px] w-full"
      role="img"
      aria-label={`${scenario.title}: ${scenario.ownerCount} simulated owners, ${scenario.unoccupiedSectorIds.length} unoccupied Sectors, ${scenario.contestedSectorIds.length} contested, ${imageSectorIds.length} example images, and ${reliefMode === 'stake' ? `stake-based ${logarithmicScale ? 'logarithmic' : 'linear'} relief` : 'flat relief'}`}
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
          imageSectorIds={imageSectorIds}
          selectedDetailSectorId={selectedDetailSectorId}
          onHoverSector={onHoverSector}
          onSelectSector={onSelectSector}
        />
        <PerformanceProbe onSample={onPerformanceSample} />
        <ArcballControls minDistance={8} maxDistance={18} enablePan={false} />
      </Canvas>
    </div>
  );
});
