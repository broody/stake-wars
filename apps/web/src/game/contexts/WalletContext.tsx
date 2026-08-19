import React, { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useAccount, useConnect, useDisconnect } from '@starknet-start/react';
import type { WalletState } from '../types';

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

  const connect = useCallback(
    async (walletName: string) => {
      const wallet = connection.connectors.find(
        (connector) => connector.name === walletName
      );
      if (!wallet) {
        throw new Error(`${walletName} is not available`);
      }
      await connection.connectAsync({ connector: wallet });
    },
    [connection]
  );

  const disconnect = useCallback(async () => {
    await disconnection.disconnectAsync();
  }, [disconnection]);

  const value = useMemo<WalletContextType>(() => {
    const error = connection.error || disconnection.error;

    return {
      address: account.address || null,
      canConnect: connection.connectors.length > 0,
      chainId: account.chainId ? `0x${account.chainId.toString(16)}` : null,
      walletName: account.connector?.name || null,
      connect,
      disconnect,
      error: error?.message || null,
      isConnected: Boolean(account.isConnected),
      isConnecting: Boolean(
        account.isConnecting || connection.isPending || disconnection.isPending
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
    account.connector?.name,
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
