import { useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import { useNFT } from '../contexts/NFTContext';
import { MAX_SELECTION } from '../types';
import type { FaceMesh } from '../types';

export const useSelection = () => {
  const { uploadArtMode, setShowMintOption, setPreviewId } = useApp();
  const { selectedFaces, selectFaces, clearSelectedFaces, isSelectedFace } =
    useNFT();

  const handleFaceClick = useCallback(
    (face: FaceMesh) => {
      // Check if already selected
      const isSelected = isSelectedFace(face.faceIdx);

      if (isSelected) {
        // Deselect
        const newSelection = selectedFaces.filter((id) => id !== face.faceIdx);
        selectFaces(newSelection);

        if (newSelection.length === 0) {
          setShowMintOption(false);
          setPreviewId(-1);
        }
        return;
      }

      // Check max selection in upload mode
      if (uploadArtMode) {
        if (face.hasArt) {
          alert('Cannot change existing art... yet.');
          return;
        }
        selectFaces([...selectedFaces, face.faceIdx]);
        return;
      }

      // Normal mode - minting
      if (!face.isMinted) {
        if (selectedFaces.length >= MAX_SELECTION) {
          alert(`Max mintable limited to ${MAX_SELECTION} NFTs`);
          return;
        }
        setShowMintOption(true);
        selectFaces([...selectedFaces, face.faceIdx]);
      } else {
        // Preview mode
        setPreviewId(face.faceIdx);
        clearSelectedFaces();
      }
    },
    [
      uploadArtMode,
      selectedFaces,
      isSelectedFace,
      selectFaces,
      clearSelectedFaces,
      setShowMintOption,
      setPreviewId,
    ]
  );

  const clearSelection = useCallback(() => {
    clearSelectedFaces();
    setShowMintOption(false);
    setPreviewId(-1);
  }, [clearSelectedFaces, setShowMintOption, setPreviewId]);

  return {
    selectedFaces,
    handleFaceClick,
    clearSelection,
    isSelectedFace,
  };
};
