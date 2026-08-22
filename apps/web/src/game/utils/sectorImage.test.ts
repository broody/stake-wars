import { describe, expect, it } from 'vitest';
import { centeredSquareCrop, clipboardImageFile } from './sectorImage';

describe('Sector image preparation', () => {
  it('centers a landscape source', () => {
    expect(centeredSquareCrop(1200, 800)).toEqual({
      sourceX: 200,
      sourceY: 0,
      sourceWidth: 800,
      sourceHeight: 800,
    });
  });

  it('centers a portrait source', () => {
    expect(centeredSquareCrop(600, 1000)).toEqual({
      sourceX: 0,
      sourceY: 200,
      sourceWidth: 600,
      sourceHeight: 600,
    });
  });

  it('rejects invalid dimensions', () => {
    expect(() => centeredSquareCrop(0, 100)).toThrow(RangeError);
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
