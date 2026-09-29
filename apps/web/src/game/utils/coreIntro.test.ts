import { describe, expect, it } from 'vitest';
import {
  advanceCoreIntro,
  CORE_INTRO_ARTWORK_WAIT_LIMIT_SECONDS,
  CORE_INTRO_HOLD_SECONDS,
  coreIntroBorderOpacity,
  createCoreIntroState,
  type CoreIntroReadiness,
  type CoreIntroState,
} from './coreIntro';
import { SECTOR_FLIP_DURATION_SECONDS } from './sectorFlip';

const FRAME = 1 / 60;
const READY: CoreIntroReadiness = { sectorsReady: true, artworkReady: true };

function run(
  state: CoreIntroState,
  seconds: number,
  readiness: CoreIntroReadiness = READY
) {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += FRAME) {
    advanceCoreIntro(state, FRAME, readiness);
  }
}

describe('Core intro sequence', () => {
  it('shows the bare Core before any Sector flips in', () => {
    const state = createCoreIntroState(false);
    run(state, CORE_INTRO_HOLD_SECONDS - 0.1);

    expect(state.flipStartedAt).toBeNull();
    expect(state.progress).toBe(0);
  });

  it('waits for the Sector index before flipping', () => {
    const state = createCoreIntroState(false);
    run(state, CORE_INTRO_HOLD_SECONDS + 1, {
      sectorsReady: false,
      artworkReady: true,
    });

    expect(state.flipStartedAt).toBeNull();
  });

  it('flips the Sectors onto their artwork, then settles', () => {
    const state = createCoreIntroState(false);
    run(state, CORE_INTRO_HOLD_SECONDS + 0.05);
    expect(state.flipStartedAt).not.toBeNull();
    expect(state.projectionSettled).toBe(false);

    run(state, SECTOR_FLIP_DURATION_SECONDS - 0.1);
    expect(state.projectionSettled).toBe(false);
    expect(state.progress).toBeGreaterThan(0.5);
    expect(state.progress).toBeLessThan(1);

    run(state, 0.15);
    expect(state.projectionSettled).toBe(true);
    expect(state.progress).toBe(1);
  });

  it('waits for artwork thumbnails before flipping, up to a limit', () => {
    const state = createCoreIntroState(false);
    const loading = { sectorsReady: true, artworkReady: false };
    run(state, CORE_INTRO_HOLD_SECONDS + 0.5, loading);
    expect(state.flipStartedAt).toBeNull();

    run(state, CORE_INTRO_ARTWORK_WAIT_LIMIT_SECONDS, loading);
    expect(state.flipStartedAt).not.toBeNull();
  });

  it('does not skip stages after a long background frame', () => {
    const state = createCoreIntroState(false);
    advanceCoreIntro(state, 30, READY);

    expect(state.flipStartedAt).toBeNull();
  });

  it('fades the Sector borders in while the flip lands', () => {
    expect(coreIntroBorderOpacity(0)).toBe(0);
    expect(coreIntroBorderOpacity(0.5)).toBe(0);
    expect(coreIntroBorderOpacity(0.75)).toBeCloseTo(0.5);
    expect(coreIntroBorderOpacity(1)).toBe(1);
  });

  it('skips the sequence for reduced motion', () => {
    const state = createCoreIntroState(true);

    expect(state.progress).toBe(1);
    expect(state.projectionSettled).toBe(true);
  });
});
