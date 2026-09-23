import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const POOL_SIZE = 8;
const SEGMENTS = 8; // Segments per star for the gradient tail effect
const POINTS_PER_STAR = SEGMENTS + 1;

interface ShootingStar {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  positions: THREE.BufferAttribute;
  startPos: THREE.Vector3;
  direction: THREE.Vector3;
  speed: number;
  progress: number;
  length: number;
  active: boolean;
  distance: number; // Distance from center for brightness calculation
}

// Shooting stars are a fixed pool of lines updated in place, so spawning and
// animating them never re-renders React or allocates GPU buffers per frame.
export const ShootingStars: React.FC = () => {
  const timeSinceSpawn = useRef(0);
  const spawnInterval = useRef(1 + Math.random() * 0.5);

  const { group, pool } = useMemo(() => {
    const group = new THREE.Group();
    // Bright at head (t=0), fade to transparent at tail (t=1)
    const colors = new Float32Array(POINTS_PER_STAR * 3);
    for (let i = 0; i < POINTS_PER_STAR; i++) {
      colors.fill(1 - (i / SEGMENTS) * 0.9, i * 3, i * 3 + 3);
    }
    const pool: ShootingStar[] = Array.from({ length: POOL_SIZE }, () => {
      const geometry = new THREE.BufferGeometry();
      const positions = new THREE.BufferAttribute(
        new Float32Array(POINTS_PER_STAR * 3),
        3
      );
      positions.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('position', positions);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          linewidth: 2,
        })
      );
      line.visible = false;
      line.frustumCulled = false;
      group.add(line);
      return {
        line,
        positions,
        startPos: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        speed: 0,
        progress: 0,
        length: 0,
        active: false,
        distance: 0,
      };
    });
    return { group, pool };
  }, []);

  useEffect(
    () => () => {
      pool.forEach(({ line }) => {
        line.geometry.dispose();
        line.material.dispose();
      });
    },
    [pool]
  );

  useFrame((_state, delta) => {
    // Spawn a new star every 1-1.5 seconds
    timeSinceSpawn.current += delta;
    if (timeSinceSpawn.current > spawnInterval.current) {
      const star = pool.find((candidate) => !candidate.active);
      if (star) {
        timeSinceSpawn.current = 0;
        spawnInterval.current = 1 + Math.random() * 0.5;

        // Create a new shooting star at a random position within the starfield
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const radius = 50 + Math.random() * 50; // Variable depth: 50-100 units (matches starfield)
        star.startPos.set(
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.sin(phi) * Math.sin(theta),
          radius * Math.cos(phi)
        );

        // Random direction in 3D space - some travel across, some towards/away from viewer
        const dirTheta = Math.random() * Math.PI * 2;
        const dirPhi = Math.acos(2 * Math.random() - 1);
        star.direction.set(
          Math.sin(dirPhi) * Math.cos(dirTheta),
          Math.sin(dirPhi) * Math.sin(dirTheta),
          Math.cos(dirPhi)
        );
        star.speed = 10 + Math.random() * 15; // Variable speed: 10-25 units/sec
        star.progress = 0;
        star.length = 4 + Math.random() * 8; // Variable length: 4-12 units
        star.distance = radius;
        star.active = true;
      }
    }

    for (const star of pool) {
      if (!star.active) continue;
      star.progress += star.speed * Math.min(delta, 0.1);
      if (star.progress >= star.length * 3) {
        // Remove after trail fades
        star.active = false;
        star.line.visible = false;
        continue;
      }

      const array = star.positions.array as Float32Array;
      let count = 0;
      for (let i = 0; i <= SEGMENTS; i++) {
        const distance = star.progress - (i / SEGMENTS) * star.length;
        if (distance < 0) break;
        array[count * 3] = star.startPos.x + star.direction.x * distance;
        array[count * 3 + 1] = star.startPos.y + star.direction.y * distance;
        array[count * 3 + 2] = star.startPos.z + star.direction.z * distance;
        count += 1;
      }
      if (count < 2) {
        star.line.visible = false;
        continue;
      }
      star.positions.needsUpdate = true;
      star.line.geometry.setDrawRange(0, count);

      // Overall fade in/out for the whole shooting star
      const fadeProgress = Math.min(star.progress / (star.length * 0.3), 1);
      const fadeOut = Math.max(
        0,
        1 - (star.progress - star.length * 2) / star.length
      );
      // Distance-based brightness: 100% at 50 units, 30% at 100 units
      const distanceFactor = 1 - ((star.distance - 50) / 50) * 0.7;
      star.line.material.opacity =
        Math.min(fadeProgress, fadeOut) * distanceFactor * 0.8;
      star.line.visible = true;
    }
  });

  return <primitive object={group} />;
};
