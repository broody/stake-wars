import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Face } from './Face';
import { useNFT } from '../../contexts/NFTContext';
import { useApp } from '../../contexts/AppContext';
import { extractFacePositions } from '../../utils/three-helpers';
import { TOTAL_FACES } from '../../types';

interface PlanetProps {
  mintedFaces: Record<number, boolean>;
  artFaces: Record<number, boolean>;
}

export const Planet: React.FC<PlanetProps> = ({ mintedFaces, artFaces }) => {
  const { uploadArtMode } = useApp();
  const { ownedFaces } = useNFT();

  // Create the base sphere geometry
  const sphereGeometry = useMemo(() => {
    return new THREE.IcosahedronGeometry(5, 5);
  }, []);

  const outerFrameGeometry = useMemo(() => {
    return new THREE.IcosahedronGeometry(5.01, 5);
  }, []);

  // Extract individual face positions
  const faceData = useMemo(() => {
    const faces: Array<{ idx: number; positions: Float32Array }> = [];

    // Calculate actual number of faces in the geometry
    // IcosahedronGeometry with detail 5 has (20 * 4^5) = 20,480 triangles
    const positionAttribute = sphereGeometry.attributes.position;
    const actualFaceCount = positionAttribute.count / 3; // 3 vertices per triangle

    // Use the smaller of TOTAL_FACES or actual face count
    const numFaces = Math.min(TOTAL_FACES, Math.floor(actualFaceCount));

    for (let i = 0; i < numFaces; i++) {
      const facePositions = extractFacePositions(sphereGeometry, [i]);
      faces.push({ idx: i, positions: facePositions });
    }

    return faces;
  }, [sphereGeometry]);

  // Determine visibility based on upload mode
  const isFaceVisible = (faceIdx: number) => {
    if (!uploadArtMode) return true;
    return ownedFaces.includes(faceIdx);
  };

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

      {/* Individual faces (all TOTAL_FACES) */}
      {faceData.map((face) => (
        <Face
          key={face.idx}
          faceIdx={face.idx}
          positions={face.positions}
          isMinted={mintedFaces[face.idx] || false}
          hasArt={artFaces[face.idx] || false}
          visible={isFaceVisible(face.idx)}
        />
      ))}
    </group>
  );
};
