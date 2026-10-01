import { lazy, Suspense } from 'react';
import { Planet } from './Planet';
import { Stars } from './Stars';
import { ShootingStars } from './ShootingStars';
import { OrbitalBeacon } from './OrbitalBeacon';
import { CoreSupplyDropMarker } from './CoreSupplyDropMarker';
import type { SupplyDrop } from '../../types';
import { useCoreIntro } from '../../hooks/useCoreIntro';
import {
  EMPTY_SWARM_COUNTS,
  type EnemySwarmCounts,
} from '../../utils/enemyPreviewConfig';

const EnemySwarms = lazy(() => import('./EnemySwarms'));
const SectorTrooper = lazy(() => import('./SectorTrooper'));
const CoreSurvivors = lazy(() => import('./CoreSurvivors'));

export function Scene({
  isBeaconTracking,
  onInspectBeacon,
  supplyDropDraw,
  isSupplyDropTracking,
  onInspectSupplyDrop,
  swarmCounts = EMPTY_SWARM_COUNTS,
  trooper = false,
  trooperActive = true,
  isSurviving = false,
  active = true,
}: {
  isBeaconTracking: boolean;
  onInspectBeacon: () => void;
  supplyDropDraw: SupplyDrop | null;
  isSupplyDropTracking: boolean;
  onInspectSupplyDrop: () => void;
  swarmCounts?: EnemySwarmCounts;
  trooper?: boolean;
  trooperActive?: boolean;
  isSurviving?: boolean;
  active?: boolean;
}) {
  const coreIntro = useCoreIntro();

  return (
    <>
      <Stars />
      <ShootingStars />
      <Planet intro={coreIntro} interactive={!trooper && !isSurviving} />
      {trooper && !isSurviving ? (
        <Suspense fallback={null}>
          <SectorTrooper active={active && trooperActive} />
        </Suspense>
      ) : null}
      {isSurviving ? (
        <Suspense fallback={null}>
          <CoreSurvivors active={active} />
        </Suspense>
      ) : null}
      {!isSurviving && (swarmCounts.mites > 0 || swarmCounts.lancers > 0) ? (
        <Suspense fallback={null}>
          <EnemySwarms
            active={active}
            counts={swarmCounts}
            controlCamera={!trooper}
          />
        </Suspense>
      ) : null}
      <OrbitalBeacon
        isTracking={isBeaconTracking}
        onInspect={onInspectBeacon}
        isCoreProjectionSettled={coreIntro.isProjectionSettled}
      />
      {supplyDropDraw ? (
        <CoreSupplyDropMarker
          key={`${supplyDropDraw.id.toString()}:${supplyDropDraw.drawCount}:${supplyDropDraw.lastDrawnSectorId}`}
          supplyDrop={supplyDropDraw}
          isOpen={isSupplyDropTracking}
          onInspect={onInspectSupplyDrop}
          canArrive={coreIntro.isProjectionSettled}
        />
      ) : null}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
    </>
  );
}
