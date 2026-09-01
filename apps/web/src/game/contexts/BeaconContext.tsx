import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { api } from '../services/api';
import type { BeaconSnapshot } from '../services/api';
import { BeaconContext } from './useBeacon';
import type { BeaconContextValue } from './useBeacon';

const BEACON_REFRESH_INTERVAL_MS = 5_000;

export function BeaconProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<BeaconSnapshot | null>(null);
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
      .getBeacon(controller.signal)
      .then((nextSnapshot) => {
        setSnapshot(nextSnapshot);
        hasLoaded.current = true;
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            failure instanceof Error
              ? failure.message
              : 'Unable to verify the Beacon uplink.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          refreshTimer = window.setTimeout(refresh, BEACON_REFRESH_INTERVAL_MS);
        }
      });

    return () => {
      controller.abort();
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [refresh, revision]);

  const value = useMemo<BeaconContextValue>(
    () => ({ snapshot, isLoading, error, refresh }),
    [error, isLoading, refresh, snapshot]
  );

  return (
    <BeaconContext.Provider value={value}>{children}</BeaconContext.Provider>
  );
}
