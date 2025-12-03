import React, { useEffect, useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { ArcballControls } from '@react-three/drei';
import { Scene } from './Scene';
import { IdleCameraRotation } from './IdleCameraRotation';
import { useNFT } from '../../contexts/NFTContext';

export const World: React.FC = () => {
  const [mintedFaces] = useState<Record<number, boolean>>({});
  const { setTotalMinted } = useNFT();

  // Load initial minted data (disabled - backend not available)
  useEffect(() => {
    // TODO: Enable when backend is available
    // For now, start with empty minted data (all faces unminted)
    setTotalMinted(0);

    // Uncomment below to enable API fetching:
    /*
    const loadMintedData = async () => {
      try {
        const data = await api.getMinted();
        
        const minted: Record<number, boolean> = {};
        data.minted.forEach((tokenId) => {
          minted[tokenId] = true;
        });
        
        setMintedFaces(minted);
        setTotalMinted(data.minted.length);
      } catch (error) {
        console.error('Failed to load minted data:', error);
      }
    };

    loadMintedData();

    // Poll for new mints every 5 seconds
    const interval = setInterval(async () => {
      try {
        const data = await api.getMinted();
        const minted: Record<number, boolean> = {};
        data.minted.forEach((tokenId) => {
          minted[tokenId] = true;
        });
        
        setMintedFaces(minted);
        setTotalMinted(data.minted.length);
      } catch (error) {
        console.error('Failed to poll minted data:', error);
      }
    }, 5000);

    return () => clearInterval(interval);
    */
  }, [setTotalMinted]);

  return (
    <Canvas
      camera={{ position: [0, 0, 15], fov: 75 }}
      style={{ width: '100%', height: '100%', background: '#000000' }}
    >
      <Suspense fallback={null}>
        <Scene mintedFaces={mintedFaces} />
      </Suspense>

      {/* ArcballControls provides free rotation including roll by default */}
      <ArcballControls minDistance={8} maxDistance={30} enablePan={false} />

      {/* Idle camera rotation after 10 seconds of inactivity */}
      <IdleCameraRotation />
    </Canvas>
  );
};
