import { useEffect, useState } from 'react';
import { checkStarknetConnection } from '../../services/starknet';
import { config } from '../../services/config';
import { stakeWarsChain } from '../../providers/controller';
import { useWallet } from '../../contexts/WalletContext';

type ConnectionState =
  | { status: 'checking' }
  | { status: 'connected'; chainId: string; blockNumber: number }
  | { status: 'unavailable'; message: string };

export function StarknetConnectionStatus() {
  const { chainId: walletChainId, isConnected: isWalletConnected } =
    useWallet();
  const [connection, setConnection] = useState<ConnectionState>({
    status: 'checking',
  });

  useEffect(() => {
    const controller = new AbortController();

    checkStarknetConnection(controller.signal)
      .then(({ chainId, blockNumber }) => {
        setConnection({ status: 'connected', chainId, blockNumber });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setConnection({
            status: 'unavailable',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });

    return () => controller.abort();
  }, []);

  const connected = connection.status === 'connected';
  const networkLabel =
    config.starknetChainId === 'SN_SEPOLIA'
      ? 'SEPOLIA'
      : config.starknetChainId === 'SN_MAIN'
        ? 'MAINNET'
        : config.starknetChainId.replace(/^SN_/, '');
  let walletMismatch = false;

  if (isWalletConnected && walletChainId) {
    try {
      walletMismatch = BigInt(walletChainId) !== stakeWarsChain.id;
    } catch {
      walletMismatch = true;
    }
  }

  const title = walletMismatch
    ? `Wallet network does not match Stake Wars ${networkLabel}.`
    : connection.status === 'unavailable'
      ? connection.message
      : connected
        ? `${networkLabel} RPC connected at block ${connection.blockNumber}.`
        : `Checking the ${networkLabel} RPC connection.`;

  return (
    <span
      className={`flex items-center gap-2 whitespace-nowrap font-mono text-[10px] tracking-[0.16em] ${
        walletMismatch ? 'text-amber-400' : 'text-dim'
      }`}
      title={title}
      aria-live="polite"
      aria-label={`Network: ${networkLabel}${walletMismatch ? ', wallet network mismatch' : ''}`}
    >
      <span
        className={`h-1.5 w-1.5 ${
          walletMismatch || connection.status === 'unavailable'
            ? 'bg-amber-400'
            : connected
              ? 'bg-white'
              : 'animate-pulse bg-neutral-500'
        }`}
      />
      <span className="hidden lg:inline">NETWORK //</span>
      <span className={walletMismatch ? 'text-amber-400' : 'text-fg'}>
        {networkLabel}
      </span>
    </span>
  );
}
