import { useEffect, useRef } from 'react';
import { OperatorActivityTable } from './OperatorActivityTable';

interface ActivityModalProps {
  isOpen: boolean;
  operator: string | null;
  onClose: () => void;
}

export function ActivityModal({
  isOpen,
  operator,
  onClose,
}: ActivityModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !operator) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 px-4 py-20 font-mono backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-ledger-title"
        className="activity-scrollbar max-h-full w-full max-w-5xl overflow-y-auto border border-neutral-500 bg-black shadow-[10px_10px_0_rgba(255,255,255,0.08)]"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-grid bg-black px-5 py-4">
          <div>
            <div className="text-[9px] tracking-[0.24em] text-neutral-500">
              UNIFIED EVENT LEDGER
            </div>
            <h2
              id="activity-ledger-title"
              className="mt-1 text-sm tracking-[0.18em] text-white"
            >
              ACTIVITY // OPERATOR
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-lg leading-none text-neutral-500 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-white"
            aria-label="Close operator activity"
          >
            ×
          </button>
        </header>

        <div className="px-5 py-5">
          <OperatorActivityTable operator={operator} variant="modal" />
        </div>
      </section>
    </div>
  );
}
