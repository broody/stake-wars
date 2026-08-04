import React, { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppState } from '../types';

interface AppContextType extends AppState {
  setUploadArtMode: (mode: boolean) => void;
  setShowMintOption: (show: boolean) => void;
  setMinting: (minting: boolean) => void;
  setUploading: (uploading: boolean) => void;
  setCommitting: (committing: boolean) => void;
  setImageLoaded: (loaded: boolean) => void;
  setPreviewId: (id: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [uploadArtMode, setUploadArtMode] = useState(false);
  const [showMintOption, setShowMintOption] = useState(false);
  const [isMinting, setMinting] = useState(false);
  const [isUploading, setUploading] = useState(false);
  const [isCommitting, setCommitting] = useState(false);
  const [isImageLoaded, setImageLoaded] = useState(false);
  const [previewId, setPreviewId] = useState(-1);

  const value: AppContextType = {
    uploadArtMode,
    showMintOption,
    isMinting,
    isUploading,
    isCommitting,
    isImageLoaded,
    previewId,
    setUploadArtMode,
    setShowMintOption,
    setMinting,
    setUploading,
    setCommitting,
    setImageLoaded,
    setPreviewId,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
