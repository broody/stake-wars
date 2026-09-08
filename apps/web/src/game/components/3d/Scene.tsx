import { lazy, Suspense } from 'react';
import { Planet } from './Planet';
import { Stars } from './Stars';
import { ShootingStars } from './ShootingStars';
import { OrbitalBeacon } from './OrbitalBeacon';
import { CoreJackpotMarker } from './CoreJackpotMarker';
import type { Jackpot } from '../../types';
import {
  EMPTY_SWARM_COUNTS,
  type EnemySwarmCounts,
} from '../../utils/enemyPreviewConfig';

const EnemySwarms = lazy(() => import('./EnemySwarms'));

export function Scene({
  isBeaconTracking,
  onInspectBeacon,
  jackpotDraw,
  isJackpotTracking,
  onInspectJackpot,
  swarmCounts = EMPTY_SWARM_COUNTS,
  active = true,
}: {
  isBeaconTracking: boolean;
  onInspectBeacon: () => void;
  jackpotDraw: Jackpot | null;
  isJackpotTracking: boolean;
  onInspectJackpot: () => void;
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
      {jackpotDraw ? (
        <CoreJackpotMarker
          key={`${jackpotDraw.id.toString()}:${jackpotDraw.drawCount}:${jackpotDraw.lastDrawnSectorId}`}
          jackpot={jackpotDraw}
          isOpen={isJackpotTracking}
          onInspect={onInspectJackpot}
        />
      ) : null}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
    </>
  );
}
