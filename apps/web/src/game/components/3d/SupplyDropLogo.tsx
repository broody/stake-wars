import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const DROP_GOLD = '#d6a84b';
const HALF_HEIGHT = 0.25;

export function SupplyDropLogo({ className }: { className?: string }) {
  const prefersReducedMotion = useMemo(
    () =>
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false,
    []
  );

  return (
    <div aria-hidden="true" className={className} data-supply-drop-logo>
      <Canvas
        camera={{ position: [1.7, 1.4, 1.7], fov: 34 }}
        onCreated={({ camera }) => camera.lookAt(0, -0.12, 0)}
        dpr={[1, 2]}
        frameloop={prefersReducedMotion ? 'demand' : 'always'}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <RotatingSupplyDrop prefersReducedMotion={prefersReducedMotion} />
      </Canvas>
    </div>
  );
}

function RotatingSupplyDrop({
  prefersReducedMotion,
}: {
  prefersReducedMotion: boolean;
}) {
  const markerRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const geometry = useMemo(
    () => new THREE.ConeGeometry(0.32, HALF_HEIGHT * 2, 3, 1, false),
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

  useFrame(({ clock }, delta) => {
    if (prefersReducedMotion || !markerRef.current || !bodyRef.current) return;
    markerRef.current.position.y =
      Math.sin(clock.getElapsedTime() * 1.45) * 0.055;
    bodyRef.current.rotation.y += delta * 0.45;
  });

  return (
    <group ref={markerRef}>
      <group ref={bodyRef} rotation={[0, Math.PI / 6, 0]}>
        {[-1, 1].map((direction) => (
          <group
            key={direction}
            position={[0, direction * HALF_HEIGHT, 0]}
            rotation={[0, 0, direction < 0 ? Math.PI : 0]}
          >
            <mesh geometry={geometry} raycast={() => undefined}>
              <meshBasicMaterial
                color="#17130b"
                transparent
                opacity={0.7}
                depthWrite={false}
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            </mesh>
            <lineSegments
              geometry={edges}
              raycast={() => undefined}
              renderOrder={3}
            >
              <lineBasicMaterial
                color="#f2c76e"
                transparent
                opacity={0.96}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </lineSegments>
          </group>
        ))}
      </group>
      <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => undefined}>
        <torusGeometry args={[0.49, 0.01, 6, 64]} />
        <meshBasicMaterial
          color={DROP_GOLD}
          transparent
          opacity={0.76}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, -0.66, 0]} raycast={() => undefined}>
        <cylinderGeometry args={[0.008, 0.008, 0.52, 3]} />
        <meshBasicMaterial
          color={DROP_GOLD}
          transparent
          opacity={0.48}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
