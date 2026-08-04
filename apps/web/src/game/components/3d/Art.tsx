import React, { useMemo, useRef, useEffect } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { config } from '../../services/config';
import type { ArtData } from '../../types';

interface ArtProps {
  artData: ArtData;
  facePositions: Float32Array;
}

export const Art: React.FC<ArtProps> = ({ artData, facePositions }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  // const { camera } = useThree(); // TODO: Use for projection camera

  // Load texture
  const texture = useLoader(
    THREE.TextureLoader,
    artData.cameraPos ? `${config.domain}/arts/${artData._id}` : artData.image
  );

  useEffect(() => {
    if (texture) {
      texture.magFilter = THREE.NearestFilter;
    }
  }, [texture]);

  // Create geometry from face positions
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(facePositions, 3));
    geo.computeVertexNormals();
    return geo;
  }, [facePositions]);

  // Create projection camera if camera data exists
  // TODO: Implement proper camera projection for art
  // const projectionCamera = useMemo(() => {
  //   if (artData.cameraPos && artData.cameraUp && artData.cameraAspect) {
  //     const camPos = JSON.parse(artData.cameraPos);
  //     const camUp = JSON.parse(artData.cameraUp);
  //
  //     const cam = camera.clone() as THREE.PerspectiveCamera;
  //     cam.aspect = artData.cameraAspect;
  //     cam.position.set(camPos.x, camPos.y, camPos.z);
  //     cam.up.set(camUp.x, camUp.y, camUp.z);
  //     cam.lookAt(0, 0, 0);
  //     cam.updateProjectionMatrix();
  //
  //     return cam;
  //   }
  //   return camera;
  // }, [artData, camera]);

  // Basic material for now (ProjectedMaterial would be more complex to integrate)
  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });
  }, [texture]);

  // Edge lines
  const edges = useMemo(() => {
    return new THREE.EdgesGeometry(geometry, 45);
  }, [geometry]);

  return (
    <group>
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={material}
        scale={1.03}
      />
      <lineSegments geometry={edges} scale={1.03}>
        <lineBasicMaterial color={0xffffff} />
      </lineSegments>
    </group>
  );
};
