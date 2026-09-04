import type { PreparedSectorImage } from '../services/api';

export const SECTOR_DETAIL_MAX_DIMENSION = 512;
export const SECTOR_THUMBNAIL_MAX_DIMENSION = 256;
const MAX_SOURCE_MULTIPLIER = 8;
const SUPPORTED_SOURCE_TYPES = new Set([
  'image/webp',
  'image/jpeg',
  'image/png',
]);

export interface ImageDimensions {
  width: number;
  height: number;
}

export function clipboardImageFile(
  clipboardData: DataTransfer | null
): File | null {
  if (!clipboardData) return null;

  for (const item of Array.from(clipboardData.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }

  return (
    Array.from(clipboardData.files).find((file) =>
      file.type.startsWith('image/')
    ) ?? null
  );
}

export function containedImageDimensions(
  width: number,
  height: number,
  maximumDimension: number
): ImageDimensions {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(maximumDimension) ||
    width <= 0 ||
    height <= 0 ||
    maximumDimension <= 0
  ) {
    throw new RangeError('Image dimensions and limit must be positive.');
  }
  const scale = Math.min(1, maximumDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
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

function renderContained(
  source: CanvasImageSource,
  width: number,
  height: number,
  maximumDimension: number
): HTMLCanvasElement {
  const output = containedImageDimensions(width, height, maximumDimension);
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas image preparation is unavailable.');

  context.fillStyle = '#000000';
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(
    source,
    0,
    0,
    width,
    height,
    0,
    0,
    output.width,
    output.height
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
    const detailCanvas = renderContained(
      bitmap,
      bitmap.width,
      bitmap.height,
      SECTOR_DETAIL_MAX_DIMENSION
    );
    const thumbnailCanvas = renderContained(
      bitmap,
      bitmap.width,
      bitmap.height,
      SECTOR_THUMBNAIL_MAX_DIMENSION
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
    return {
      contentType: detail.type,
      detail,
      thumbnail,
      imageAspect: detailCanvas.width / detailCanvas.height,
    };
  } finally {
    bitmap.close();
  }
}
