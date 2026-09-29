import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/config', () => ({
  config: { starknetChainId: 'SN_MAIN' },
}));

import { AddressLink } from './AddressLink';

describe('AddressLink', () => {
  it('opens the full address on Voyager in a new tab', () => {
    const address =
      '0x06e2d33ac9878de85acc676347f6bd97a860376fe33438eb7445317a6b1d71cc';
    const markup = renderToStaticMarkup(<AddressLink address={address} />);

    expect(markup).toContain(
      `href="https://voyager.online/contract/${address}"`
    );
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noreferrer"');
    expect(markup).toContain('0x06e2d3…1d71cc');
  });
});
