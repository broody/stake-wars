import * as THREE from 'three';

const BEACON_PROJECTION_ANIMATION_DURATION_SECONDS = 1.1;

export function nextBeaconProjectionAnimationProgress(
  current: number,
  isProjectionVisible: boolean,
  isImageReady: boolean,
  prefersReducedMotion: boolean,
  delta: number
) {
  const shouldReveal = isProjectionVisible && isImageReady;
  if (prefersReducedMotion) return shouldReveal ? 1 : 0;

  return THREE.MathUtils.clamp(
    current +
      (shouldReveal ? delta : -delta) /
        BEACON_PROJECTION_ANIMATION_DURATION_SECONDS,
    0,
    1
  );
}
