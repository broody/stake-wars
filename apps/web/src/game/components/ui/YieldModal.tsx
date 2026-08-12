import { useEffect, useMemo, useRef } from 'react';
import { useYield } from '../../contexts/useYield';
import { useWallet } from '../../contexts/WalletContext';
import { formatStrk } from '../../utils/format';

function yieldValue(value: bigint | null, digits = 6): string {
  return value === null ? '—' : `${formatStrk(value, digits)} STRK`;
}

export function YieldModal() {
  const { address } = useWallet();
  const {
    summary,
    isLoading,
    error,
    historyError,
    isOpen,
    claimPhase,
    claimError,
    closeYield,
    refreshYield,
    claimYield,
  } = useYield();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isClaiming = claimPhase !== 'idle';

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeYield();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [closeYield, isOpen]);

  const unclaimedPercent = useMemo(() => {
    if (!summary?.lifetimeRewards || summary.lifetimeRewards === 0n) return 0;
    return (
      Number((summary.unclaimedRewards * 10_000n) / summary.lifetimeRewards) /
      100
    );
  }, [summary]);

  if (!isOpen) return null;

  const claimLabel =
    claimPhase === 'submitting'
      ? 'AUTHORIZE CLAIM…'
      : claimPhase === 'confirming'
        ? 'CONFIRMING ON SEPOLIA…'
        : summary?.unclaimedRewards
          ? `CLAIM ${formatStrk(summary.unclaimedRewards, 6)} STRK`
          : 'NO YIELD TO CLAIM';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 px-4 py-20 font-mono backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) closeYield();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="yield-ledger-title"
        className="max-h-full w-full max-w-xl overflow-y-auto border border-neutral-500 bg-black shadow-[10px_10px_0_rgba(255,255,255,0.08)]"
      >
        <header className="flex items-start justify-between border-b border-grid px-5 py-4">
          <div>
            <div className="text-[9px] tracking-[0.24em] text-neutral-500">
              VALIDATOR REWARD LEDGER
            </div>
            <h2
              id="yield-ledger-title"
              className="mt-1 text-sm tracking-[0.18em] text-white"
            >
              YIELD // LIFETIME
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeYield}
            disabled={isClaiming}
            className="px-2 py-1 text-lg leading-none text-neutral-500 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-white disabled:cursor-wait disabled:text-neutral-700"
            aria-label="Close yield ledger"
          >
            ×
          </button>
        </header>

        {!address ? (
          <div className="px-5 py-12 text-center">
            <div className="text-xs tracking-[0.18em] text-white">
              CONNECT AN OPERATOR
            </div>
            <p className="mx-auto mt-3 max-w-sm text-[10px] leading-relaxed tracking-[0.08em] text-neutral-500">
              Connect your wallet from the command bar to read and claim its
              validator yield.
            </p>
          </div>
        ) : (
          <>
            <div className="px-5 py-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-[9px] tracking-[0.2em] text-neutral-500">
                    TOTAL GENERATED
                  </div>
                  <div className="mt-1 text-2xl tracking-tight text-white">
                    {isLoading && !summary
                      ? 'READING…'
                      : yieldValue(summary?.lifetimeRewards ?? null)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={refreshYield}
                  disabled={isLoading || isClaiming}
                  className="text-[9px] tracking-[0.16em] text-neutral-500 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:text-neutral-700"
                >
                  REFRESH ↻
                </button>
              </div>

              <div
                className="mt-5 flex h-2 overflow-hidden border border-neutral-700"
                title={`${unclaimedPercent.toFixed(2)}% of indexed lifetime yield is currently unclaimed`}
              >
                <div className="h-full flex-1 bg-neutral-800" />
                <div
                  className="h-full bg-white"
                  style={{
                    width: `${Math.max(0, Math.min(100, unclaimedPercent))}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[8px] tracking-[0.16em] text-neutral-600">
                <span>CLAIMED</span>
                <span className="text-neutral-300">AVAILABLE</span>
              </div>

              <div className="mt-5 grid grid-cols-2 border border-grid">
                <div className="border-r border-grid px-4 py-3">
                  <div className="text-[9px] tracking-[0.18em] text-neutral-500">
                    CLAIMED
                  </div>
                  <div className="mt-1 text-sm text-neutral-300">
                    {yieldValue(summary?.claimedRewards ?? null)}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[9px] tracking-[0.18em] text-neutral-500">
                    UNCLAIMED
                  </div>
                  <div className="mt-1 text-sm text-white">
                    {yieldValue(summary ? summary.unclaimedRewards : null)}
                  </div>
                </div>
              </div>

              {error ? (
                <div className="mt-4 border-l-2 border-amber-400 pl-3 text-[10px] leading-relaxed text-amber-400">
                  REWARD READ FAILED · {error}
                </div>
              ) : null}
              {historyError ? (
                <div className="mt-4 border-l-2 border-amber-400 pl-3 text-[10px] leading-relaxed text-amber-400">
                  CLAIM HISTORY UNAVAILABLE · Lifetime yield is hidden until
                  Torii history is available.
                </div>
              ) : null}
              {claimError ? (
                <div className="mt-4 border-l-2 border-amber-400 pl-3 text-[10px] leading-relaxed text-amber-400">
                  CLAIM FAILED · {claimError}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void claimYield()}
                disabled={
                  isLoading ||
                  isClaiming ||
                  !summary ||
                  summary.unclaimedRewards === 0n
                }
                className="mt-5 w-full border border-white bg-white px-4 py-3 text-[10px] font-semibold tracking-[0.2em] text-black transition-colors hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-500"
              >
                {claimLabel}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
