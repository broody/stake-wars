import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnect } from '@starknet-io/get-starknet-modal';
import { getStarknetChainId } from '@starknet-io/get-starknet-wallet-standard/chains';
import {
  StandardConnect,
  StarknetWalletApi,
  type WalletWithStarknetFeatures,
} from '@starknet-io/get-starknet-wallet-standard/features';
import { stakeWarsChain } from '../providers/chain';

// get-starknet 6 remembers successful connections, but only uses this key to
// sort the wallet list. Reuse it so existing users can reconnect immediately.
const LAST_WALLET_KEY = 'get-starknet.last-connected-wallet';
const RECONNECT_TIMEOUT_MS = 5_000;

function rememberedWalletId() {
  try {
    return window.localStorage.getItem(LAST_WALLET_KEY);
  } catch {
    return null;
  }
}

export function forgetWalletConnection() {
  try {
    window.localStorage.removeItem(LAST_WALLET_KEY);
  } catch {
    // Wallet connections still work when browser storage is unavailable.
  }
}

function silentConnector(
  wallet: WalletWithStarknetFeatures,
  isCancelled: () => boolean
): WalletWithStarknetFeatures {
  // The provider hardcodes silent:false. Adapt only its connect feature while
  // retaining live account getters, wallet events, and the private wallet API.
  return {
    version: wallet.version,
    name: wallet.name,
    icon: wallet.icon,
    get chains() {
      return wallet.chains;
    },
    get accounts() {
      return wallet.accounts;
    },
    get features() {
      return {
        ...wallet.features,
        [StandardConnect]: {
          version: wallet.features[StandardConnect].version,
          connect: async () => {
            let timeout: ReturnType<typeof setTimeout> | undefined;
            try {
              const result = await Promise.race([
                wallet.features[StandardConnect].connect({ silent: true }),
                new Promise<{ accounts: [] }>((resolve) => {
                  timeout = setTimeout(
                    () => resolve({ accounts: [] }),
                    RECONNECT_TIMEOUT_MS
                  );
                }),
              ]);
              const chain = result.accounts[0]?.chains[0];
              // Starknet Start switches networks on connection. Leave that
              // interactive request to a manual connect if networks differ.
              if (
                isCancelled() ||
                !chain ||
                BigInt(getStarknetChainId(chain)) !== stakeWarsChain.id
              ) {
                return { accounts: [] };
              }
              return result;
            } finally {
              clearTimeout(timeout);
            }
          },
        },
      };
    },
  };
}

export function useWalletAutoConnect(connectors: WalletWithStarknetFeatures[]) {
  const { connect, connected, isConnecting } = useConnect();
  const [lastWalletId] = useState(rememberedWalletId);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const attempted = useRef(false);
  const cancelled = useRef(false);
  const wallet = connectors.find(
    (candidate) => candidate.features[StarknetWalletApi].id === lastWalletId
  );

  const cancelAutoConnect = useCallback(() => {
    attempted.current = true;
    cancelled.current = true;
  }, []);

  useEffect(() => {
    // Discovery is asynchronous: wait for the remembered wallet to register,
    // and attempt once even when effects rerun under React StrictMode.
    if (attempted.current || connected || isConnecting || !wallet) return;
    attempted.current = true;
    setIsReconnecting(true);
    void connect(silentConnector(wallet, () => cancelled.current))
      .catch(() => {
        // Locked wallets and revoked permissions fall back to manual connect.
      })
      .finally(() => setIsReconnecting(false));
  }, [connect, connected, isConnecting, wallet]);

  return { cancelAutoConnect, isReconnecting };
}
