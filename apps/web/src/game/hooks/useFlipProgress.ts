import { useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { SECTOR_FLIP_DURATION_SECONDS } from '../utils/sectorFlip';

/**
 * One flip clock shared by a set of layers, so a layer that mounts mid-flip
 * joins the wave where it is instead of starting on its final face.
 */
export function useFlipProgress(flipped: boolean): MutableRefObject<number> {
  const progressRef = useRef(flipped ? 1 : 0);
  const prefersReducedMotion = useMemo(
    () =>
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false,
    []
  );

  useFrame((_state, delta) => {
    const target = flipped ? 1 : 0;
    const step = delta / SECTOR_FLIP_DURATION_SECONDS;
    const distance = target - progressRef.current;
    progressRef.current =
      prefersReducedMotion || Math.abs(distance) <= step
        ? target
        : progressRef.current + Math.sign(distance) * step;
  });

  return progressRef;
}
