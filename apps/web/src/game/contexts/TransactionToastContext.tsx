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
import {
  Badge,
  Button,
  CloseButton,
  ExternalLink,
  Panel,
  Spinner,
  cn,
} from '../../ui';

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
    return <Spinner />;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-3 w-3 shrink-0 items-center justify-center text-label',
        state === 'failed' ? 'text-warning' : 'text-fg'
      )}
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
    <Panel
      as="div"
      tone="floating"
      role="alert"
      className="pointer-events-auto border-warning-strong font-mono text-caption text-fg shadow-hard-warning"
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-label text-warning">
            <span aria-hidden="true">!</span>
            {toast.label}
          </div>
          <p className="mt-2 break-words leading-relaxed text-fg-secondary">
            {toast.message}
          </p>
        </div>
        <CloseButton
          size="sm"
          onClick={() => onDismiss(toast.id)}
          label={`Dismiss ${toast.label.toLowerCase()} warning`}
        />
      </div>
    </Panel>
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
    <Panel
      as="div"
      tone="floating"
      role="status"
      className="border-fg-subtle font-mono text-caption text-fg shadow-hard-sm"
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-label">
            <TransactionStateIcon state={toast.state} />
            {toast.label}{' '}
            {toast.state === 'submitting'
              ? 'SUBMITTING'
              : toast.state === 'confirmed'
                ? 'CONFIRMED'
                : 'FAILED'}
          </div>
          <div className="mt-2 text-label tabular-nums text-fg-subtle">
            TX {shortAddress(toast.hash)}
          </div>
          {toast.error ? (
            <p className="mt-2 break-words leading-relaxed text-warning">
              {toast.error}
            </p>
          ) : null}
          <ExternalLink
            href={voyagerTransactionUrl(toast.hash)}
            className="mt-3 inline-block text-label text-fg-secondary"
          >
            VIEW ON VOYAGER
          </ExternalLink>
        </div>
        <CloseButton
          size="sm"
          onClick={() => onDismiss(toast.hash)}
          label={`Dismiss ${toast.label.toLowerCase()} transaction notification`}
        />
      </div>
    </Panel>
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
          <Badge
            className="min-w-8 justify-center self-stretch bg-surface/95 tabular-nums backdrop-blur-sm"
            aria-label={`${toasts.length} transaction notifications`}
          >
            {toasts.length}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAll}
            className="pointer-events-auto bg-surface/95 backdrop-blur-sm"
            aria-label={`Clear all ${toasts.length} transaction notifications`}
          >
            CLEAR ALL
          </Button>
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
