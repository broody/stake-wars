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
}: {
  isBeaconTracking: boolean;
  onInspectBeacon: () => void;
  jackpotDraw: Jackpot | null;
  isJackpotTracking: boolean;
  onInspectJackpot: () => void;
}) {
  return (
    <>
      <Stars />
      <ShootingStars />
      <Planet />
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
