import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { useNFT } from '../../contexts/NFTContext';
import { useMinting } from '../../hooks/useMinting';
import { useSelection } from '../../hooks/useSelection';

export const SelectionPanel: React.FC = () => {
  const { showMintOption, isMinting, uploadArtMode } = useApp();
  const { selectedFaces } = useNFT();
  const { mintSelected } = useMinting();
  const { clearSelection } = useSelection();

  // Don't show if no faces selected in mint mode
  if (!uploadArtMode && selectedFaces.length === 0) {
    return null;
  }

  if (!uploadArtMode && showMintOption && selectedFaces.length > 0) {
    return (
      <div className="absolute top-20 right-4 px-4 py-3 bg-black/80 border border-white text-white rounded-lg">
        <div className="flex items-center gap-4">
          <strong>{selectedFaces.length} NFTs</strong>
          {!isMinting ? (
            <span>
              ({' '}
              <button onClick={mintSelected} className="hover:text-primary-400">
                Mint
              </button>{' '}
              |{' '}
              <button
                onClick={clearSelection}
                className="hover:text-primary-400"
              >
                Clear
              </button>{' '}
              )
            </span>
          ) : (
            <span className="flex items-center gap-2">
              ({' '}
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              Minting... )
            </span>
          )}
        </div>
      </div>
    );
  }

  return null;
};
