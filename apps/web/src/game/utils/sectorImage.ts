import type { PreparedSectorImage } from '../services/api';

export const SECTOR_DETAIL_SIZE = 512;
export const SECTOR_THUMBNAIL_SIZE = 256;
const MAX_SOURCE_MULTIPLIER = 8;
const SUPPORTED_SOURCE_TYPES = new Set([
  'image/webp',
  'image/jpeg',
  'image/png',
]);

export interface ImageCrop {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
}

export function centeredSquareCrop(width: number, height: number): ImageCrop {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError('Image dimensions must be positive.');
  }
  const side = Math.min(width, height);
  return {
    sourceX: (width - side) / 2,
    sourceY: (height - side) / 2,
    sourceWidth: side,
    sourceHeight: side,
  };
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('This browser could not encode the image.'));
      },
      type,
      quality
    );
  });
}

function renderSquare(
  source: CanvasImageSource,
  width: number,
  height: number,
  size: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas image preparation is unavailable.');

  const crop = centeredSquareCrop(width, height);
  context.fillStyle = '#000000';
  context.fillRect(0, 0, size, size);
  context.drawImage(
    source,
    crop.sourceX,
    crop.sourceY,
    crop.sourceWidth,
    crop.sourceHeight,
    0,
    0,
    size,
    size
  );
  return canvas;
}

export async function prepareSectorImage(
  file: File,
  maximumEncodedBytes: number
): Promise<PreparedSectorImage> {
  if (!SUPPORTED_SOURCE_TYPES.has(file.type)) {
    throw new Error('Choose a WebP, JPEG, or PNG image.');
  }
  if (
    file.size <= 0 ||
    file.size > maximumEncodedBytes * MAX_SOURCE_MULTIPLIER
  ) {
    throw new Error(
      `Choose an image smaller than ${Math.round(
        (maximumEncodedBytes * MAX_SOURCE_MULTIPLIER) / 1_048_576
      )} MB before preparation.`
    );
  }

  const bitmap = await createImageBitmap(file);
  try {
    const detailCanvas = renderSquare(
      bitmap,
      bitmap.width,
      bitmap.height,
      SECTOR_DETAIL_SIZE
    );
    const thumbnailCanvas = renderSquare(
      bitmap,
      bitmap.width,
      bitmap.height,
      SECTOR_THUMBNAIL_SIZE
    );
    let detail: Blob | null = null;
    for (const quality of [0.88, 0.76, 0.64, 0.52]) {
      const candidate = await encodeCanvas(detailCanvas, 'image/webp', quality);
      if (candidate.size <= maximumEncodedBytes) {
        detail = candidate;
        break;
      }
    }
    if (!detail) {
      throw new Error('The prepared image is still too large to upload.');
    }
    const thumbnail = await encodeCanvas(thumbnailCanvas, 'image/webp', 0.78);
    if (thumbnail.size > maximumEncodedBytes) {
      throw new Error('The prepared image thumbnail is too large to upload.');
    }
    if (detail.type !== thumbnail.type) {
      throw new Error('The browser encoded inconsistent image formats.');
    }
    return { contentType: detail.type, detail, thumbnail };
  } finally {
    bitmap.close();
  }
}
