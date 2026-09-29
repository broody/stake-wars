import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sectors = vi.hoisted(() => ({
  ownedSectorIds: [4, 9] as number[],
  isOwnedSectorsView: false,
  setOwnedSectorsView: vi.fn(),
  isImageUploadMode: false,
}));

vi.mock('../../contexts/SectorContext', () => ({
  useSectors: () => sectors,
}));

import { CoreViewSwitch } from './CoreViewSwitch';

describe('CoreViewSwitch', () => {
  beforeEach(() => {
    sectors.ownedSectorIds = [4, 9];
    sectors.isOwnedSectorsView = false;
    sectors.isImageUploadMode = false;
  });

  it('offers YOUR SECTORS to an Operator who holds Sectors', () => {
    const markup = renderToStaticMarkup(<CoreViewSwitch />);

    expect(markup).toContain('data-preserve-core-tracking="true"');
    expect(markup).toContain('YOUR SECTORS');
    expect(markup).toContain('aria-pressed="false"');
  });

  it('shows when the owned-Sector view is active', () => {
    sectors.isOwnedSectorsView = true;

    expect(renderToStaticMarkup(<CoreViewSwitch />)).toContain(
      'aria-pressed="true"'
    );
  });

  it('is hidden without owned Sectors or during image upload', () => {
    sectors.ownedSectorIds = [];
    expect(renderToStaticMarkup(<CoreViewSwitch />)).toBe('');

    sectors.ownedSectorIds = [4];
    sectors.isImageUploadMode = true;
    expect(renderToStaticMarkup(<CoreViewSwitch />)).toBe('');
  });
});
