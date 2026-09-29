import { useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSectors } from '../contexts/SectorContext';
import { useSectorImages } from '../contexts/SectorImageContext';
import {
  advanceCoreIntro,
  createCoreIntroState,
  type CoreIntroState,
} from '../utils/coreIntro';

export interface CoreIntro {
  /** Below 1, the Sector shaders hide control faces (see CoreIntroState). */
  loadRevealAnimation: MutableRefObject<{ progress: number }>;
  /** The Core may flip onto its projection face, revealing artwork. */
  isFlipReleased: boolean;
  /** The artwork flip has landed; later projections may appear. */
  isProjectionSettled: boolean;
}

// Drives the one-time load sequence shared by the Core and the Beacon: the
// bare Core, one flip wave onto the artwork, and finally anything projected
// after the Core is fully shown.
export function useCoreIntro(): CoreIntro {
  const { hasLoadedSectorIndex, sectorIndexError } = useSectors();
  const { isLoading, isThumbnailAtlasLoading } = useSectorImages();
  const prefersReducedMotion = useMemo(
    () =>
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false,
    []
  );
  const introRef = useRef<CoreIntroState>(
    createCoreIntroState(prefersReducedMotion)
  );
  const [isFlipReleased, setFlipReleased] = useState(
    introRef.current.flipStartedAt !== null
  );
  const [isProjectionSettled, setProjectionSettled] = useState(
    introRef.current.projectionSettled
  );

  useFrame((_state, delta) => {
    const intro = introRef.current;
    if (intro.projectionSettled) return;
    advanceCoreIntro(intro, delta, {
      sectorsReady: hasLoadedSectorIndex || sectorIndexError !== null,
      artworkReady: !isLoading && !isThumbnailAtlasLoading,
    });
    if (intro.flipStartedAt !== null && !isFlipReleased) setFlipReleased(true);
    if (intro.projectionSettled) setProjectionSettled(true);
  });

  return {
    loadRevealAnimation: introRef,
    isFlipReleased,
    isProjectionSettled,
  };
}
