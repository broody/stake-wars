import { Planet } from './Planet';
import { Stars } from './Stars';
import { ShootingStars } from './ShootingStars';
import { OrbitalBeacon } from './OrbitalBeacon';

export function Scene({
  isBeaconTracking,
  onInspectBeacon,
}: {
  isBeaconTracking: boolean;
  onInspectBeacon: () => void;
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
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
    </>
  );
}
