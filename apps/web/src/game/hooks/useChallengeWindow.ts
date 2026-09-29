import { useEffect, useState } from 'react';
import { getChallengeWindowSeconds } from '../services/torii';

let cachedWindowSeconds: number | null = null;
let pendingWindowSeconds: Promise<number> | null = null;

function loadChallengeWindowSeconds(): Promise<number> {
  pendingWindowSeconds ??= getChallengeWindowSeconds().then(
    (seconds) => {
      cachedWindowSeconds = seconds;
      return seconds;
    },
    (reason: unknown) => {
      pendingWindowSeconds = null;
      throw reason;
    }
  );
  return pendingWindowSeconds;
}

/**
 * The indexed Challenge response window, or null while it is unknown. Copy
 * that depends on it must still read correctly without a value.
 */
export function useChallengeWindowSeconds(): number | null {
  const [seconds, setSeconds] = useState(cachedWindowSeconds);

  useEffect(() => {
    if (cachedWindowSeconds !== null) return;
    let cancelled = false;
    loadChallengeWindowSeconds()
      .then((value) => {
        if (!cancelled) setSeconds(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return seconds;
}
