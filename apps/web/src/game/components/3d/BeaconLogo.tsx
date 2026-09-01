import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  BEACON_INITIAL_ROTATION,
  BEACON_RADIUS,
  BEACON_ROTATION_SPEED,
} from '../../utils/beaconVisuals';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';

export function BeaconLogo({ className }: { className?: string }) {
  const prefersReducedMotion = useMemo(
    () =>
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false,
    []
  );

  return (
    <div aria-hidden="true" className={className} data-beacon-logo>
      <Canvas
        camera={{ position: [0, 0, 3.2], fov: 32 }}
        dpr={[1, 2]}
        frameloop={prefersReducedMotion ? 'demand' : 'always'}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <RotatingBeacon prefersReducedMotion={prefersReducedMotion} />
      </Canvas>
    </div>
  );
}

function RotatingBeacon({
  prefersReducedMotion,
}: {
  prefersReducedMotion: boolean;
}) {
  const bodyRef = useRef<THREE.Group>(null);
  const geometry = useMemo(
    () => new THREE.TetrahedronGeometry(BEACON_RADIUS, 0),
    []
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

  useEffect(
    () => () => {
      edges.dispose();
      geometry.dispose();
    },
    [edges, geometry]
  );

  useFrame((_, delta) => {
    if (!bodyRef.current || prefersReducedMotion) return;
    bodyRef.current.rotation.x += delta * BEACON_ROTATION_SPEED.x;
    bodyRef.current.rotation.y += delta * BEACON_ROTATION_SPEED.y;
    bodyRef.current.rotation.z += delta * BEACON_ROTATION_SPEED.z;
  });

  return (
    <group
      ref={bodyRef}
      rotation={[
        BEACON_INITIAL_ROTATION.x,
        BEACON_INITIAL_ROTATION.y,
        BEACON_INITIAL_ROTATION.z,
      ]}
    >
      <mesh geometry={geometry} raycast={() => undefined}>
        <meshBasicMaterial
          color={SECTOR_COLORS.neutralGrid}
          transparent
          opacity={0.18}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments geometry={edges} raycast={() => undefined}>
        <lineBasicMaterial
          color={SECTOR_COLORS.hover}
          transparent
          opacity={0.94}
          toneMapped={false}
        />
      </lineSegments>
    </group>
  );
}
