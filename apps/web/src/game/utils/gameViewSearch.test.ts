import { describe, expect, it } from 'vitest';
import {
  isProjectionModeEnabled,
  setProjectionMode,
  shareableGameViewSearch,
} from './gameViewSearch';

describe('game view search parameters', () => {
  it('enables projection mode only for the canonical value', () => {
    expect(isProjectionModeEnabled(new URLSearchParams('projection=1'))).toBe(
      true
    );
    expect(isProjectionModeEnabled(new URLSearchParams('projection=0'))).toBe(
      false
    );
    expect(isProjectionModeEnabled(new URLSearchParams())).toBe(false);
  });

  it('updates projection mode without dropping other URL state', () => {
    const enabled = setProjectionMode(
      new URLSearchParams('tracking=arbiter&campaign=launch'),
      true
    );
    expect(enabled.toString()).toBe(
      'tracking=arbiter&campaign=launch&projection=1'
    );

    const disabled = setProjectionMode(enabled, false);
    expect(disabled.toString()).toBe('tracking=arbiter&campaign=launch');
  });

  it('preserves only shareable game view state across navigation', () => {
    const shared = shareableGameViewSearch(
      new URLSearchParams('campaign=launch&projection=1&tracking=arbiter')
    );
    expect(shared.toString()).toBe('tracking=arbiter&projection=1');
  });
});
