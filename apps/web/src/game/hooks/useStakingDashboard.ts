import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import type { StakingHistory, StakingSnapshot } from '../types/staking';

const SNAPSHOT_REFRESH_MS = 30_000;
const HISTORY_REFRESH_MS = 5 * 60_000;

function useRefreshingResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  fallbackError: string
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const hasLoaded = useRef(false);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    if (!hasLoaded.current) setLoading(true);

    load(controller.signal)
      .then((next) => {
        setData(next);
        setError(null);
        hasLoaded.current = true;
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        // Keep the last good data; the error explains why it is not advancing.
        setError(failure instanceof Error ? failure.message : fallbackError);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
        timer = window.setTimeout(refresh, intervalMs);
      });

    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [fallbackError, intervalMs, load, refresh, revision]);

  return { data, error, isLoading, refresh };
}

/** Polls the network staking snapshot and its daily history. */
export function useStakingDashboard() {
  const snapshot = useRefreshingResource<StakingSnapshot>(
    api.getStaking,
    SNAPSHOT_REFRESH_MS,
    'Unable to read Starknet staking statistics.'
  );
  const history = useRefreshingResource<StakingHistory>(
    api.getStakingHistory,
    HISTORY_REFRESH_MS,
    'Unable to read Starknet staking history.'
  );
  const refreshSnapshot = snapshot.refresh;
  const refreshHistory = history.refresh;

  useEffect(() => {
    const refreshOnFocus = () => {
      refreshSnapshot();
      refreshHistory();
    };
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [refreshHistory, refreshSnapshot]);

  return {
    snapshot: snapshot.data,
    snapshotError: snapshot.error,
    isLoading: snapshot.isLoading,
    history: history.data,
    historyError: history.error,
  };
}
