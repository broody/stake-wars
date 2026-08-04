import React, { useMemo } from 'react';
import * as THREE from 'three';

export const Planet: React.FC = () => {
  // Create the base sphere geometry
  const sphereGeometry = useMemo(() => {
    return new THREE.IcosahedronGeometry(5, 19);
  }, []);

  const outerFrameGeometry = useMemo(() => {
    return new THREE.IcosahedronGeometry(5.01, 19);
  }, []);

  return (
    <group>
      {/* Base sphere (dark background) - more visible */}
      <mesh geometry={sphereGeometry}>
        <meshBasicMaterial color={0x111111} side={THREE.DoubleSide} />
      </mesh>

      {/* Outer wireframe - brighter for better visibility */}
      <mesh geometry={outerFrameGeometry} scale={1.002}>
        <meshBasicMaterial
          color={0xcccccc}
          wireframe
          side={THREE.DoubleSide}
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  );
};
