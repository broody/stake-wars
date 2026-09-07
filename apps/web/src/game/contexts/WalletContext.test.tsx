// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StarknetInjectedWallet,
  type Store,
  type WalletWithStarknetFeatures,
} from '@starknet-io/get-starknet-core';
import { StarknetConfig } from '@starknetfoundation/starknet-start-react';
import { RpcProvider } from 'starknet';
import { stakeWarsChain } from '../providers/chain';
import { WalletProvider, useWallet } from './WalletContext';

const LAST_WALLET_KEY = 'get-starknet.last-connected-wallet';
const chainId = `0x${stakeWarsChain.id.toString(16)}`;
const chains = [stakeWarsChain];
const rpc = new RpcProvider({ nodeUrl: 'http://localhost:5050' });
const provider = () => rpc;

function readyWallet({
  id = 'argentX',
  network = chainId,
  requestAccounts = async () => ['0x123'],
}: {
  id?: string;
  network?: string;
  requestAccounts?: (silent?: boolean) => Promise<string[]>;
} = {}) {
  const listeners = new Map<string, (accounts: string[]) => void>();
  const request = vi.fn(
    async ({
      type,
      params,
    }: {
      type: string;
      params?: { silent_mode?: boolean };
    }) => {
      if (type === 'wallet_requestAccounts') {
        return requestAccounts(params?.silent_mode);
      }
      if (type === 'wallet_requestChainId') return network;
      if (type === 'wallet_supportedWalletApi') return [];
      throw new Error(`Unexpected wallet request: ${type}`);
    }
  );
  const wallet = new StarknetInjectedWallet({
    id,
    name: 'Ready',
    icon: 'data:image/png;base64,AA==',
    version: '6.0.0',
    request,
    on: (event: string, listener: (accounts: string[]) => void) => {
      listeners.set(event, listener);
    },
  } as unknown as ConstructorParameters<typeof StarknetInjectedWallet>[0]);
  return {
    wallet,
    request,
    accountsChanged: (accounts: string[]) =>
      listeners.get('accountsChanged')?.(accounts),
  };
}

function discovery(initial: WalletWithStarknetFeatures[] = []) {
  let wallets = initial;
  const listeners = new Set<Parameters<Store['subscribe']>[0]>();
  const store: Store = {
    getWallets: () => wallets,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    _refreshInjectedWallets: () => {},
  };
  return {
    store,
    register: (...next: WalletWithStarknetFeatures[]) => {
      wallets = next;
      listeners.forEach((listener) => listener(wallets));
    },
  };
}

let current: ReturnType<typeof useWallet>;
let root: Root;
let container: HTMLDivElement;

function WalletProbe() {
  current = useWallet();
  return (
    <output>
      {current.isConnecting
        ? 'connecting'
        : current.isConnected
          ? current.address
          : 'disconnected'}
    </output>
  );
}

async function mount(store: Store) {
  await act(async () => {
    root.render(
      <StrictMode>
        <StarknetConfig
          chains={chains}
          defaultChainId={stakeWarsChain.id}
          provider={provider}
          store={store}
        >
          <WalletProvider>
            <WalletProbe />
          </WalletProvider>
        </StarknetConfig>
      </StrictMode>
    );
  });
}

