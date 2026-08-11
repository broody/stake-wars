import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import { shortAddress } from '../utils/format';
import { voyagerTransactionUrl } from '../utils/voyager';

type TransactionState = 'submitted' | 'confirmed' | 'failed';

interface TransactionToast {
  hash: string;
  label: string;
  state: TransactionState;
  error?: string;
}

interface TransactionToastContextValue {
  notifySubmitted: (hash: string, label: string) => void;
  notifyConfirmed: (hash: string) => void;
  notifyFailed: (hash: string, error: string) => void;
}

const TransactionToastContext = createContext<
  TransactionToastContextValue | undefined
>(undefined);

export function TransactionToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<TransactionToast[]>([]);

  const notifySubmitted = useCallback((hash: string, label: string) => {
    setToasts((current) => [
      ...current.filter((toast) => toast.hash !== hash),
      { hash, label, state: 'submitted' },
    ]);
  }, []);

  const notifyConfirmed = useCallback((hash: string) => {
    setToasts((current) =>
      current.map((toast) =>
        toast.hash === hash ? { ...toast, state: 'confirmed' } : toast
      )
    );
  }, []);

  const notifyFailed = useCallback((hash: string, error: string) => {
    setToasts((current) =>
      current.map((toast) =>
        toast.hash === hash ? { ...toast, state: 'failed', error } : toast
      )
    );
  }, []);

  const dismiss = useCallback((hash: string) => {
    setToasts((current) => current.filter((toast) => toast.hash !== hash));
  }, []);

  const value = useMemo(
    () => ({ notifySubmitted, notifyConfirmed, notifyFailed }),
    [notifyConfirmed, notifyFailed, notifySubmitted]
  );

  return (
    <TransactionToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 left-4 z-[100] flex w-[calc(100%-2rem)] flex-col gap-2 sm:w-96"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div
            key={toast.hash}
            role="status"
            className="pointer-events-auto border border-neutral-500 bg-black/95 font-mono text-xs text-fg shadow-[6px_6px_0_rgba(255,255,255,0.08)] backdrop-blur-sm"
          >
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] tracking-[0.18em]">
                  <span
                    className={`h-2 w-2 ${
                      toast.state === 'failed'
                        ? 'bg-amber-400'
                        : toast.state === 'submitted'
                          ? 'animate-pulse bg-white'
                          : 'bg-white'
                    }`}
                  />
                  {toast.label}{' '}
                  {toast.state === 'submitted'
                    ? 'SUBMITTED'
                    : toast.state === 'confirmed'
                      ? 'CONFIRMED'
                      : 'FAILED'}
                </div>
                <div className="mt-2 text-[10px] tracking-wider text-neutral-500">
                  TX {shortAddress(toast.hash)}
                </div>
                {toast.error && (
                  <p className="mt-2 break-words leading-relaxed text-amber-400">
                    {toast.error}
                  </p>
                )}
                <a
                  href={voyagerTransactionUrl(toast.hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block border-b border-neutral-500 pb-0.5 text-[10px] tracking-[0.16em] text-neutral-300 transition-colors hover:border-white hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  VIEW ON VOYAGER ↗
                </a>
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.hash)}
                className="px-1 text-neutral-500 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
                aria-label={`Dismiss ${toast.label.toLowerCase()} transaction notification`}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </TransactionToastContext.Provider>
  );
}

export function useTransactionToast() {
  const context = useContext(TransactionToastContext);
  if (!context) {
    throw new Error(
      'useTransactionToast must be used within TransactionToastProvider'
    );
  }
  return context;
}
