import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const Icosphere = () => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Rotate the icosphere
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.002;
      meshRef.current.rotation.y += 0.003;
    }
  });

  return (
    <mesh ref={meshRef}>
      {/* IcosahedronGeometry creates an icosphere - detail level 1 gives us more triangles */}
      <icosahedronGeometry args={[1.5, 2]} />
      {/* Wireframe material with low opacity for the background effect */}
      <meshBasicMaterial
        color="#ffffff"
        wireframe={true}
        transparent={true}
        opacity={0.15}
      />
    </mesh>
  );
};

export const WireframeIcosphere = () => {
  return (
    <div className="fixed top-0 left-0 w-full h-full -z-10 opacity-50">
      <Canvas
        camera={{
          position: [0, 0, 8],
          fov: 50,
        }}
        gl={{ alpha: true, antialias: true }}
      >
        <Icosphere />
      </Canvas>
    </div>
  );
};
