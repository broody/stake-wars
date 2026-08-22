import { useEffect } from 'react';

interface ArbiterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ArbiterModal({ isOpen, onClose }: ArbiterModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <aside
      role="dialog"
      aria-labelledby="arbiter-title"
      aria-describedby="arbiter-description"
      className="pointer-events-auto absolute left-3 right-3 top-20 z-[80] max-h-[calc(100%-6rem)] overflow-y-auto border border-neutral-500 bg-black/90 font-mono text-xs text-fg shadow-[8px_8px_0_rgba(255,255,255,0.08)] backdrop-blur-sm sm:left-auto sm:right-4 sm:w-[22rem]"
    >
      <header className="flex items-center justify-between border-b border-neutral-600 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] tracking-[0.24em] text-dim">
            <span className="h-1.5 w-1.5 bg-white" aria-hidden="true" />
            CAMERA TRACK // ACTIVE
          </div>
          <h2
            id="arbiter-title"
            className="mt-1 text-base tracking-[0.12em] text-white"
          >
            THE ARBITER
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="border border-grid px-2 py-1 text-[10px] text-dim transition-colors hover:border-neutral-500 hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
          aria-label="Stop tracking the Arbiter"
        >
          ESC
        </button>
      </header>

      <div className="space-y-4 px-4 py-4">
        <div className="flex items-start gap-4 border-b border-grid pb-4">
          <svg
            aria-hidden="true"
            viewBox="0 0 72 72"
            className="h-12 w-12 shrink-0 text-neutral-400"
            fill="none"
            stroke="currentColor"
          >
            <path d="M36 6 65 55 36 66 7 55 36 6Z" />
            <path d="m7 55 29-17 29 17M36 6v32m0 0v28" />
          </svg>
          <p
            id="arbiter-description"
            className="text-xs leading-5 text-neutral-300"
          >
            The Arbiter is an autonomous sentinel circling the Core. It keeps
            every Operator&rsquo;s command aligned with the stake securing the
            Stake Wars validator.
          </p>
        </div>

        <div className="border-l-2 border-white bg-white/[0.04] px-3 py-3">
          <div className="text-[9px] tracking-[0.24em] text-neutral-500">
            CURRENT DIRECTIVE // STAKING INTEGRITY
          </div>
          <p className="mt-2 text-xs leading-5 text-white">
            Validator stake must remain intact. If an Operator unstakes directly
            from the staking contract, the Arbiter permanently retires that
            address. Its ownership generation is invalidated, and every Sector
            it controls returns to neutral.
          </p>
        </div>
      </div>
    </aside>
  );
}
