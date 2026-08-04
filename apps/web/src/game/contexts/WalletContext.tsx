import React, { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { WalletState } from '../types';

interface WalletContextType extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  // Stub implementation for wallet connection
  const connect = async () => {
    console.log('Wallet connection stub - to be implemented for Starknet');
    // TODO: Implement actual wallet connection logic
    setIsConnected(true);
    setAddress('0x0000000000000000000000000000000000000000');
    setChainId(1);
  };

  const disconnect = () => {
    console.log('Wallet disconnection stub');
    setIsConnected(false);
    setAddress(null);
    setChainId(null);
  };

  const value: WalletContextType = {
    isConnected,
    address,
    chainId,
    connect,
    disconnect,
  };

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
