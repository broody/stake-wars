import React from 'react';
import { World } from '../components/3d/World';
import { SelectionPanel } from '../components/ui/SelectionPanel';
import { UploadDialog } from '../components/ui/UploadDialog';
import { PreviewCard } from '../components/ui/PreviewCard';
import { useApp } from '../contexts/AppContext';
import { useNFT } from '../contexts/NFTContext';

export const Home: React.FC = () => {
  const { uploadArtMode, previewId } = useApp();
  const { totalMinted, selectedFaces } = useNFT();

  return (
    <div className="relative w-full h-full">
      {/* 3D World Canvas */}
      <World />

      {/* Top-left info */}
      {!uploadArtMode && (
        <div className="absolute top-20 left-4 text-fg font-mono text-sm">
          <div className="text-dim">
            {'>'} CONTROL_POINTS{' '}
            <span className="text-fg">{totalMinted}/2000</span>
          </div>
          <div className="text-dim">
            {'>'} MIN_STAKE <span className="text-fg">100 $STRK</span>
          </div>
        </div>
      )}

      {/* Bottom-right Twitter link */}
      <div className="absolute bottom-4 right-4 text-dim font-mono text-sm">
        <a
          href="https://twitter.com/stakewars_gg"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-fg transition-colors"
        >
          @stakewars_gg
        </a>
      </div>

      {/* Selection Panel (top-right) */}
      <SelectionPanel />

      {/* Upload Dialog (bottom-left) */}
      <UploadDialog />

      {/* Preview Card (top-right, when previewing) */}
      {!uploadArtMode && previewId !== -1 && selectedFaces.length === 0 && (
        <PreviewCard tokenId={previewId} />
      )}
    </div>
  );
};
