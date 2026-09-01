import { describe, expect, it } from 'vitest';
import { nextBeaconProjectionAnimationProgress } from './beaconProjection';

describe('Beacon projection animation', () => {
  it('waits at the start while a visible projection image is loading', () => {
    expect(
      nextBeaconProjectionAnimationProgress(0, true, false, false, 0.55)
    ).toBe(0);
  });

  it('starts after the projection image is ready', () => {
    expect(
      nextBeaconProjectionAnimationProgress(0, true, true, false, 0.55)
    ).toBeCloseTo(0.5);
  });

  it('reverses when projection mode is disabled', () => {
    expect(
      nextBeaconProjectionAnimationProgress(0.5, false, true, false, 0.55)
    ).toBe(0);
  });

  it('still gates reduced-motion rendering on image readiness', () => {
    expect(nextBeaconProjectionAnimationProgress(0, true, false, true, 1)).toBe(
      0
    );
    expect(nextBeaconProjectionAnimationProgress(0, true, true, true, 1)).toBe(
      1
    );
  });
});
