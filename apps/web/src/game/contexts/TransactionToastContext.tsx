import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import { shortAddress } from '../utils/format';
import { voyagerTransactionUrl } from '../utils/voyager';

type TransactionState = 'submitting' | 'confirmed' | 'failed';

interface TransactionToast {
  hash: string;
  label: string;
  state: TransactionState;
  error?: string;
}

interface TransactionToastContextValue {
  notifySubmitting: (hash: string, label: string) => void;
  notifyConfirmed: (hash: string) => void;
  notifyFailed: (hash: string, error: string) => void;
  notifyWarning: (message: string, label?: string) => void;
}

interface WarningToast {
  id: number;
  label: string;
  message: string;
}

function TransactionStateIcon({ state }: { state: TransactionState }) {
  if (state === 'submitting') {
    return (
      <span
        aria-hidden="true"
        className="h-3 w-3 shrink-0 animate-spin rounded-full border border-neutral-600 border-t-white"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex h-3 w-3 shrink-0 items-center justify-center text-[9px] ${
        state === 'failed' ? 'text-amber-400' : 'text-white'
      }`}
    >
      {state === 'failed' ? '×' : '✓'}
    </span>
  );
}

const TransactionToastContext = createContext<
  TransactionToastContextValue | undefined
>(undefined);

function WarningToastCard({
  toast,
  onDismiss,
}: {
  toast: WarningToast;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(toast.id), 6_000);
    return () => window.clearTimeout(timeout);
  }, [onDismiss, toast.id]);

  return (
    <div
      role="alert"
      className="pointer-events-auto border border-amber-500 bg-black/95 font-mono text-xs text-fg shadow-[6px_6px_0_rgba(251,191,36,0.12)] backdrop-blur-sm"
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.18em] text-amber-400">
            <span aria-hidden="true">!</span>
            {toast.label}
          </div>
          <p className="mt-2 break-words leading-relaxed text-neutral-300">
            {toast.message}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="px-1 text-neutral-500 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
          aria-label={`Dismiss ${toast.label.toLowerCase()} warning`}
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function TransactionToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<TransactionToast[]>([]);
  const [warnings, setWarnings] = useState<WarningToast[]>([]);
  const warningId = useRef(0);

  const notifySubmitting = useCallback((hash: string, label: string) => {
    setToasts((current) => [
      ...current.filter((toast) => toast.hash !== hash),
      { hash, label, state: 'submitting' },
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

  const dismissWarning = useCallback((id: number) => {
    setWarnings((current) => current.filter((warning) => warning.id !== id));
  }, []);

  const notifyWarning = useCallback((message: string, label = 'WARNING') => {
    warningId.current += 1;
    setWarnings((current) => [
      ...current.slice(-2),
      { id: warningId.current, label, message },
    ]);
  }, []);

  const value = useMemo(
    () => ({
      notifySubmitting,
      notifyConfirmed,
      notifyFailed,
      notifyWarning,
    }),
    [notifyConfirmed, notifyFailed, notifySubmitting, notifyWarning]
  );

  return (
    <TransactionToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 left-4 z-[100] flex w-[calc(100%-2rem)] flex-col gap-2 sm:w-96"
        aria-live="polite"
        aria-atomic="false"
      >
        {warnings.map((warning) => (
          <WarningToastCard
            key={warning.id}
            toast={warning}
            onDismiss={dismissWarning}
          />
        ))}
        {toasts.map((toast) => (
          <div
            key={toast.hash}
            role="status"
            className="pointer-events-auto border border-neutral-500 bg-black/95 font-mono text-xs text-fg shadow-[6px_6px_0_rgba(255,255,255,0.08)] backdrop-blur-sm"
          >
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] tracking-[0.18em]">
                  <TransactionStateIcon state={toast.state} />
                  {toast.label}{' '}
                  {toast.state === 'submitting'
                    ? 'SUBMITTING'
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
