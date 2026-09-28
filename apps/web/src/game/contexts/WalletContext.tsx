import React, { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
} from '@starknetfoundation/starknet-start-react';
import { StarknetWalletApi } from '@starknet-io/get-starknet-wallet-standard/features';
import type { WalletState } from '../types';
import {
  forgetWalletConnection,
  useWalletAutoConnect,
} from '../hooks/useWalletAutoConnect';

interface WalletContextType extends WalletState {
  connect: (walletName: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const account = useAccount();
  const connection = useConnect();
  const disconnection = useDisconnect();
  const { cancelAutoConnect, isReconnecting } = useWalletAutoConnect(
    connection.connectors
  );

  const walletId = account.connector?.features[StarknetWalletApi]?.id ?? null;

  const connect = useCallback(
    async (walletName: string) => {
      const wallet = connection.connectors.find(
        (connector) => connector.name === walletName
      );
      if (!wallet) {
        throw new Error(`${walletName} is not available`);
      }
      cancelAutoConnect();
      await connection.connectAsync({ connector: wallet });
    },
    [cancelAutoConnect, connection]
  );

  const disconnect = useCallback(async () => {
    cancelAutoConnect();
    await disconnection.disconnectAsync();
    forgetWalletConnection();
  }, [cancelAutoConnect, disconnection]);

  const value = useMemo<WalletContextType>(() => {
    const error = connection.error || disconnection.error;

    return {
      address: account.address || null,
      canConnect: connection.connectors.length > 0,
      chainId: account.chainId ? `0x${account.chainId.toString(16)}` : null,
      walletId,
      walletName: account.connector?.name || null,
      connect,
      disconnect,
      error: error?.message || null,
      isConnected: Boolean(account.isConnected),
      isConnecting: Boolean(
        isReconnecting ||
          account.isConnecting ||
          connection.isPending ||
          disconnection.isPending
      ),
    };
  }, [
    account.address,
    account.chainId,
    account.isConnected,
    account.isConnecting,
    connect,
    connection.connectors.length,
    connection.error,
    connection.isPending,
    disconnect,
    disconnection.error,
    disconnection.isPending,
    isReconnecting,
    account.connector?.name,
    walletId,
  ]);

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
