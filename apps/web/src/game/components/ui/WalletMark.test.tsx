// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { walletLabel } from '../../utils/wallets';
import { WalletMark } from './WalletMark';

afterEach(() => vi.unstubAllGlobals());

async function render(kind?: string) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const node = document.createElement('div');
  const root = createRoot(node);
  await act(async () => root.render(<WalletMark kind={kind} />));
  const result = {
    text: node.textContent,
    icon: node.querySelector('img')?.getAttribute('src') ?? null,
  };
  await act(async () => root.unmount());
  return result;
}

it('shows the icon and name of each supported wallet', async () => {
  expect(await render('outis')).toEqual({
    text: 'Outis',
    icon: '/outis-mark.svg',
  });
  for (const [kind, name] of [
    ['argentX', 'Ready'],
    ['braavos', 'Braavos'],
  ]) {
    const mark = await render(kind);
    expect(mark.text).toBe(name);
    expect(mark.icon).toMatch(/^data:image\//);
  }
  expect(await render('xverse')).toEqual({ text: 'Xverse', icon: null });
});

it('shows nothing for a guest or an unknown wallet', async () => {
  expect(await render()).toEqual({ text: '', icon: null });
  expect(await render('metamask')).toEqual({ text: '', icon: null });
});

it('names a connected wallet by brand before its connector name', () => {
  expect(walletLabel('outis', 'Privacy Wallet')).toBe('Outis');
  expect(walletLabel('keplr', 'Keplr')).toBe('Keplr');
  expect(walletLabel(null, null)).toBe('Wallet');
});
