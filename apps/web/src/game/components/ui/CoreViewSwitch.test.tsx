import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sectors = vi.hoisted(() => ({
  controlView: 'flat' as 'flat' | 'staked',
  changeControlView: vi.fn(),
  ownedSectorIds: [4, 9] as number[],
  isOwnedSectorsView: false,
  setOwnedSectorsView: vi.fn(),
  isImageUploadMode: false,
}));

vi.mock('../../contexts/SectorContext', () => ({
  useSectors: () => sectors,
}));

import { CoreViewSwitch } from './CoreViewSwitch';

function pressedStates(markup: string): string[] {
  return [...markup.matchAll(/aria-pressed="(true|false)"/g)].map(
    (match) => match[1]
  );
}

describe('CoreViewSwitch', () => {
  beforeEach(() => {
    sectors.controlView = 'flat';
    sectors.ownedSectorIds = [4, 9];
    sectors.isOwnedSectorsView = false;
    sectors.isImageUploadMode = false;
  });

  it('offers STAKED VIEW and YOUR SECTORS to an Operator who holds Sectors', () => {
    const markup = renderToStaticMarkup(<CoreViewSwitch />);

    expect(markup).toContain('data-preserve-core-tracking="true"');
    expect(markup).toContain('STAKED VIEW');
    expect(markup).toContain('YOUR SECTORS');
    expect(pressedStates(markup)).toEqual(['false', 'false']);
  });

  it('shows which views are active', () => {
    sectors.controlView = 'staked';
    expect(pressedStates(renderToStaticMarkup(<CoreViewSwitch />))).toEqual([
      'true',
      'false',
    ]);

    sectors.controlView = 'flat';
    sectors.isOwnedSectorsView = true;
    expect(pressedStates(renderToStaticMarkup(<CoreViewSwitch />))).toEqual([
      'false',
      'true',
    ]);
  });

  it('offers only STAKED VIEW without owned Sectors', () => {
    sectors.ownedSectorIds = [];
    const markup = renderToStaticMarkup(<CoreViewSwitch />);

    expect(markup).toContain('STAKED VIEW');
    expect(markup).not.toContain('YOUR SECTORS');
  });

  it('is hidden during image upload', () => {
    sectors.isImageUploadMode = true;
    expect(renderToStaticMarkup(<CoreViewSwitch />)).toBe('');
  });
});
