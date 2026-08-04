import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const Moon: React.FC = () => {
  const moonRef = useRef<THREE.Mesh>(null);
  const orbitAngle = useRef(0);

  // Orbit parameters (same as in useFrame)
  const orbitRadiusX = 25;
  const orbitRadiusZ = 35;
  const offsetX = 15;

  // Create orbit path visualization
  const orbitPath = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = 128; // Number of points to draw the ellipse

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * orbitRadiusX + offsetX;
      const z = Math.sin(angle) * orbitRadiusZ;
      const y = 0;
      points.push(new THREE.Vector3(x, y, z));
    }

    return new THREE.BufferGeometry().setFromPoints(points);
  }, [orbitRadiusX, orbitRadiusZ, offsetX]);

  useFrame((_state, delta) => {
    if (moonRef.current) {
      // Orbit around the main sphere with highly elliptical path
      orbitAngle.current += delta * 0.15; // Speed of orbit (slowed down by half)

      moonRef.current.position.x =
        Math.cos(orbitAngle.current) * orbitRadiusX + offsetX;
      moonRef.current.position.z = Math.sin(orbitAngle.current) * orbitRadiusZ;
      moonRef.current.position.y = 0; // Keep it on the same plane

      // Slow rotation of the moon itself
      moonRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <>
      {/* Orbit track visualization - hidden for now */}
      {false && (
        <lineLoop geometry={orbitPath}>
          <lineBasicMaterial color={0xffffff} transparent opacity={0.2} />
        </lineLoop>
      )}

      {/* Moon */}
      <mesh ref={moonRef}>
        <icosahedronGeometry args={[1, 2]} />
        <meshBasicMaterial color={0x222222} side={THREE.DoubleSide} />

        {/* Add wireframe overlay */}
        <lineSegments>
          <edgesGeometry args={[new THREE.IcosahedronGeometry(1, 2)]} />
          <lineBasicMaterial color={0xffffff} transparent opacity={0.3} />
        </lineSegments>
      </mesh>
    </>
  );
};
