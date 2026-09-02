import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Jackpot } from '../../types';
import { config } from '../../services/config';
import { isJackpotDrawPending } from '../../services/jackpot';
import {
  addressesMatch,
  formatStrk,
  isZeroAddress,
  shortAddress,
} from '../../utils/format';

function prizeLabel(jackpot: Jackpot): string {
  if (jackpot.prizeKind === 1) {
    return addressesMatch(jackpot.token, config.strkTokenAddress)
      ? `${formatStrk(jackpot.amount, 6)} STRK`
      : `${jackpot.amount.toLocaleString()} UNITS`;
  }
  if (jackpot.prizeKind === 2) return `TOKEN #${jackpot.tokenId}`;
  return `${jackpot.amount.toLocaleString()} × #${jackpot.tokenId}`;
}

function formatCountdown(endsAt: number, now: number): string {
  let remaining = Math.max(0, endsAt - Math.floor(now / 1_000));
  const days = Math.floor(remaining / 86_400);
  remaining %= 86_400;
  const hours = Math.floor(remaining / 3_600);
  remaining %= 3_600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const clock = [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
  return days > 0 ? `${days}D ${clock}` : clock;
}

export function JackpotDrawPanel({
  jackpot,
  isOpen,
  onClose,
}: {
  jackpot: Jackpot | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  const endsAt = jackpot?.endsAt ?? 0;
  const status = jackpot?.status ?? 0;

  useEffect(() => {
    if (!isOpen || status !== 2 || endsAt === 0) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(() => {
      tick();
      if (Date.now() >= endsAt * 1_000) window.clearInterval(timer);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [endsAt, isOpen, status]);

  if (!isOpen || !jackpot) return null;

  const hasWinner = !isZeroAddress(jackpot.winner);
  return (
    <aside
      role="dialog"
      aria-labelledby="jackpot-draw-title"
      data-jackpot-console
      data-preserve-core-tracking
      className="pointer-events-auto absolute bottom-20 left-3 right-3 z-[80] border border-[#d6a84b]/70 bg-black/95 font-mono text-xs text-fg shadow-[8px_8px_0_rgba(214,168,75,0.12)] backdrop-blur-md sm:left-4 sm:right-auto sm:w-[22rem]"
    >
      <header className="flex items-center justify-between border-b border-[#d6a84b]/25 px-4 py-3">
        <div>
          <div
            id="jackpot-draw-title"
            className="flex items-center gap-2 text-[11px] tracking-[0.2em] text-[#d6a84b]"
          >
            <span className="h-1.5 w-1.5 rotate-45 bg-[#d6a84b]" />
            JACKPOT #{jackpot.id.toString()}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 text-[9px] tracking-[0.14em] text-neutral-500 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
          aria-label="Close Jackpot draw details"
        >
          CLOSE
        </button>
      </header>

      <div className="space-y-4 px-4 py-4">
        {hasWinner ? (
          <section className="relative overflow-hidden border border-[#d6a84b] bg-[#d6a84b]/10 px-4 py-3 shadow-[inset_3px_0_0_#d6a84b]">
            <div
              aria-hidden="true"
              className="absolute -right-3 -top-5 h-14 w-14 rotate-45 border border-[#d6a84b]/20"
            />
            <div className="relative flex items-center gap-3">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rotate-45 bg-[#d6a84b] shadow-[0_0_14px_rgba(214,168,75,0.9)]"
              />
              <span className="text-xl tracking-[0.18em] text-[#e8bd63]">
                WINNER
              </span>
            </div>
            <div className="relative mt-3 border-t border-[#d6a84b]/30 pt-3 text-base text-neutral-100">
              {shortAddress(jackpot.winner)}
            </div>
          </section>
        ) : (
          <section className="border-l-2 border-[#d6a84b] pl-3">
            <div className="text-[8px] tracking-[0.18em] text-neutral-600">
              RESULT
            </div>
            <div className="mt-1 text-sm text-neutral-100">NO WINNER</div>
          </section>
        )}

        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-3 border-t border-neutral-800 pt-3 text-[10px]">
          {jackpot.status === 2 || jackpot.status === 3 ? (
            <>
              <dt className="tracking-[0.16em] text-neutral-600">NEXT DRAW</dt>
              <dd className="text-right text-sm tabular-nums text-[#d6a84b]">
                {isJackpotDrawPending(jackpot, now)
                  ? 'PENDING'
                  : formatCountdown(jackpot.endsAt, now)}
              </dd>
            </>
          ) : null}
          <dt className="tracking-[0.16em] text-neutral-600">PRIZE</dt>
          <dd className="text-right text-sm text-neutral-200">
            {prizeLabel(jackpot)}
          </dd>
        </dl>
      </div>

      <Link
        to="/jackpot"
        className="flex items-center justify-between border-t border-[#d6a84b]/25 px-4 py-3 text-[9px] tracking-[0.17em] text-[#d6a84b] transition-colors hover:bg-[#d6a84b] hover:text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-[#d6a84b]"
      >
        <span>VIEW JACKPOT</span>
        <span aria-hidden="true">↗</span>
      </Link>
    </aside>
  );
}
