import type { PreparedArbiterImage } from '../services/api';

export const ARBITER_DETAIL_WIDTH = 512;
export const ARBITER_DETAIL_HEIGHT = 288;
export const ARBITER_THUMBNAIL_WIDTH = 256;
export const ARBITER_THUMBNAIL_HEIGHT = 144;
const MAX_SOURCE_MULTIPLIER = 8;
const SUPPORTED_SOURCE_TYPES = new Set([
  'image/webp',
  'image/jpeg',
  'image/png',
]);

export interface AspectCrop {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
}

export function centeredAspectCrop(
  width: number,
  height: number,
  targetAspect: number
): AspectCrop {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(targetAspect) ||
    width <= 0 ||
    height <= 0 ||
    targetAspect <= 0
  ) {
    throw new RangeError('Image dimensions and aspect must be positive.');
  }
  const sourceAspect = width / height;
  if (sourceAspect > targetAspect) {
    const sourceWidth = height * targetAspect;
    return {
      sourceX: (width - sourceWidth) / 2,
      sourceY: 0,
      sourceWidth,
      sourceHeight: height,
    };
  }
  const sourceHeight = width / targetAspect;
  return {
    sourceX: 0,
    sourceY: (height - sourceHeight) / 2,
    sourceWidth: width,
    sourceHeight,
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

function renderBillboard(
  source: CanvasImageSource,
  width: number,
  height: number,
  outputWidth: number,
  outputHeight: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas image preparation is unavailable.');
  const crop = centeredAspectCrop(width, height, outputWidth / outputHeight);
  context.fillStyle = '#000000';
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.drawImage(
    source,
    crop.sourceX,
    crop.sourceY,
    crop.sourceWidth,
    crop.sourceHeight,
    0,
    0,
    outputWidth,
    outputHeight
  );
  return canvas;
}

export async function prepareArbiterImage(
  file: File,
  maximumEncodedBytes: number
): Promise<PreparedArbiterImage> {
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
    const detailCanvas = renderBillboard(
      bitmap,
      bitmap.width,
      bitmap.height,
      ARBITER_DETAIL_WIDTH,
      ARBITER_DETAIL_HEIGHT
    );
    const thumbnailCanvas = renderBillboard(
      bitmap,
      bitmap.width,
      bitmap.height,
      ARBITER_THUMBNAIL_WIDTH,
      ARBITER_THUMBNAIL_HEIGHT
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
    return { contentType: detail.type, detail, thumbnail };
  } finally {
    bitmap.close();
  }
}
