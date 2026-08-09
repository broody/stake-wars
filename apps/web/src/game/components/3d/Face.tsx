import React, { useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useSelection } from '../../hooks/useSelection';
import { useApp } from '../../contexts/AppContext';
import type { FaceMesh } from '../../types';

interface FaceProps {
  faceIdx: number;
  positions: Float32Array;
  isMinted: boolean;
  hasArt: boolean;
  visible?: boolean;
}

export const Face: React.FC<FaceProps> = ({
  faceIdx,
  positions,
  isMinted,
  hasArt,
  visible = true,
}) => {
  const meshRef = useRef<FaceMesh>(null);
  const { handleFaceClick, isSelectedFace } = useSelection();
  const { uploadArtMode } = useApp();
  const isSelected = isSelectedFace(faceIdx);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }, [positions]);

  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.DoubleSide,
    });
  }, []);

  const selectionMaterial = useMemo(() => {
    const color = uploadArtMode ? 0x0088ff : 0x00ff00;
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
  }, [uploadArtMode]);

  // Create edges for wireframe
  const edges = useMemo(() => {
    return new THREE.EdgesGeometry(geometry, 30);
  }, [geometry]);

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (meshRef.current) {
      const faceMesh = meshRef.current;
      faceMesh.faceIdx = faceIdx;
      faceMesh.isMinted = isMinted;
      faceMesh.hasArt = hasArt;
      handleFaceClick(faceMesh);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <group>
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={isSelected ? selectionMaterial : material}
        onClick={handleClick}
        scale={1.01}
      />
      {/* Wireframe edges for each face */}
      <lineSegments geometry={edges} scale={1.011}>
        <lineBasicMaterial color={0xffffff} transparent opacity={0.4} />
      </lineSegments>
    </group>
  );
};
