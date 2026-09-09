import { lazy, Suspense } from 'react';
import { Planet } from './Planet';
import { Stars } from './Stars';
import { ShootingStars } from './ShootingStars';
import { OrbitalBeacon } from './OrbitalBeacon';
import { CoreSupplyDropMarker } from './CoreSupplyDropMarker';
import type { SupplyDrop } from '../../types';
import {
  EMPTY_SWARM_COUNTS,
  type EnemySwarmCounts,
} from '../../utils/enemyPreviewConfig';

const EnemySwarms = lazy(() => import('./EnemySwarms'));

export function Scene({
  isBeaconTracking,
  onInspectBeacon,
  supplyDropDraw,
  isSupplyDropTracking,
  onInspectSupplyDrop,
  swarmCounts = EMPTY_SWARM_COUNTS,
  active = true,
}: {
  isBeaconTracking: boolean;
  onInspectBeacon: () => void;
  supplyDropDraw: SupplyDrop | null;
  isSupplyDropTracking: boolean;
  onInspectSupplyDrop: () => void;
  swarmCounts?: EnemySwarmCounts;
  active?: boolean;
}) {
  return (
    <>
      <Stars />
      <ShootingStars />
      <Planet />
      {swarmCounts.mites > 0 || swarmCounts.lancers > 0 ? (
        <Suspense fallback={null}>
          <EnemySwarms active={active} counts={swarmCounts} />
        </Suspense>
      ) : null}
      <OrbitalBeacon
        isTracking={isBeaconTracking}
        onInspect={onInspectBeacon}
      />
      {supplyDropDraw ? (
        <CoreSupplyDropMarker
          key={`${supplyDropDraw.id.toString()}:${supplyDropDraw.drawCount}:${supplyDropDraw.lastDrawnSectorId}`}
          supplyDrop={supplyDropDraw}
          isOpen={isSupplyDropTracking}
          onInspect={onInspectSupplyDrop}
        />
      ) : null}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
    </>
  );
}
