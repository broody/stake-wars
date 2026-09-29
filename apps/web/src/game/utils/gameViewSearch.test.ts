import { describe, expect, it } from 'vitest';
import { shareableGameViewSearch } from './gameViewSearch';

describe('game view search parameters', () => {
  it('preserves only shareable game view state across navigation', () => {
    const shared = shareableGameViewSearch(
      new URLSearchParams('campaign=launch&projection=0&tracking=beacon')
    );
    expect(shared.toString()).toBe('tracking=beacon');
  });
});
