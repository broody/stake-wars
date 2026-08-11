import { useEffect, useRef } from 'react';
import { useAccount, useConnect } from '@starknet-start/react';

const STORAGE_KEY = 'stakewars.last-connected-wallet';

export function AutoConnect() {
  const { connect, connectors } = useConnect();
  const { connector, status } = useAccount();
  const attempted = useRef(false);
  const wasConnected = useRef(false);

  useEffect(() => {
    if (status === 'connected') {
      wasConnected.current = true;
      if (connector) {
        window.localStorage.setItem(STORAGE_KEY, connector.name);
      }
      return;
    }

    if (wasConnected.current) {
      wasConnected.current = false;
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [connector, status]);

  useEffect(() => {
    if (attempted.current || status !== 'disconnected') {
      return;
    }

    const connectorName = window.localStorage.getItem(STORAGE_KEY);
    if (!connectorName) {
      return;
    }

    const savedConnector = connectors.find(
      (candidate) => candidate.name === connectorName
    );
    if (!savedConnector) {
      return;
    }

    attempted.current = true;
    connect({ connector: savedConnector });
  }, [connect, connectors, status]);

  return null;
}
