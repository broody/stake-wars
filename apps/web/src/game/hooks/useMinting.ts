import { useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import { useNFT } from '../contexts/NFTContext';

export const useMinting = () => {
  const { setMinting } = useApp();
  const {
    selectedFaces,
    addOwnedFaces,
    clearSelectedFaces,
    totalMinted,
    setTotalMinted,
  } = useNFT();

  const mintSelected = useCallback(async () => {
    if (selectedFaces.length === 0) return;

    setMinting(true);

    try {
      // Stub: Simulate minting transaction
      console.log('Minting faces:', selectedFaces);

      // Simulate async minting delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Add to owned faces
      addOwnedFaces(selectedFaces);

      // Update total minted
      setTotalMinted(totalMinted + selectedFaces.length);

      // Clear selection
      clearSelectedFaces();

      console.log('Minting successful');
    } catch (error) {
      console.error('Minting failed:', error);
    } finally {
      setMinting(false);
    }
  }, [
    selectedFaces,
    setMinting,
    addOwnedFaces,
    setTotalMinted,
    totalMinted,
    clearSelectedFaces,
  ]);

  return {
    mintSelected,
  };
};
