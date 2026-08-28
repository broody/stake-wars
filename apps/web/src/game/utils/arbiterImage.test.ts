import { describe, expect, it } from 'vitest';
import { containedImageDimensions } from './arbiterImage';

describe('Arbiter billboard image preparation', () => {
  it('preserves square images', () => {
    expect(containedImageDimensions(1000, 1000, 512)).toEqual({
      width: 512,
      height: 512,
    });
  });

  it('preserves landscape and portrait ratios', () => {
    expect(containedImageDimensions(2000, 1000, 512)).toEqual({
      width: 512,
      height: 256,
    });
    expect(containedImageDimensions(1000, 2000, 512)).toEqual({
      width: 256,
      height: 512,
    });
  });

  it('does not upscale smaller images', () => {
    expect(containedImageDimensions(320, 180, 512)).toEqual({
      width: 320,
      height: 180,
    });
  });
});
