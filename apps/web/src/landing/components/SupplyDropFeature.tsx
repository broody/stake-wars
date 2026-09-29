import { useEffect, useState } from 'react';
import {
  formatLandingSupplyDropPrize,
  getCurrentLandingSupplyDrop,
  type LandingSupplyDrop,
} from '../services/supplyDrop';
import { buttonStyles, Eyebrow, Panel } from '../../ui';

function formatCountdown(endsAt: number, now: number): string {
  let remaining = Math.max(0, endsAt - Math.floor(now / 1_000));
  const days = Math.floor(remaining / 86_400);
  remaining %= 86_400;
  const hours = Math.floor(remaining / 3_600);
  remaining %= 3_600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return [days, hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
}

function CurrentPot({ supplyDrop }: { supplyDrop: LandingSupplyDrop }) {
  const [now, setNow] = useState(() => Date.now());
  const prize = formatLandingSupplyDropPrize(supplyDrop);
  const isDrawPending =
    supplyDrop.status === 3 || supplyDrop.endsAt * 1_000 <= now;

  useEffect(() => {
    if (isDrawPending) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [isDrawPending]);

  return (
    <div className="relative flex min-h-72 flex-col justify-between overflow-hidden p-[30px] md:p-10">
      <div
        aria-hidden="true"
        className="absolute -right-16 -top-24 h-72 w-72 rotate-45 border border-gold/10"
      />
      <div className="relative flex items-center justify-between gap-4">
        <Eyebrow tone="gold" className="flex items-center gap-2">
          <span className="h-2 w-2 bg-gold shadow-glow-gold" />
          {isDrawPending ? 'DRAW PENDING' : 'LIVE DROP'}
        </Eyebrow>
        <Eyebrow>DROP #{supplyDrop.id.toString()}</Eyebrow>
      </div>

      <div className="relative my-10">
        <div className="break-words text-hero font-bold leading-none text-fg">
          {prize.value}
        </div>
        <Eyebrow tone="gold" className="mt-3">
          {prize.unit}
        </Eyebrow>
      </div>

      <div className="relative flex items-end justify-between gap-6 border-t border-gold/25 pt-5">
        <div>
          <Eyebrow>{isDrawPending ? 'STATUS' : 'TIME TO DROP'}</Eyebrow>
          <div className="mt-2 text-lead tabular-nums text-fg-secondary">
            {isDrawPending
              ? 'AWAITING SETTLEMENT'
              : formatCountdown(supplyDrop.endsAt, now)}
          </div>
        </div>
        <Eyebrow className="hidden text-right sm:block">
          DAYS · HRS · MIN · SEC
        </Eyebrow>
      </div>
    </div>
  );
}

export function SupplyDropFeature() {
  const [supplyDrop, setSupplyDrop] = useState<LandingSupplyDrop | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>(
    'loading'
  );

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      getCurrentLandingSupplyDrop(controller.signal)
        .then((current) => {
          setSupplyDrop(current);
          setState('ready');
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError')
            return;
          setState('unavailable');
        });
    };

    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  return (
    <Panel
      aria-labelledby="supply-drop-feature-heading"
      tone="strong"
      className="mb-16 grid bg-surface/70 lg:grid-cols-[0.85fr_1.15fr]"
    >
      <div className="flex flex-col justify-between border-b border-line-strong p-[30px] md:p-10 lg:border-b-0 lg:border-r">
        <div>
          <h2
            id="supply-drop-feature-heading"
            className="text-display font-bold"
          >
            SUPPLY DROP
          </h2>
          <p className="mt-6 text-lead text-fg">
            Reinforcements for Sector operators.
          </p>
          <p className="mt-4 max-w-xl text-body text-fg-muted">
            A portion of Stake Wars pool commissions funds each Supply Drop.
            When the window closes, one Sector is selected at random. Its
            operator at the deadline receives the drop. Received drops are
            staked automatically.
          </p>
        </div>

        <a
          href="/play/drop"
          className={buttonStyles({
            variant: 'outline',
            tone: 'gold',
            className: 'mt-10 w-fit',
          })}
        >
          VIEW SUPPLY DROP
        </a>
      </div>

      <div aria-live="polite" className="bg-gold-sheen">
        {state === 'loading' ? (
          <div className="grid min-h-72 place-items-center p-10 text-label text-fg-subtle">
            READING ON-CHAIN DROP…
          </div>
        ) : state === 'unavailable' ? (
          <div className="grid min-h-72 place-items-center p-10 text-center">
            <div>
              <div className="text-title font-bold">DROP DATA UNAVAILABLE</div>
              <p className="mt-3 text-body text-fg-subtle">
                Open the Supply Drop ledger to check the current drop.
              </p>
            </div>
          </div>
        ) : supplyDrop ? (
          <CurrentPot supplyDrop={supplyDrop} />
        ) : (
          <div className="grid min-h-72 place-items-center p-10 text-center">
            <div>
              <div className="text-title font-bold">NO ACTIVE SUPPLY DROP</div>
              <p className="mt-3 text-body text-fg-subtle">
                The next Supply Drop has not started yet.
              </p>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
