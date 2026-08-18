import { useEffect, useRef } from 'react';

interface ArbiterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ArbiterModal({ isOpen, onClose }: ArbiterModalProps) {
  const acknowledgeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    acknowledgeButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 font-mono backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="arbiter-title"
        aria-describedby="arbiter-description"
        className="w-full max-w-xl border border-neutral-500 bg-black shadow-[10px_10px_0_rgba(255,255,255,0.08)]"
      >
        <header className="flex items-start justify-between border-b border-grid px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[9px] tracking-[0.24em] text-neutral-500">
              <span className="h-1.5 w-1.5 bg-white" aria-hidden="true" />
              ORBITAL AUTHORITY // ACTIVE
            </div>
            <h2
              id="arbiter-title"
              className="mt-2 text-base tracking-[0.22em] text-white"
            >
              THE ARBITER
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-lg leading-none text-neutral-500 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-white"
            aria-label="Close Arbiter briefing"
          >
            ×
          </button>
        </header>

        <div className="space-y-6 px-5 py-6 sm:px-7">
          <div className="flex items-start gap-5">
            <svg
              aria-hidden="true"
              viewBox="0 0 72 72"
              className="mt-1 hidden h-16 w-16 shrink-0 text-neutral-400 sm:block"
              fill="none"
              stroke="currentColor"
            >
              <path d="M36 6 65 55 36 66 7 55 36 6Z" />
              <path d="m7 55 29-17 29 17M36 6v32m0 0v28" />
            </svg>
            <p
              id="arbiter-description"
              className="text-sm leading-6 text-neutral-300"
            >
              The Arbiter is an autonomous sentinel circling the Core. It keeps
              every Operator&rsquo;s command aligned with the stake securing the
              Stake Wars validator.
            </p>
          </div>

          <div className="border-l-2 border-white bg-white/[0.04] px-4 py-4">
            <div className="text-[9px] tracking-[0.24em] text-neutral-500">
              CURRENT DIRECTIVE // STAKING INTEGRITY
            </div>
            <p className="mt-3 text-sm leading-6 text-white">
              Validator stake must remain intact. If an Operator unstakes
              directly from the staking contract, the Arbiter permanently
              retires that address. Its ownership generation is invalidated, and
              every Sector it controls returns to neutral.
            </p>
          </div>

          <div className="border border-dashed border-neutral-700 px-4 py-4">
            <div className="text-[9px] tracking-[0.24em] text-neutral-500">
              FUTURE DIRECTIVES // SIGNAL OBSCURED
            </div>
            <p className="mt-3 text-sm leading-6 text-neutral-400">
              Further protocols are taking shape beyond the visible orbit. Their
              parameters remain sealed. The Arbiter will transmit again when the
              Core is ready.
            </p>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-grid px-5 py-4 sm:px-7">
          <span className="text-[9px] tracking-[0.2em] text-neutral-600">
            OBSERVE THE ORBIT
          </span>
          <button
            ref={acknowledgeButtonRef}
            type="button"
            onClick={onClose}
            className="border border-white bg-white px-4 py-2 text-[10px] tracking-[0.2em] text-black transition-colors hover:bg-neutral-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            ACKNOWLEDGE
          </button>
        </footer>
      </section>
    </div>
  );
}
