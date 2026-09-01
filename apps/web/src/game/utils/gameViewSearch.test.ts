import { describe, expect, it } from 'vitest';
import {
  isProjectionModeEnabled,
  setProjectionMode,
  shareableGameViewSearch,
} from './gameViewSearch';

describe('game view search parameters', () => {
  it('defaults projection mode on unless explicitly disabled', () => {
    expect(isProjectionModeEnabled(new URLSearchParams('projection=1'))).toBe(
      true
    );
    expect(isProjectionModeEnabled(new URLSearchParams('projection=0'))).toBe(
      false
    );
    expect(isProjectionModeEnabled(new URLSearchParams())).toBe(true);
  });

  it('updates projection mode without dropping other URL state', () => {
    const enabled = setProjectionMode(
      new URLSearchParams('tracking=beacon&campaign=launch'),
      true
    );
    expect(enabled.toString()).toBe(
      'tracking=beacon&campaign=launch&projection=1'
    );

    const disabled = setProjectionMode(enabled, false);
    expect(disabled.toString()).toBe(
      'tracking=beacon&campaign=launch&projection=0'
    );
  });

  it('preserves only shareable game view state across navigation', () => {
    const shared = shareableGameViewSearch(
      new URLSearchParams('campaign=launch&projection=1&tracking=beacon')
    );
    expect(shared.toString()).toBe('tracking=beacon&projection=1');
  });

  it('preserves an explicitly disabled projection across navigation', () => {
    const shared = shareableGameViewSearch(
      new URLSearchParams('campaign=launch&projection=0&tracking=beacon')
    );
    expect(shared.toString()).toBe('tracking=beacon&projection=0');
  });
});
