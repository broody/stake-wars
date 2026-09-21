// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ControllerConnector } from '@cartridge/connector';
import { StarknetWalletApi } from '@starknet-io/get-starknet-wallet-standard/features';

describe('controller wallet-standard adapter', () => {
  it('exposes the wallet-standard feature shape the app expects', () => {
    const connector = new ControllerConnector({ lazyload: true });
    const wallet = connector.asWalletStandard() as never as {
      name: string;
      features: Record<string, { id?: string }>;
    };
    expect(wallet.name).toBe('Controller');
    expect(wallet.features['starknet:walletApi']?.id).toBe('controller');
    expect(wallet.features[StarknetWalletApi]?.id).toBe('controller');
  });
});
