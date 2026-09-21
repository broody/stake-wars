import { describe, expect, it } from 'vitest';
import { isBraavosWallet, isReadyWallet, isSupportedWallet } from './wallets';

describe('wallet detection', () => {
  it('recognizes Ready by id or name', () => {
    expect(isReadyWallet('Ready', 'argentX')).toBe(true);
    expect(isReadyWallet('Ready')).toBe(true);
    expect(isReadyWallet('Argent Mobile')).toBe(true);
    expect(isReadyWallet('Braavos', 'braavos')).toBe(false);
  });

  it('recognizes Braavos by id or name', () => {
    expect(isBraavosWallet('Braavos', 'braavos')).toBe(true);
    expect(isBraavosWallet('Braavos')).toBe(true);
    expect(isBraavosWallet('Ready', 'argentX')).toBe(false);
  });

  it('accepts only supported connectors', () => {
    expect(isSupportedWallet('Ready', 'argentX')).toBe(true);
    expect(isSupportedWallet('Braavos', 'braavos')).toBe(true);
    expect(isSupportedWallet('Keplr', 'keplr')).toBe(false);
  });
});
