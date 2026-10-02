import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SupplyDropModel } from './SupplyDropModel';

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

  useFrame(({ clock }, delta) => {
    if (prefersReducedMotion || !markerRef.current || !bodyRef.current) return;
    markerRef.current.position.y =
      Math.sin(clock.getElapsedTime() * 1.45) * 0.055;
    bodyRef.current.rotation.y += delta * 0.45;
  });

  return (
    <group ref={markerRef}>
      <group rotation={[0, Math.PI / 6, 0]}>
        <SupplyDropModel bodyRef={bodyRef} />
      </group>
    </group>
  );
}
