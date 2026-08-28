import { describe, expect, it } from 'vitest';
import { centeredAspectCrop } from './arbiterImage';

describe('Arbiter billboard image preparation', () => {
  it('center-crops a square source to 16:9', () => {
    expect(centeredAspectCrop(1000, 1000, 16 / 9)).toEqual({
      sourceX: 0,
      sourceY: 218.75,
      sourceWidth: 1000,
      sourceHeight: 562.5,
    });
  });

  it('center-crops an extra-wide source to 16:9', () => {
    const crop = centeredAspectCrop(2000, 1000, 16 / 9);
    expect(crop.sourceX).toBeCloseTo(111.1111);
    expect(crop.sourceY).toBe(0);
    expect(crop.sourceWidth).toBeCloseTo(1777.7778);
    expect(crop.sourceHeight).toBe(1000);
  });
});
