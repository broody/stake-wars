import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { NFTState } from '../types';

interface NFTContextType extends NFTState {
  selectFaces: (faces: number[]) => void;
  clearSelectedFaces: () => void;
  addOwnedFaces: (faces: number[]) => void;
  setTotalMinted: (total: number) => void;
  isOwnedFace: (faceId: number) => boolean;
  isSelectedFace: (faceId: number) => boolean;
}

const NFTContext = createContext<NFTContextType | undefined>(undefined);

export const NFTProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [selectedFaces, setSelectedFaces] = useState<number[]>([]);
  const [ownedFaces, setOwnedFaces] = useState<number[]>([]);
  const [totalMinted, setTotalMinted] = useState(0);

  const selectFaces = useCallback((faces: number[]) => {
    setSelectedFaces(faces);
  }, []);

  const clearSelectedFaces = useCallback(() => {
    setSelectedFaces([]);
  }, []);

  const addOwnedFaces = useCallback((faces: number[]) => {
    setOwnedFaces((prev) => [...prev, ...faces]);
  }, []);

  const isOwnedFace = useCallback(
    (faceId: number) => {
      return ownedFaces.includes(faceId);
    },
    [ownedFaces]
  );

  const isSelectedFace = useCallback(
    (faceId: number) => {
      return selectedFaces.includes(faceId);
    },
    [selectedFaces]
  );

  const value: NFTContextType = {
    selectedFaces,
    ownedFaces,
    totalMinted,
    selectFaces,
    clearSelectedFaces,
    addOwnedFaces,
    setTotalMinted,
    isOwnedFace,
    isSelectedFace,
  };

  return <NFTContext.Provider value={value}>{children}</NFTContext.Provider>;
};

export const useNFT = () => {
  const context = useContext(NFTContext);
  if (!context) {
    throw new Error('useNFT must be used within an NFTProvider');
  }
  return context;
};
