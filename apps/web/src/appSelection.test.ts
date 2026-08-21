import { describe, expect, it } from 'vitest';
import { selectApp } from './appSelection';

describe('selectApp', () => {
  it('selects the landing app at the root of the primary domain', () => {
    expect(selectApp('stakewars.gg', '/')).toEqual({
      isGameApp: false,
      gameBasename: undefined,
    });
  });

  it('selects the game at /play with a matching router basename', () => {
    expect(selectApp('localhost', '/play')).toEqual({
      isGameApp: true,
      gameBasename: '/play',
    });
  });

  it('keeps nested game routes under /play', () => {
    expect(selectApp('localhost', '/play/staking')).toEqual({
      isGameApp: true,
      gameBasename: '/play',
    });
  });

  it('continues to select the game at the play subdomain root', () => {
    expect(selectApp('play.stakewars.gg', '/')).toEqual({
      isGameApp: true,
      gameBasename: undefined,
    });
  });

  it('does not select the game for unrelated routes', () => {
    expect(selectApp('localhost', '/playground')).toEqual({
      isGameApp: false,
      gameBasename: undefined,
    });
  });
});
