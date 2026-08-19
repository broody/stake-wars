import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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

const TOAST_GAP_PX = 8;
const TOAST_PEEK_PX = 8;
const TOAST_FALLBACK_HEIGHT_PX = 112;

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

function TransactionToastCard({
  toast,
  onDismiss,
}: {
  toast: TransactionToast;
  onDismiss: (hash: string) => void;
}) {
  return (
    <div
      role="status"
      className="border border-neutral-500 bg-black/95 font-mono text-xs text-fg shadow-[6px_6px_0_rgba(255,255,255,0.08)] backdrop-blur-sm"
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
          {toast.error ? (
            <p className="mt-2 break-words leading-relaxed text-amber-400">
              {toast.error}
            </p>
          ) : null}
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
          onClick={() => onDismiss(toast.hash)}
          className="px-1 text-neutral-500 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
          aria-label={`Dismiss ${toast.label.toLowerCase()} transaction notification`}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function TransactionToastStack({
  toasts,
  onDismiss,
  onClearAll,
}: {
  toasts: TransactionToast[];
  onDismiss: (hash: string) => void;
  onClearAll: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [toastHeights, setToastHeights] = useState<Record<string, number>>({});
  const toastElements = useRef(new Map<string, HTMLDivElement>());
  const stackElement = useRef<HTMLDivElement>(null);
  const wasExpanded = useRef(false);
  const previousToastCount = useRef(toasts.length);
  const expanded = hovered || focusWithin;
  const toastRemoved = toasts.length < previousToastCount.current;

  useLayoutEffect(() => {
    if (
      focusWithin &&
      stackElement.current &&
      !stackElement.current.contains(document.activeElement)
    ) {
      setFocusWithin(false);
    }
  }, [focusWithin, toasts]);

  useLayoutEffect(() => {
    const measureToasts = () => {
      const nextHeights: Record<string, number> = {};
      toastElements.current.forEach((element, hash) => {
        nextHeights[hash] = element.getBoundingClientRect().height;
      });
      setToastHeights((current) => {
        const hashes = Object.keys(nextHeights);
        const unchanged =
          hashes.length === Object.keys(current).length &&
          hashes.every((hash) => current[hash] === nextHeights[hash]);
        return unchanged ? current : nextHeights;
      });
    };

    measureToasts();
    const observer = new ResizeObserver(measureToasts);
    toastElements.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [toasts]);

  const expandedBottomOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    let bottom = 0;
    for (let index = toasts.length - 1; index >= 0; index -= 1) {
      const toast = toasts[index];
      if (!toast) continue;
      offsets.set(toast.hash, bottom);
      bottom +=
        (toastHeights[toast.hash] ?? TOAST_FALLBACK_HEIGHT_PX) + TOAST_GAP_PX;
    }
    return offsets;
  }, [toastHeights, toasts]);

  const latestToast = toasts[toasts.length - 1];
  const latestHeight = latestToast
    ? (toastHeights[latestToast.hash] ?? TOAST_FALLBACK_HEIGHT_PX)
    : TOAST_FALLBACK_HEIGHT_PX;
  const expandedHeight = toasts.reduce(
    (highest, toast) =>
      Math.max(
        highest,
        (expandedBottomOffsets.get(toast.hash) ?? 0) +
          (toastHeights[toast.hash] ?? TOAST_FALLBACK_HEIGHT_PX)
      ),
    0
  );
  const stackHeight = expanded
    ? expandedHeight
    : latestHeight + (toasts.length > 1 ? TOAST_PEEK_PX : 0);

  useLayoutEffect(() => {
    const toastAdded = toasts.length > previousToastCount.current;
    if (expanded && (!wasExpanded.current || toastAdded)) {
      const element = stackElement.current;
      if (element) {
        element.scrollTop = Math.max(0, expandedHeight - element.clientHeight);
      }
    }
    wasExpanded.current = expanded;
    previousToastCount.current = toasts.length;
  }, [expanded, expandedHeight, toasts.length]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none">
      {!expanded && toasts.length > 1 ? (
        <div className="mb-2 flex items-center justify-end gap-1.5 font-mono">
          <span
            className="min-w-7 border border-neutral-600 bg-black/95 px-2 py-1 text-center text-[9px] tabular-nums tracking-[0.12em] text-neutral-300 backdrop-blur-sm"
            aria-label={`${toasts.length} transaction notifications`}
          >
            {toasts.length}
          </span>
          <button
            type="button"
            onClick={onClearAll}
            className="pointer-events-auto border border-neutral-600 bg-black/95 px-2.5 py-1 text-[9px] tracking-[0.14em] text-neutral-400 backdrop-blur-sm transition-colors hover:border-white hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label={`Clear all ${toasts.length} transaction notifications`}
          >
            CLEAR ALL
          </button>
        </div>
      ) : null}
      <div
        ref={stackElement}
        className="toast-stack-scroll pointer-events-auto relative overscroll-contain"
        style={{
          height: stackHeight,
          maxHeight: expanded ? 'calc(100vh - 2rem)' : stackHeight,
          overflow: expanded ? 'auto' : 'hidden',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocusWithin(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setFocusWithin(false);
          }
        }}
        role="region"
        aria-label="Transaction notifications"
        tabIndex={expanded ? 0 : -1}
      >
        <div
          className={expanded ? 'relative' : 'absolute inset-x-0 bottom-0'}
          style={{ height: stackHeight }}
        >
          {toasts.map((toast, index) => {
            const depth = toasts.length - 1 - index;
            const visibleWhenCollapsed = depth < 2;
            const toastHeight =
              toastHeights[toast.hash] ?? TOAST_FALLBACK_HEIGHT_PX;
            const bottom = expanded
              ? (expandedBottomOffsets.get(toast.hash) ?? 0)
              : depth === 1
                ? latestHeight + TOAST_PEEK_PX - toastHeight
                : 0;

            return (
              <div
                key={toast.hash}
                ref={(element) => {
                  if (element) toastElements.current.set(toast.hash, element);
                  else toastElements.current.delete(toast.hash);
                }}
                className={`absolute inset-x-0 bottom-0 origin-bottom-right duration-300 ease-out motion-reduce:transition-none ${
                  toastRemoved
                    ? 'transition-[clip-path,opacity,transform]'
                    : 'transition-[bottom,clip-path,opacity,transform]'
                }`}
                style={{
                  bottom,
                  zIndex: index + 1,
                  opacity: expanded || visibleWhenCollapsed ? 1 : 0,
                  pointerEvents: expanded || depth === 0 ? 'auto' : 'none',
                  clipPath:
                    expanded || depth === 0
                      ? 'inset(0)'
                      : depth === 1
                        ? 'inset(0 0 calc(100% - 9px) 0)'
                        : 'inset(0 0 100% 0)',
                  transform:
                    expanded || depth === 0
                      ? 'translateX(0) scale(1)'
                      : depth === 1
                        ? 'translateX(-6px) scale(0.985)'
                        : 'translateX(-12px) scale(0.97)',
                }}
                aria-hidden={!expanded && depth > 0}
                inert={!expanded && depth > 0}
              >
                <TransactionToastCard toast={toast} onDismiss={onDismiss} />
              </div>
            );
          })}
        </div>
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

  const dismissAll = useCallback(() => setToasts([]), []);

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
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] flex-col gap-2 sm:w-96"
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
        <TransactionToastStack
          toasts={toasts}
          onDismiss={dismiss}
          onClearAll={dismissAll}
        />
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
