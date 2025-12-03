import { UKN_RES } from '../types';

export const resizeImage = (
  imageDataUrl: string,
  numFaces: number,
  callback: (canvas: HTMLCanvasElement | string) => void
): void => {
  const img = new Image();

  img.onload = () => {
    const targetResolution = Math.sqrt(numFaces * UKN_RES);

    // If image is already smaller than target, just return the original
    if (img.width <= targetResolution && img.height <= targetResolution) {
      callback(imageDataUrl);
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('Could not get canvas context');
      callback(imageDataUrl);
      return;
    }

    // Calculate scaled dimensions maintaining aspect ratio
    let width = img.width;
    let height = img.height;

    if (width > height) {
      if (width > targetResolution) {
        height = (height * targetResolution) / width;
        width = targetResolution;
      }
    } else {
      if (height > targetResolution) {
        width = (width * targetResolution) / height;
        height = targetResolution;
      }
    }

    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(img, 0, 0, width, height);

    callback(canvas);
  };

  img.onerror = () => {
    console.error('Error loading image');
    callback(imageDataUrl);
  };

  img.src = imageDataUrl;
};
