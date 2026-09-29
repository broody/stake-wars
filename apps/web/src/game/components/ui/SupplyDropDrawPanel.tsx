import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SupplyDrop } from '../../types';
import { config } from '../../services/config';
import { isSupplyDropDrawPending } from '../../services/supplyDrop';
import { AddressLink } from './AddressLink';
import { addressesMatch, formatStrk, isZeroAddress } from '../../utils/format';
import { Button, Eyebrow, Panel } from '../../../ui';

function prizeLabel(supplyDrop: SupplyDrop): string {
  if (supplyDrop.prizeKind === 1) {
    return addressesMatch(supplyDrop.token, config.strkTokenAddress)
      ? `${formatStrk(supplyDrop.amount, 6)} STRK`
      : `${supplyDrop.amount.toLocaleString()} UNITS`;
  }
  if (supplyDrop.prizeKind === 2) return `TOKEN #${supplyDrop.tokenId}`;
  return `${supplyDrop.amount.toLocaleString()} × #${supplyDrop.tokenId}`;
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

export function SupplyDropDrawPanel({
  supplyDrop,
  isOpen,
  onClose,
}: {
  supplyDrop: SupplyDrop | null;
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

  const endsAt = supplyDrop?.endsAt ?? 0;
  const status = supplyDrop?.status ?? 0;

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

  if (!isOpen || !supplyDrop) return null;

  const hasWinner = !isZeroAddress(supplyDrop.winner);
  return (
    <Panel
      as="aside"
      tone="floating"
      role="dialog"
      aria-labelledby="supply-drop-draw-title"
      data-supply-drop-console
      data-preserve-core-tracking
      className="pointer-events-auto absolute bottom-20 left-3 right-3 z-[80] border-gold/70 font-mono text-caption text-fg shadow-hard-gold sm:left-4 sm:right-auto sm:w-[22rem]"
    >
      <header className="flex items-center justify-between gap-3 border-b border-gold/25 px-4 py-3">
        <div className="min-w-0">
          <Eyebrow
            id="supply-drop-draw-title"
            tone="gold"
            className="flex items-center gap-2"
          >
            <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-gold" />
            <span className="truncate">
              SUPPLY DROP #{supplyDrop.id.toString()}
            </span>
          </Eyebrow>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="shrink-0"
          aria-label="Close Supply Drop details"
        >
          CLOSE
        </Button>
      </header>

      <div className="space-y-4 px-4 py-4">
        {hasWinner ? (
          <section className="relative overflow-hidden border border-gold bg-gold/10 px-4 py-3 shadow-inset-gold">
            <div
              aria-hidden="true"
              className="absolute -right-3 -top-5 h-14 w-14 rotate-45 border border-gold/20"
            />
            <div className="relative flex items-center gap-3">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rotate-45 bg-gold shadow-glow-gold"
              />
              <span className="text-heading text-gold-soft">WINNER</span>
            </div>
            <div className="relative mt-3 min-w-0 break-words border-t border-gold/30 pt-3 text-lead text-fg">
              <AddressLink address={supplyDrop.winner} />
            </div>
          </section>
        ) : (
          <section className="border-l-2 border-gold pl-3">
            <div className="text-label text-fg-subtle">RESULT</div>
            <div className="mt-1 text-body text-fg">NO WINNER</div>
          </section>
        )}

        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-3 border-t border-line pt-3 text-caption">
          {supplyDrop.status === 2 || supplyDrop.status === 3 ? (
            <>
              <dt className="text-label text-fg-subtle">NEXT DRAW</dt>
              <dd className="text-right text-body tabular-nums text-gold">
                {isSupplyDropDrawPending(supplyDrop, now)
                  ? 'PENDING'
                  : formatCountdown(supplyDrop.endsAt, now)}
              </dd>
            </>
          ) : null}
          <dt className="text-label text-fg-subtle">PRIZE</dt>
          <dd className="min-w-0 break-words text-right text-body text-fg-secondary">
            {prizeLabel(supplyDrop)}
          </dd>
        </dl>
      </div>

      <Link
        to="/drop"
        className="flex items-center justify-between border-t border-gold/25 px-4 py-3 text-label text-gold transition-colors hover:bg-gold hover:text-surface focus-visible:outline-offset-[-3px] focus-visible:outline-gold"
      >
        <span>VIEW SUPPLY DROP</span>
        <span aria-hidden="true">↗</span>
      </Link>
    </Panel>
  );
}
