import { api, ApiError } from '../services/api';
import { config } from '../services/config';

const guestKey = 'stakewars.survivor.guest';
const pendingPrefix = `stakewars.survivor.run.${config.starknetChainId}.`;
let memoryId: string | undefined;

export function hasPlayedSurvivor(): boolean {
  try {
    return Boolean(memoryId || localStorage.getItem(guestKey));
  } catch {
    return Boolean(memoryId);
  }
}

export function survivorGuestId(): string {
  try {
    const saved = localStorage.getItem(guestKey);
    if (
      saved &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        saved
      )
    )
      return saved;
    memoryId ??= crypto.randomUUID();
    localStorage.setItem(guestKey, memoryId);
  } catch {
    memoryId ??= crypto.randomUUID();
  }
  return memoryId;
}

interface PendingRun {
  token: string;
  replay: string;
  guestId: string;
}
const inFlight = new Map<string, Promise<{ destroyed: number }>>();
const unsaved = new Map<string, PendingRun>();

function upload(run: PendingRun) {
  const key = pendingPrefix + run.token;
  const running = inFlight.get(key);
  if (running) return running;
  function forget() {
    unsaved.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* Storage may be unavailable. */
    }
  }
  const send = api
    .finishGuestRun(run.token, run.replay, run.guestId)
    .then(
      (result) => {
        forget();
        return result;
      },
      (error) => {
        if (error instanceof ApiError && [400, 403, 422].includes(error.status))
          forget();
        throw error;
      }
    )
    .finally(() => inFlight.delete(key));
  inFlight.set(key, send);
  return send;
}

export function recordSurvivorRun(token: string, bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const run = { token, replay: btoa(binary), guestId: survivorGuestId() };
  const key = pendingPrefix + token;
  unsaved.set(key, run);
  try {
    localStorage.setItem(key, JSON.stringify(run));
  } catch {
    /* Still submit this session. */
  }
  return upload(run);
}

export async function retrySurvivorRuns() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(pendingPrefix)) continue;
      const value = localStorage.getItem(key);
      if (value) {
        const run: PendingRun = JSON.parse(value);
        if (key === pendingPrefix + run.token) unsaved.set(key, run);
      }
    }
  } catch {
    /* In-memory runs can still be retried. */
  }
  for (const run of [...unsaved.values()]) {
    try {
      await upload(run);
    } catch {
      /* Retry when the connection or verifier recovers. */
    }
  }
}
