import { SECTOR_FLIP_DURATION_SECONDS } from './sectorFlip';

/** The bare Core stays on screen this long before any Sector appears. */
export const CORE_INTRO_HOLD_SECONDS = 1.2;
/** Flip anyway if artwork thumbnails are still loading after this long. */
export const CORE_INTRO_ARTWORK_WAIT_LIMIT_SECONDS = 2;
// Background tabs can resume with a very large delta; cap it so the intro
// continues where it left off instead of skipping stages.
const MAX_INTRO_FRAME_DELTA_SECONDS = 1 / 20;

export interface CoreIntroState {
  /**
   * How far the intro flip has run: 0 until it starts, 1 once it has
   * settled. Below 1, the Sector shaders hide control faces.
   */
  progress: number;
  elapsed: number;
  flipStartedAt: number | null;
  /** The artwork flip has landed; later projections may appear. */
  projectionSettled: boolean;
}

export interface CoreIntroReadiness {
  sectorsReady: boolean;
  artworkReady: boolean;
}

export function createCoreIntroState(reducedMotion: boolean): CoreIntroState {
  return reducedMotion
    ? { progress: 1, elapsed: 0, flipStartedAt: 0, projectionSettled: true }
    : {
        progress: 0,
        elapsed: 0,
        flipStartedAt: null,
        projectionSettled: false,
      };
}

/**
 * Advances the load sequence: the bare Core, then one flip wave that turns
 * the occupied Sectors over onto their artwork, then anything projected after.
 */
export function advanceCoreIntro(
  state: CoreIntroState,
  deltaSeconds: number,
  { sectorsReady, artworkReady }: CoreIntroReadiness
): void {
  if (state.projectionSettled) return;
  const step = Math.min(
    Math.max(deltaSeconds, 0),
    MAX_INTRO_FRAME_DELTA_SECONDS
  );
  state.elapsed += step;

  if (state.flipStartedAt === null) {
    if (!sectorsReady || state.elapsed < CORE_INTRO_HOLD_SECONDS) return;
    const waitedForArtwork = state.elapsed - CORE_INTRO_HOLD_SECONDS;
    if (
      !artworkReady &&
      waitedForArtwork < CORE_INTRO_ARTWORK_WAIT_LIMIT_SECONDS
    ) {
      return;
    }
    state.flipStartedAt = state.elapsed;
    return;
  }

  const flipProgress =
    (state.elapsed - state.flipStartedAt) / SECTOR_FLIP_DURATION_SECONDS;
  if (flipProgress >= 1) {
    state.progress = 1;
    state.projectionSettled = true;
    return;
  }
  state.progress = flipProgress;
}

/** Sector borders fade in while the intro flip lands. */
export function coreIntroBorderOpacity(progress: number): number {
  const fade = Math.min(Math.max((progress - 0.5) / 0.5, 0), 1);
  return fade * fade * (3 - 2 * fade);
}
