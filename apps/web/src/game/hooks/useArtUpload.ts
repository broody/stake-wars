import { useCallback, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useNFT } from '../contexts/NFTContext';
import { resizeImage } from '../utils/imageResizer';
import { api } from '../services/api';

interface CameraData {
  position: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  aspect: number;
}

export const useArtUpload = () => {
  const { setImageLoaded, setUploading, setCommitting, setUploadArtMode } =
    useApp();
  const { selectedFaces, clearSelectedFaces } = useNFT();
  const [currentCanvas, setCurrentCanvas] = useState<HTMLCanvasElement | null>(
    null
  );

  const handleImageUpload = useCallback(
    (file: File) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = reader.result as string;

        resizeImage(result, selectedFaces.length, (canvas) => {
          if (typeof canvas === 'string') {
            // Image doesn't need resizing, use as-is
            setImageLoaded(true);
            // Create a canvas from the data URL
            const img = new Image();
            img.onload = () => {
              const newCanvas = document.createElement('canvas');
              newCanvas.width = img.width;
              newCanvas.height = img.height;
              const ctx = newCanvas.getContext('2d');
              ctx?.drawImage(img, 0, 0);
              setCurrentCanvas(newCanvas);
            };
            img.src = canvas;
          } else {
            // Resized canvas
            setCurrentCanvas(canvas);
            setImageLoaded(true);
          }
        });
      };

      reader.onerror = () => {
        console.error('Error reading file');
      };

      reader.readAsDataURL(file);
    },
    [selectedFaces.length, setImageLoaded]
  );

  const commitArt = useCallback(
    async (artName: string, cameraData: CameraData) => {
      if (!currentCanvas) return;

      setCommitting(true);
      setUploading(true);

      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          currentCanvas.toBlob((result) => {
            if (result) {
              resolve(result);
              return;
            }

            reject(new Error('Unable to encode image'));
          });
        });

        const formData = new FormData();
        formData.append('ownerId', 'stub-owner-id'); // TODO: Use actual wallet address
        formData.append('faces', selectedFaces.join(','));
        formData.append('name', artName);
        formData.append('position', JSON.stringify(cameraData.position));
        formData.append('up', JSON.stringify(cameraData.up));
        formData.append('aspect', cameraData.aspect.toString());
        formData.append('image', blob);

        setUploading(false);

        const result = await api.uploadArt(formData);

        console.log('Art uploaded successfully:', result.artId);

        setImageLoaded(false);
        setCommitting(false);
        setUploadArtMode(false);
        clearSelectedFaces();
      } catch (error) {
        console.error('Error uploading art:', error);
        setImageLoaded(false);
        setUploading(false);
        setCommitting(false);
      }
    },
    [
      currentCanvas,
      selectedFaces,
      setCommitting,
      setUploading,
      setImageLoaded,
      setUploadArtMode,
      clearSelectedFaces,
    ]
  );

  const cancelUpload = useCallback(() => {
    setImageLoaded(false);
    setCurrentCanvas(null);
  }, [setImageLoaded]);

  return {
    handleImageUpload,
    commitArt,
    cancelUpload,
    currentCanvas,
  };
};
