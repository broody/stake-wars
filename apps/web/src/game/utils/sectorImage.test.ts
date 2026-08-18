import { describe, expect, it } from 'vitest';
import { centeredSquareCrop } from './sectorImage';

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
});
