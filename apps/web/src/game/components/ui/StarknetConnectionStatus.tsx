import { useEffect, useState } from 'react';
import { checkStarknetConnection } from '../../services/starknet';

type ConnectionState =
  | { status: 'checking' }
  | { status: 'connected'; chainId: string; blockNumber: number }
  | { status: 'unavailable'; message: string };

export function StarknetConnectionStatus() {
  const [connection, setConnection] = useState<ConnectionState>({
    status: 'checking',
  });

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

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

  if (!import.meta.env.DEV) {
    return null;
  }

  const connected = connection.status === 'connected';
  const label = connected
    ? `${connection.chainId} // BLOCK ${connection.blockNumber}`
    : connection.status === 'checking'
      ? 'RPC // CHECKING'
      : 'RPC // OFFLINE';
  const title =
    connection.status === 'unavailable'
      ? connection.message
      : 'Local Starknet RPC connection';

  return (
    <span
      className="hidden sm:flex items-center gap-2 text-xs tracking-wider text-dim"
      title={title}
      aria-live="polite"
    >
      <span
        className={`h-2 w-2 rounded-full ${connected ? 'bg-green-400' : 'bg-amber-400'}`}
      />
      {label}
    </span>
  );
}
