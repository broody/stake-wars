import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { api } from '../services/api';
import type { ArbiterSnapshot } from '../services/api';
import { ArbiterContext } from './useArbiter';
import type { ArbiterContextValue } from './useArbiter';

const ARBITER_REFRESH_INTERVAL_MS = 15_000;

export function ArbiterProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<ArbiterSnapshot | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const hasLoaded = useRef(false);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimer: number | undefined;
    if (!hasLoaded.current) setLoading(true);
    setError(null);

    api
      .getArbiter(controller.signal)
      .then((nextSnapshot) => {
        setSnapshot(nextSnapshot);
        hasLoaded.current = true;
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            failure instanceof Error
              ? failure.message
              : 'Unable to verify the Arbiter uplink.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          refreshTimer = window.setTimeout(
            refresh,
            ARBITER_REFRESH_INTERVAL_MS
          );
        }
      });

    return () => {
      controller.abort();
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [refresh, revision]);

  const value = useMemo<ArbiterContextValue>(
    () => ({ snapshot, isLoading, error, refresh }),
    [error, isLoading, refresh, snapshot]
  );

  return (
    <ArbiterContext.Provider value={value}>{children}</ArbiterContext.Provider>
  );
}
