import { useEffect, useRef } from 'react';
import { shortAddress } from '../../utils/format';
import { voyagerTransactionUrl } from '../../utils/voyager';
import {
  Button,
  Dialog,
  DialogHeader,
  ExternalLink,
  Spinner,
} from '../../../ui';

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
    return <Spinner className="text-fg" />;
  }

  return (
    <span
      aria-hidden="true"
      className={`flex h-3 w-3 items-center justify-center text-caption ${
        status === 'failed'
          ? 'text-warning'
          : status === 'confirmed'
            ? 'text-fg'
            : 'text-fg-disabled'
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
  const confirmedCount = batches.filter(
    (batch) => batch.status === 'confirmed'
  ).length;
  const failed = batches.some((batch) => batch.status === 'failed');
  const finished = confirmedCount === batches.length;
  const canClose = !isRunning;

  // Dialog focuses the proceed button when it opens. Once the run settles,
  // move focus to the button that now closes the dialog.
  useEffect(() => {
    if (!isOpen) return;
    proceedButtonRef.current?.focus();
  }, [batches, canClose, isOpen]);

  const isReview = batches.every((batch) => batch.status === 'queued');
  const action = intent === 'fortify' ? 'reinforcement' : 'capture';
  const progressPercent =
    batches.length === 0 ? 0 : (confirmedCount / batches.length) * 100;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      canClose={canClose}
      labelledBy="split-transaction-title"
      describedBy="split-transaction-description"
      initialFocus={proceedButtonRef}
    >
      <DialogHeader
        eyebrow={
          <span className="text-warning">TRANSACTION SPLIT REQUIRED</span>
        }
        title={`${sectorCount} SECTORS // ${batches.length} TRANSACTIONS`}
        titleId="split-transaction-title"
        onClose={onClose}
        closeLabel="Close split transaction progress"
        canClose={canClose}
      />

      <div className="px-5 py-5">
        <p
          id="split-transaction-description"
          className="max-w-xl text-caption text-fg-muted"
        >
          This {action} is too large for one atomic transaction. It will be
          split into {batches.length} sequential transactions of up to 200
          Sectors each. Confirm every wallet request to finish the full
          selection.
        </p>

        <div className="mt-5 h-1 overflow-hidden bg-surface-hover">
          <div
            className="h-full bg-fg transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-tag text-fg-subtle">
          <span>TRANSACTION PROGRESS</span>
          <span className={finished ? 'text-fg' : 'text-fg-muted'}>
            {confirmedCount}/{batches.length} CONFIRMED
          </span>
        </div>

        <ol className="mt-5 border border-line" aria-live="polite">
          {batches.map((batch, index) => (
            <li
              key={index}
              className={`px-4 py-3 ${index > 0 ? 'border-t border-line' : ''}`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-6 text-label text-fg-subtle">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <TransactionMarker status={batch.status} />
                  <div>
                    <div className="text-label text-fg-secondary">
                      TRANSACTION {index + 1}
                    </div>
                    <div className="mt-1 text-tag text-fg-subtle">
                      {batch.sectorCount} SECTORS
                    </div>
                  </div>
                </div>
                <span
                  className={`text-right text-tag ${
                    batch.status === 'failed'
                      ? 'text-warning'
                      : batch.status === 'confirmed'
                        ? 'text-fg'
                        : batch.status === 'queued'
                          ? 'text-fg-subtle'
                          : 'text-fg-secondary'
                  }`}
                >
                  {STATUS_LABELS[batch.status]}
                </span>
              </div>

              {batch.hash ? (
                <ExternalLink
                  quiet
                  href={voyagerTransactionUrl(batch.hash)}
                  className="ml-14 mt-2 inline-block text-tag text-fg-subtle"
                >
                  TX {shortAddress(batch.hash)}
                </ExternalLink>
              ) : null}

              {batch.error ? (
                <p className="ml-14 mt-2 break-words text-caption text-warning">
                  {batch.error}
                </p>
              ) : null}
            </li>
          ))}
        </ol>

        {isReview ? (
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose}>
              CANCEL
            </Button>
            <Button ref={proceedButtonRef} variant="solid" onClick={onProceed}>
              BEGIN {batches.length} TRANSACTIONS
            </Button>
          </div>
        ) : canClose ? (
          <Button
            ref={proceedButtonRef}
            variant={failed ? 'outline' : 'solid'}
            tone={failed ? 'warning' : 'neutral'}
            fullWidth
            onClick={onClose}
            className="mt-5"
          >
            {failed ? 'CLOSE · KEEP REMAINING SELECTED' : 'DONE'}
          </Button>
        ) : (
          <div className="mt-5 text-center text-label text-fg-subtle">
            KEEP THIS WINDOW OPEN AND CONFIRM EACH WALLET REQUEST
          </div>
        )}
      </div>
    </Dialog>
  );
}
