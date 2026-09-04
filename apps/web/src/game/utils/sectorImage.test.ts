import { describe, expect, it } from 'vitest';
import { clipboardImageFile, containedImageDimensions } from './sectorImage';

describe('Sector image preparation', () => {
  it('fits a landscape source without cropping', () => {
    expect(containedImageDimensions(1200, 800, 512)).toEqual({
      width: 512,
      height: 341,
    });
  });

  it('fits a portrait source without cropping', () => {
    expect(containedImageDimensions(600, 1000, 512)).toEqual({
      width: 307,
      height: 512,
    });
  });

  it('does not upscale a smaller source', () => {
    expect(containedImageDimensions(320, 180, 512)).toEqual({
      width: 320,
      height: 180,
    });
  });

  it('rejects invalid dimensions', () => {
    expect(() => containedImageDimensions(0, 100, 512)).toThrow(RangeError);
  });

  it('extracts an image item from clipboard data', () => {
    const image = { name: 'clipboard.png', type: 'image/png' } as File;
    const clipboardData = {
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
        { kind: 'file', type: 'image/png', getAsFile: () => image },
      ],
      files: [],
    } as unknown as DataTransfer;

    expect(clipboardImageFile(clipboardData)).toBe(image);
  });

  it('falls back to clipboard files and ignores non-images', () => {
    const text = { name: 'notes.txt', type: 'text/plain' } as File;
    const image = { name: 'clipboard.jpg', type: 'image/jpeg' } as File;
    const clipboardData = {
      items: [],
      files: [text, image],
    } as unknown as DataTransfer;

    expect(clipboardImageFile(clipboardData)).toBe(image);
    expect(
      clipboardImageFile({
        items: [],
        files: [text],
      } as unknown as DataTransfer)
    ).toBeNull();
  });
});
