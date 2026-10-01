import { describe, expect, it } from 'vitest';
import { FOLLOW_CAMERA, followPullback } from './followCamera';

const FOV = 75;
const halfWidth = (aspect: number) =>
  FOLLOW_CAMERA.height *
  followPullback(FOV, aspect) *
  Math.tan((FOV * Math.PI) / 360) *
  aspect;

describe('follow camera pullback', () => {
  it('keeps the authored framing on landscape and tablet screens', () => {
    for (const aspect of [16 / 9, 4 / 3, 1, 768 / 1024])
      expect(followPullback(FOV, aspect)).toBe(1);
  });

  it('pulls back on a phone until the sides are in view', () => {
    const phone = 375 / 812;
    expect(followPullback(FOV, phone)).toBeGreaterThan(1.4);
    expect(halfWidth(phone)).toBeCloseTo(FOLLOW_CAMERA.minHalfWidth, 9);
  });

  it('stops pulling back at its limit', () => {
    expect(followPullback(FOV, 0.2)).toBe(FOLLOW_CAMERA.maxPullback);
    expect(followPullback(FOV, 0)).toBe(1);
  });
});
