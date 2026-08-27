import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import type { ArbiterHistoryEntry } from '../services/api';

const ARBITER_HISTORY_REFRESH_INTERVAL_MS = 30_000;

export function useArbiterHistory(enabled: boolean) {
  const [entries, setEntries] = useState<ArbiterHistoryEntry[]>([]);
  const [isLoading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const hasLoaded = useRef(false);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let refreshTimer: number | undefined;
    if (!hasLoaded.current) setLoading(true);
    setError(null);

    api
      .getArbiterHistory(controller.signal)
      .then((page) => {
        setEntries(page.entries);
        hasLoaded.current = true;
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            failure instanceof Error
              ? failure.message
              : 'Unable to verify the Arbiter history.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          refreshTimer = window.setTimeout(
            refresh,
            ARBITER_HISTORY_REFRESH_INTERVAL_MS
          );
        }
      });

    return () => {
      controller.abort();
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [enabled, refresh, revision]);

  useEffect(() => {
    if (!enabled) return;
    const refreshOnFocus = () => refresh();
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [enabled, refresh]);

  return { entries, isLoading, error, refresh };
}
