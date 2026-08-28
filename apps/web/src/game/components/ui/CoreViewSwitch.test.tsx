import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../contexts/SectorContext', () => ({
  useSectors: () => ({
    isProjectionVisible: false,
    setProjectionVisible: vi.fn(),
    setCoreWaveFlipped: vi.fn(),
    isImageUploadMode: false,
    isSectorIndexLoading: false,
  }),
}));

vi.mock('../../contexts/SectorImageContext', () => ({
  useSectorImages: () => ({
    isLoading: false,
    isThumbnailAtlasLoading: false,
  }),
}));

import { CoreViewSwitch } from './CoreViewSwitch';

describe('CoreViewSwitch', () => {
  it('preserves Arbiter camera tracking when projection is toggled', () => {
    const markup = renderToStaticMarkup(<CoreViewSwitch />);

    expect(markup).toContain('data-preserve-core-tracking="true"');
    expect(markup).toContain('SHOW PROJECTION');
  });
});
