import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ShootingStar {
  id: number;
  startPos: THREE.Vector3;
  direction: THREE.Vector3;
  speed: number;
  progress: number;
  length: number;
  active: boolean;
  distance: number; // Distance from center for brightness calculation
}

export const ShootingStars: React.FC = () => {
  const [stars, setStars] = useState<ShootingStar[]>([]);
  const nextId = useRef(0);
  const lastSpawnTime = useRef(0);

  // Spawn new shooting stars occasionally
  useFrame(({ clock }) => {
    const currentTime = clock.getElapsedTime();

    // Spawn a new star every 0.3-0.8 seconds (very frequent for testing)
    const spawnInterval = 1 + Math.random() * 0.5;

    if (currentTime - lastSpawnTime.current > spawnInterval) {
      lastSpawnTime.current = currentTime;

      // Create a new shooting star at a random position within the starfield
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const radius = 50 + Math.random() * 50; // Variable depth: 50-100 units (matches starfield)

      const startPos = new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi)
      );

      // Random direction in 3D space - some travel across, some towards/away from viewer
      // Generate a random point on a unit sphere for truly random 3D direction
      const dirTheta = Math.random() * Math.PI * 2;
      const dirPhi = Math.acos(2 * Math.random() - 1);
      const direction = new THREE.Vector3(
        Math.sin(dirPhi) * Math.cos(dirTheta),
        Math.sin(dirPhi) * Math.sin(dirTheta),
        Math.cos(dirPhi)
      );

      const newStar: ShootingStar = {
        id: nextId.current++,
        startPos,
        direction,
        speed: 10 + Math.random() * 15, // Variable speed: 10-25 units/sec (slower)
        progress: 0,
        length: 4 + Math.random() * 8, // Variable length: 4-12 units (minimum length enforced)
        active: true,
        distance: radius, // Store distance for brightness calculation
      };

      setStars((prev) => [...prev, newStar]);
    }

    // Update existing stars
    setStars(
      (prev) =>
        prev
          .map((star) => ({
            ...star,
            progress: star.progress + star.speed * 0.016, // ~60fps
          }))
          .filter((star) => star.progress < star.length * 3) // Remove after trail fades
    );
  });

  return (
    <>
      {stars.map((star) => {
        if (star.progress > star.length * 3) return null;

        // Create multiple segments for gradient tail effect
        const segments = 8;
        const points: number[] = [];
        const colors: number[] = [];

        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const distance = star.progress - t * star.length;

          if (distance < 0) continue;

          const point = star.startPos
            .clone()
            .add(star.direction.clone().multiplyScalar(distance));

          points.push(point.x, point.y, point.z);

          // Bright at head (t=0), fade to transparent at tail (t=1)
          const brightness = 1 - t * 0.9; // Head is full brightness, tail fades
          colors.push(brightness, brightness, brightness);
        }

        if (points.length < 6) return null; // Need at least 2 points

        // Overall fade in/out for the whole shooting star
        const fadeProgress = Math.min(star.progress / (star.length * 0.3), 1);
        const fadeOut = Math.max(
          0,
          1 - (star.progress - star.length * 2) / star.length
        );

        // Distance-based brightness: closer stars (50 units) are brighter, farther stars (100 units) are dimmer
        const distanceFactor = 1 - ((star.distance - 50) / 50) * 0.7; // 100% at 50 units, 30% at 100 units (more pronounced)

        const globalOpacity = Math.min(fadeProgress, fadeOut) * distanceFactor;

        return (
          <line key={star.id}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={points.length / 3}
                array={new Float32Array(points)}
                itemSize={3}
                args={[new Float32Array(points), 3]}
              />
              <bufferAttribute
                attach="attributes-color"
                count={colors.length / 3}
                array={new Float32Array(colors)}
                itemSize={3}
                args={[new Float32Array(colors), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial
              vertexColors
              transparent
              opacity={globalOpacity * 0.8}
              linewidth={2}
            />
          </line>
        );
      })}
    </>
  );
};
