import { Planet } from './Planet';
import { Stars } from './Stars';
import { ShootingStars } from './ShootingStars';
import { OrbitalArbiter } from './OrbitalArbiter';

export function Scene({ onInspectArbiter }: { onInspectArbiter: () => void }) {
  return (
    <>
      <Stars />
      <ShootingStars />
      <Planet />
      <OrbitalArbiter onInspect={onInspectArbiter} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
    </>
  );
}
