import { Planet } from './Planet';
import { Stars } from './Stars';
import { ShootingStars } from './ShootingStars';
import { OrbitalArbiter } from './OrbitalArbiter';

export function Scene({
  isArbiterTracking,
  onInspectArbiter,
}: {
  isArbiterTracking: boolean;
  onInspectArbiter: () => void;
}) {
  return (
    <>
      <Stars />
      <ShootingStars />
      <Planet />
      <OrbitalArbiter
        isTracking={isArbiterTracking}
        onInspect={onInspectArbiter}
      />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
    </>
  );
}