async function reload(store: Store) {
  await act(async () => root.unmount());
  root = createRoot(container);
  await mount(store);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('wallet automatic reconnection', () => {
  it('silently restores the remembered Ready wallet once under StrictMode', async () => {
    window.localStorage.setItem(LAST_WALLET_KEY, 'argentX');
    const ready = readyWallet();
    await mount(discovery([ready.wallet]).store);

    expect(current.isConnected).toBe(true);
    expect(BigInt(current.address!)).toBe(0x123n);
    expect(current.walletName).toBe('Ready');
    expect(
      ready.request.mock.calls.filter(
        ([r]) => r.type === 'wallet_requestAccounts'
      )
    ).toEqual([
      [{ type: 'wallet_requestAccounts', params: { silent_mode: true } }],
    ]);
    expect(container.textContent).toBe(current.address);
  });

  it('waits for the remembered wallet without selecting another installed wallet', async () => {
    window.localStorage.setItem(LAST_WALLET_KEY, 'argentX');
    const other = readyWallet({ id: 'other' });
    const ready = readyWallet();
    const discovered = discovery([other.wallet]);
    await mount(discovered.store);
    expect(other.request).not.toHaveBeenCalled();
    expect(current.isConnecting).toBe(false);

    await act(async () => discovered.register(other.wallet, ready.wallet));
    expect(current.isConnected).toBe(true);
    expect(other.request).not.toHaveBeenCalled();
  });

  it('remembers a manual connection across reload and respects Disconnect after another reload', async () => {
    const ready = readyWallet();
    await mount(discovery([ready.wallet]).store);
    expect(ready.request).not.toHaveBeenCalled();

    await act(async () => current.connect('Ready'));
    expect(current.isConnected).toBe(true);
    expect(window.localStorage.getItem(LAST_WALLET_KEY)).toBe('argentX');
    expect(ready.request).toHaveBeenCalledWith({
      type: 'wallet_requestAccounts',
      params: { silent_mode: false },
    });

    const refreshed = readyWallet();
    await reload(discovery([refreshed.wallet]).store);
    expect(current.isConnected).toBe(true);
    expect(refreshed.request).toHaveBeenCalledWith({
      type: 'wallet_requestAccounts',
      params: { silent_mode: true },
    });

    await act(async () => current.disconnect());
    expect(current.isConnected).toBe(false);
    expect(window.localStorage.getItem(LAST_WALLET_KEY)).toBeNull();
    const disconnected = readyWallet();
    await reload(discovery([disconnected.wallet]).store);
    expect(current.isConnected).toBe(false);
    expect(disconnected.request).not.toHaveBeenCalled();
  });

  it.each(['locked', 'rejected'] as const)(
    'falls back to manual connect when the silent request is %s',
    async (failure) => {
      window.localStorage.setItem(LAST_WALLET_KEY, 'argentX');
      const requests = vi.fn(async (silent?: boolean) => {
        if (!silent) return ['0x123'];
        if (failure === 'locked') return [];
        throw new Error('Wallet unavailable');
      });
      const ready = readyWallet({ requestAccounts: requests });
      const discovered = discovery([ready.wallet]);
      await mount(discovered.store);
      await act(async () => discovered.register(ready.wallet));

      expect(current.isConnected).toBe(false);
      expect(current.isConnecting).toBe(false);
      expect(current.error).toBeNull();
      expect(requests.mock.calls).toEqual([[true]]);
      await act(async () => current.connect('Ready'));
      expect(current.isConnected).toBe(true);
      expect(requests.mock.calls).toEqual([[true], [false]]);
    }
  );

  it('does not prompt to switch networks during automatic reconnection', async () => {
    window.localStorage.setItem(LAST_WALLET_KEY, 'argentX');
    const ready = readyWallet({
      network:
        stakeWarsChain.network === 'mainnet'
          ? '0x534e5f5345504f4c4941'
          : '0x534e5f4d41494e',
    });
    await mount(discovery([ready.wallet]).store);

    expect(current.isConnected).toBe(false);
    expect(current.isConnecting).toBe(false);
    expect(ready.request.mock.calls.map(([r]) => r.type)).toEqual([
      'wallet_requestAccounts',
      'wallet_requestChainId',
    ]);
  });

  it('releases the Connect button if the wallet hangs and ignores its late result', async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(LAST_WALLET_KEY, 'argentX');
    let finish!: (accounts: string[]) => void;
    const ready = readyWallet({
      requestAccounts: () =>
        new Promise<string[]>((resolve) => {
          finish = resolve;
        }),
    });
    await mount(discovery([ready.wallet]).store);
    expect(current.isConnecting).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(current.isConnecting).toBe(false);
    expect(current.isConnected).toBe(false);
    await act(async () => finish(['0x123']));
    expect(current.isConnected).toBe(false);
  });

  it('keeps account-change and lock events live after silent reconnection', async () => {
    window.localStorage.setItem(LAST_WALLET_KEY, 'argentX');
    const ready = readyWallet();
    await mount(discovery([ready.wallet]).store);

    await act(async () => ready.accountsChanged(['0x456']));
    expect(BigInt(current.address!)).toBe(0x456n);
    await act(async () => ready.accountsChanged([]));
    expect(current.isConnected).toBe(false);
    expect(current.address).toBeNull();
  });

  it('cancels restoration if Disconnect occurs while discovery is pending', async () => {
    window.localStorage.setItem(LAST_WALLET_KEY, 'argentX');
    const discovered = discovery();
    await mount(discovered.store);
    await act(async () => current.disconnect());
    const ready = readyWallet();
    await act(async () => discovered.register(ready.wallet));
    expect(ready.request).not.toHaveBeenCalled();
    expect(current.isConnected).toBe(false);
  });

  it('keeps the app usable if browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });
    const ready = readyWallet();
    await mount(discovery([ready.wallet]).store);
    expect(current.isConnected).toBe(false);
    expect(current.isConnecting).toBe(false);
    expect(ready.request).not.toHaveBeenCalled();
  });
});
