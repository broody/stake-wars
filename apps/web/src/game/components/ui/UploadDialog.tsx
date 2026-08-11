import React, { useState, useRef } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useNFT } from '../../contexts/NFTContext';
import { useArtUpload } from '../../hooks/useArtUpload';
import { cn } from '../../utils/cn';

export const UploadDialog: React.FC = () => {
  const {
    uploadArtMode,
    setUploadArtMode,
    isImageLoaded,
    isCommitting,
    isUploading,
  } = useApp();
  const { ownedFaces, selectedFaces } = useNFT();
  const { handleImageUpload, commitArt, cancelUpload } = useArtUpload();

  const [artName, setArtName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadMode = () => {
    setUploadArtMode(true);
  };

  const handleCancelMode = () => {
    setUploadArtMode(false);
    setArtName('');
    cancelUpload();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
  };

  const handleCommit = () => {
    if (!isCommitting && artName) {
      // Stub camera data - in real implementation this would come from the 3D scene
      const cameraData = {
        position: { x: 0, y: 0, z: 10 },
        up: { x: 0, y: 1, z: 0 },
        aspect: 1,
      };
      commitArt(artName, cameraData);
    }
  };

  return (
    <div className="absolute bottom-4 left-4">
      {!uploadArtMode && ownedFaces.length >= 1 && (
        <button
          onClick={handleUploadMode}
          className="px-4 py-2 bg-black/80 border border-white text-white rounded hover:bg-primary-600 transition-colors"
        >
          Upload Art
        </button>
      )}

      {uploadArtMode && (
        <div className="w-64 h-48 bg-black border border-white text-white rounded p-4">
          {selectedFaces.length > 0 && !isCommitting ? (
            <div className="space-y-3">
              <div>
                Number of NFTs: <strong>{selectedFaces.length}</strong>
              </div>
              <input
                type="text"
                placeholder="Art Name"
                value={artName}
                onChange={(e) => setArtName(e.target.value)}
                maxLength={25}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-primary-500"
              />
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                accept=".jpg,.png"
                className="w-full text-sm"
              />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-center">
              {isCommitting ? (
                <div>
                  {isUploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full" />
                      <span>Uploading Art...</span>
                    </div>
                  ) : (
                    <span>Confirm Tx... Pending Tx...</span>
                  )}
                </div>
              ) : (
                <h6 className="text-lg">Select NFTs</h6>
              )}
            </div>
          )}

          <div className="absolute bottom-4 left-4 right-4 flex justify-between">
            {!isCommitting && (
              <button
                onClick={handleCancelMode}
                className="text-sm hover:text-primary-400 transition-colors"
              >
                Cancel
              </button>
            )}
            <div className="flex items-center gap-2">
              {isCommitting && (
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              )}
              {isImageLoaded && (
                <button
                  onClick={handleCommit}
                  disabled={!artName || isCommitting}
                  className={cn(
                    'text-sm transition-colors',
                    artName && !isCommitting
                      ? 'hover:text-primary-400'
                      : 'opacity-50 cursor-not-allowed'
                  )}
                >
                  Commit
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
