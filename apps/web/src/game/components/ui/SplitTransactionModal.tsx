import { useEffect, useRef } from 'react';
import { shortAddress } from '../../utils/format';
import { voyagerTransactionUrl } from '../../utils/voyager';

export type SplitTransactionStatus =
  | 'queued'
  | 'preparing'
  | 'authorizing'
  | 'confirming'
  | 'confirmed'
  | 'failed';

export interface SplitTransactionBatch {
  sectorCount: number;
  status: SplitTransactionStatus;
  hash?: string;
  error?: string;
}

interface SplitTransactionModalProps {
  batches: SplitTransactionBatch[];
  intent: 'capture' | 'fortify';
  isRunning: boolean;
  isOpen: boolean;
  sectorCount: number;
  onClose: () => void;
  onProceed: () => void;
}

const STATUS_LABELS: Record<SplitTransactionStatus, string> = {
  queued: 'QUEUED',
  preparing: 'PREPARING',
  authorizing: 'AUTHORIZE IN WALLET',
  confirming: 'CONFIRMING',
  confirmed: 'CONFIRMED',
  failed: 'FAILED',
};

function TransactionMarker({ status }: { status: SplitTransactionStatus }) {
  if (
    status === 'preparing' ||
    status === 'authorizing' ||
    status === 'confirming'
  ) {
    return (
      <span
        aria-hidden="true"
        className="h-3 w-3 animate-spin rounded-full border border-neutral-600 border-t-white"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex h-3 w-3 items-center justify-center text-[10px] ${
        status === 'failed'
          ? 'text-amber-400'
          : status === 'confirmed'
            ? 'text-white'
            : 'text-neutral-700'
      }`}
    >
      {status === 'failed' ? '×' : status === 'confirmed' ? '✓' : '·'}
    </span>
  );
}

export function SplitTransactionModal({
  batches,
  intent,
  isRunning,
  isOpen,
  sectorCount,
  onClose,
  onProceed,
}: SplitTransactionModalProps) {
  const proceedButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const confirmedCount = batches.filter(
    (batch) => batch.status === 'confirmed'
  ).length;
  const failed = batches.some((batch) => batch.status === 'failed');
  const finished = confirmedCount === batches.length;
  const canClose = !isRunning;

  useEffect(() => {
    if (!isOpen) return;

    if (batches.every((batch) => batch.status === 'queued')) {
      proceedButtonRef.current?.focus();
    } else if (canClose) {
      closeButtonRef.current?.focus();
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && canClose) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [batches, canClose, isOpen, onClose]);

  if (!isOpen) return null;

  const isReview = batches.every((batch) => batch.status === 'queued');
  const action = intent === 'fortify' ? 'fortification' : 'capture';
  const progressPercent =
    batches.length === 0 ? 0 : (confirmedCount / batches.length) * 100;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 px-4 py-10 font-mono backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && canClose) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="split-transaction-title"
        aria-describedby="split-transaction-description"
        className="max-h-full w-full max-w-2xl overflow-y-auto border border-neutral-500 bg-black shadow-[10px_10px_0_rgba(255,255,255,0.08)]"
      >
        <header className="flex items-start justify-between border-b border-grid px-5 py-4">
          <div>
            <div className="text-[9px] tracking-[0.24em] text-amber-400">
              TRANSACTION SPLIT REQUIRED
            </div>
            <h2
              id="split-transaction-title"
              className="mt-1 text-sm tracking-[0.18em] text-white"
            >
              {sectorCount} SECTORS // {batches.length} TRANSACTIONS
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={!canClose}
            className="px-2 py-1 text-lg leading-none text-neutral-500 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-white disabled:cursor-wait disabled:text-neutral-800"
            aria-label="Close split transaction progress"
          >
            ×
          </button>
        </header>

        <div className="px-5 py-5">
          <p
            id="split-transaction-description"
            className="max-w-xl text-[10px] leading-relaxed tracking-[0.08em] text-neutral-400"
          >
            This {action} is too large for one atomic transaction. It will be
            split into {batches.length} sequential transactions of up to 200
            Sectors each. Confirm every wallet request to finish the full
            selection.
          </p>

          <div className="mt-5 h-1 overflow-hidden bg-neutral-900">
            <div
              className="h-full bg-white transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[8px] tracking-[0.18em] text-neutral-600">
            <span>TRANSACTION PROGRESS</span>
            <span className={finished ? 'text-white' : 'text-neutral-400'}>
              {confirmedCount}/{batches.length} CONFIRMED
            </span>
          </div>

          <ol className="mt-5 border border-grid" aria-live="polite">
            {batches.map((batch, index) => (
              <li
                key={index}
                className={`px-4 py-3 ${index > 0 ? 'border-t border-grid' : ''}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-6 text-[9px] tracking-[0.12em] text-neutral-600">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <TransactionMarker status={batch.status} />
                    <div>
                      <div className="text-[10px] tracking-[0.16em] text-neutral-300">
                        TRANSACTION {index + 1}
                      </div>
                      <div className="mt-1 text-[8px] tracking-[0.14em] text-neutral-600">
                        {batch.sectorCount} SECTORS
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-right text-[8px] tracking-[0.14em] ${
                      batch.status === 'failed'
                        ? 'text-amber-400'
                        : batch.status === 'confirmed'
                          ? 'text-white'
                          : batch.status === 'queued'
                            ? 'text-neutral-700'
                            : 'text-neutral-300'
                    }`}
                  >
                    {STATUS_LABELS[batch.status]}
                  </span>
                </div>

                {batch.hash ? (
                  <a
                    href={voyagerTransactionUrl(batch.hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-14 mt-2 inline-block text-[8px] tracking-[0.12em] text-neutral-600 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    TX {shortAddress(batch.hash)} ↗
                  </a>
                ) : null}

                {batch.error ? (
                  <p className="ml-14 mt-2 break-words text-[9px] leading-relaxed text-amber-400">
                    {batch.error}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>

          {isReview ? (
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="border border-neutral-700 px-4 py-2.5 text-[9px] tracking-[0.18em] text-neutral-400 transition-colors hover:border-neutral-400 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                CANCEL
              </button>
              <button
                ref={proceedButtonRef}
                type="button"
                onClick={onProceed}
                className="border border-white bg-white px-4 py-2.5 text-[9px] font-semibold tracking-[0.18em] text-black transition-colors hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                BEGIN {batches.length} TRANSACTIONS
              </button>
            </div>
          ) : canClose ? (
            <button
              ref={proceedButtonRef}
              type="button"
              onClick={onClose}
              className={`mt-5 w-full border px-4 py-2.5 text-[9px] font-semibold tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white ${
                failed
                  ? 'border-amber-400 text-amber-400 hover:bg-amber-400 hover:text-black'
                  : 'border-white bg-white text-black hover:bg-black hover:text-white'
              }`}
            >
              {failed ? 'CLOSE · KEEP REMAINING SELECTED' : 'DONE'}
            </button>
          ) : (
            <div className="mt-5 text-center text-[9px] tracking-[0.16em] text-neutral-500">
              KEEP THIS WINDOW OPEN AND CONFIRM EACH WALLET REQUEST
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
