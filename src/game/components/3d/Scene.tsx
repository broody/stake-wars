import React, { useEffect, useState } from 'react';
import { Planet } from './Planet';
import { Stars } from './Stars';
import { ShootingStars } from './ShootingStars';
import { Art } from './Art';
import { extractFacePositions } from '../../utils/three-helpers';
import type { ArtData } from '../../types';
import * as THREE from 'three';

export const Scene: React.FC = () => {
  const [artworks] = useState<ArtData[]>([]);
  // const [artFaces] = useState<Record<number, boolean>>({});

  // Load artworks on mount (disabled - backend not available)
  useEffect(() => {
    // TODO: Enable when backend is available
    // For now, start with no artworks
    // Uncomment below to enable API fetching:
    /*
    const loadArtworks = async () => {
      try {
        const arts = await api.getArt();
        setArtworks(arts);

        // Mark faces that have art
        const facesWithArt: Record<number, boolean> = {};
        arts.forEach((art) => {
          art.tokenIds.forEach((tokenId) => {
            facesWithArt[tokenId] = true;
          });
        });
        setArtFaces(facesWithArt);
      } catch (error) {
        console.error('Failed to load artworks:', error);
      }
    };

    loadArtworks();
    */
  }, []);

  // Create base sphere geometry for extracting face positions
  const sphereGeometry = React.useMemo(() => {
    return new THREE.IcosahedronGeometry(5, 5);
  }, []);

  return (
    <>
      {/* Background stars */}
      <Stars />

      {/* Shooting stars */}
      <ShootingStars />

      {/* Main planet with faces */}
      <Planet />

      {/* Orbiting moon */}
      {/* <Moon /> */}

      {/* Render artworks */}
      {artworks.map((art) => {
        const facePositions = extractFacePositions(
          sphereGeometry,
          art.tokenIds
        );
        return (
          <Art key={art._id} artData={art} facePositions={facePositions} />
        );
      })}

      {/* Lights */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
    </>
  );
};
