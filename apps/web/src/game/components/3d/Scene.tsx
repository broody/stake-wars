import { Planet } from './Planet';
import { Stars } from './Stars';
import { ShootingStars } from './ShootingStars';
import { OrbitalBeacon } from './OrbitalBeacon';
import { CoreJackpotMarker } from './CoreJackpotMarker';
import type { Jackpot } from '../../types';

export function Scene({
  isBeaconTracking,
  onInspectBeacon,
  jackpotDraw,
  isJackpotTracking,
  onInspectJackpot,
  isWalkMode,
}: {
  isBeaconTracking: boolean;
  onInspectBeacon: () => void;
  jackpotDraw: Jackpot | null;
  isJackpotTracking: boolean;
  onInspectJackpot: () => void;
  isWalkMode: boolean;
}) {
  return (
    <>
      <Stars />
      <ShootingStars />
      <Planet interactive={!isWalkMode} />
      <OrbitalBeacon
        isTracking={isBeaconTracking}
        onInspect={onInspectBeacon}
        surfaceLightActive={isWalkMode}
      />
      {jackpotDraw ? (
        <CoreJackpotMarker
          key={`${jackpotDraw.id.toString()}:${jackpotDraw.drawCount}:${jackpotDraw.lastDrawnSectorId}`}
          jackpot={jackpotDraw}
          isOpen={isJackpotTracking}
          onInspect={onInspectJackpot}
        />
      ) : null}
      <ambientLight
        color={isWalkMode ? '#fff4df' : '#ffffff'}
        intensity={isWalkMode ? 0.22 : 0.5}
      />
      <directionalLight position={[10, 10, 5]} intensity={isWalkMode ? 0 : 1} />
    </>
  );
}
