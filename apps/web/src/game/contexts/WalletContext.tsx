import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useProvider,
} from '@starknetfoundation/starknet-start-react';
import { WalletAccountV6, walletV6 } from 'starknet';
import type { STRK20_ACTION } from 'starknet';
import type { WalletState } from '../types';
import { config } from '../services/config';
import {
  invokePrivateActionTransaction,
  type PrivateSubmissionObserver,
  type PrivateTransactionResult,
  type PrivacyWallet,
} from '../services/privateWallet';
import {
  readShieldedTokenBalance,
  supportsShieldedBalances,
} from '../services/shieldedBalance';

export type ShieldedStrkStatus =
  | 'disconnected'
  | 'checking'
  | 'available'
  | 'unsupported'
  | 'reading'
  | 'ready'
  | 'error';

interface WalletContextType extends WalletState {
  connect: (walletName: string) => Promise<void>;
  disconnect: () => Promise<void>;
  invokePrivateActions: (
    actions: STRK20_ACTION[],
    observeSubmission?: PrivateSubmissionObserver
  ) => Promise<PrivateTransactionResult>;
  isPrivacyWalletSupported: boolean;
  readShieldedStrkBalance: () => Promise<void>;
  shieldedStrkBalance: bigint | null;
  shieldedStrkError: string | null;
  shieldedStrkStatus: ShieldedStrkStatus;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const account = useAccount();
  const connection = useConnect();
  const disconnection = useDisconnect();
  const { provider } = useProvider();
  const [shieldedStrkBalance, setShieldedStrkBalance] = useState<bigint | null>(
    null
  );
  const [shieldedStrkError, setShieldedStrkError] = useState<string | null>(
    null
  );
  const [shieldedStrkStatus, setShieldedStrkStatus] =
    useState<ShieldedStrkStatus>('disconnected');
  const shieldedRequestRevision = useRef(0);

  const privacyWallet = account.connector as unknown as
    | PrivacyWallet
    | undefined;

  useEffect(() => {
    const revision = shieldedRequestRevision.current + 1;
    shieldedRequestRevision.current = revision;
    setShieldedStrkBalance(null);
    setShieldedStrkError(null);

    if (!account.address || !privacyWallet) {
      setShieldedStrkStatus('disconnected');
      return;
    }

    setShieldedStrkStatus('checking');
    walletV6
      .supportedWalletApi(privacyWallet)
      .then((versions) => {
        if (shieldedRequestRevision.current !== revision) return;
        setShieldedStrkStatus(
          supportsShieldedBalances(versions) ? 'available' : 'unsupported'
        );
      })
      .catch(() => {
        if (shieldedRequestRevision.current !== revision) return;
        setShieldedStrkStatus('unsupported');
      });
  }, [account.address, account.chainId, privacyWallet]);

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

  const isPrivacyWalletSupported =
    shieldedStrkStatus === 'available' ||
    shieldedStrkStatus === 'reading' ||
    shieldedStrkStatus === 'ready' ||
    shieldedStrkStatus === 'error';

  const invokePrivateActions = useCallback(
    async (
      actions: STRK20_ACTION[],
      observeSubmission?: PrivateSubmissionObserver
    ) => {
      if (!account.address || !privacyWallet) {
        throw new Error('Connect Ready before placing a private bid.');
      }
      if (!isPrivacyWalletSupported) {
        throw new Error('This wallet does not support private STRK actions.');
      }
      if (actions.length === 0) {
        throw new Error('Private transaction requires at least one action.');
      }

      return invokePrivateActionTransaction(
        privacyWallet,
        actions,
        observeSubmission
      );
    },
    [account.address, isPrivacyWalletSupported, privacyWallet]
  );

  const readShieldedStrkBalance = useCallback(async () => {
    if (
      !account.address ||
      !privacyWallet ||
      !config.strkTokenAddress ||
      (shieldedStrkStatus !== 'available' &&
        shieldedStrkStatus !== 'ready' &&
        shieldedStrkStatus !== 'error')
    ) {
      return;
    }

    const revision = shieldedRequestRevision.current + 1;
    shieldedRequestRevision.current = revision;
    setShieldedStrkError(null);
    setShieldedStrkStatus('reading');

    try {
      const walletAccount = new WalletAccountV6({
        address: account.address,
        provider,
        walletProvider: privacyWallet,
      });
      const balance = await readShieldedTokenBalance(
        walletAccount,
        config.strkTokenAddress
      );
      if (shieldedRequestRevision.current !== revision) return;
      setShieldedStrkBalance(balance);
      setShieldedStrkStatus('ready');
    } catch (reason) {
      if (shieldedRequestRevision.current !== revision) return;
      setShieldedStrkBalance(null);
      setShieldedStrkError(
        reason instanceof Error
          ? reason.message
          : 'Unable to read shielded STRK from the wallet.'
      );
      setShieldedStrkStatus('error');
    }
  }, [account.address, privacyWallet, provider, shieldedStrkStatus]);

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
      invokePrivateActions,
      isPrivacyWalletSupported,
      readShieldedStrkBalance,
      shieldedStrkBalance,
      shieldedStrkError,
      shieldedStrkStatus,
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
    invokePrivateActions,
    isPrivacyWalletSupported,
    account.connector?.name,
    readShieldedStrkBalance,
    shieldedStrkBalance,
    shieldedStrkError,
    shieldedStrkStatus,
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
