import { Planet } from './Planet';
import { Stars } from './Stars';
import { ShootingStars } from './ShootingStars';

export function Scene() {
  return (
    <>
      <Stars />
      <ShootingStars />
      <Planet />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
    </>
  );
}
