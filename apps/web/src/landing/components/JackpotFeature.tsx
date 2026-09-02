import { useEffect, useState } from 'react';
import {
  formatLandingJackpotPrize,
  getCurrentLandingJackpot,
  type LandingJackpot,
} from '../services/jackpot';

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

function CurrentPot({ jackpot }: { jackpot: LandingJackpot }) {
  const [now, setNow] = useState(() => Date.now());
  const prize = formatLandingJackpotPrize(jackpot);
  const isDrawPending = jackpot.status === 3 || jackpot.endsAt * 1_000 <= now;

  useEffect(() => {
    if (isDrawPending) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [isDrawPending]);

  return (
    <div className="relative flex min-h-72 flex-col justify-between overflow-hidden p-[30px] md:p-10">
      <div
        aria-hidden="true"
        className="absolute -right-16 -top-24 h-72 w-72 rotate-45 border border-[#d6a84b]/10"
      />
      <div className="relative flex items-center justify-between gap-4 text-[0.72rem] tracking-[0.2em]">
        <span className="flex items-center gap-2 text-[#d6a84b]">
          <span className="h-2 w-2 bg-[#d6a84b] shadow-[0_0_12px_rgba(214,168,75,0.65)]" />
          {isDrawPending ? 'DRAW PENDING' : 'LIVE POT'}
        </span>
        <span className="text-[#777]">JACKPOT #{jackpot.id.toString()}</span>
      </div>

      <div className="relative my-10">
        <div className="break-words text-[clamp(2.6rem,7vw,5rem)] font-bold leading-none tracking-[-0.06em] text-fg">
          {prize.value}
        </div>
        <div className="mt-3 text-[0.85rem] tracking-[0.22em] text-[#d6a84b]">
          {prize.unit}
        </div>
      </div>

      <div className="relative flex items-end justify-between gap-6 border-t border-[#d6a84b]/25 pt-5">
        <div>
          <div className="text-[0.68rem] tracking-[0.2em] text-[#777]">
            {isDrawPending ? 'STATUS' : 'DRAW IN'}
          </div>
          <div className="mt-2 text-[1.15rem] tabular-nums text-[#ddd]">
            {isDrawPending
              ? 'AWAITING SETTLEMENT'
              : formatCountdown(jackpot.endsAt, now)}
          </div>
        </div>
        <div className="hidden text-right text-[0.62rem] leading-5 tracking-[0.15em] text-[#666] sm:block">
          DAYS · HRS · MIN · SEC
        </div>
      </div>
    </div>
  );
}

export function JackpotFeature() {
  const [jackpot, setJackpot] = useState<LandingJackpot | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>(
    'loading'
  );

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      getCurrentLandingJackpot(controller.signal)
        .then((current) => {
          setJackpot(current);
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
    <section
      aria-labelledby="jackpot-feature-heading"
      className="mb-16 grid border border-dim bg-black/70 lg:grid-cols-[0.85fr_1.15fr]"
    >
      <div className="flex flex-col justify-between border-b border-dim p-[30px] md:p-10 lg:border-b-0 lg:border-r">
        <div>
          <h2
            id="jackpot-feature-heading"
            className="text-[2.5rem] font-bold tracking-[-0.05em] md:text-[3.2rem]"
          >
            JACKPOT
          </h2>
          <p className="mt-5 max-w-xl text-[1rem] leading-[1.75] text-[#bbb]">
            Each pot runs for a fixed window. When it expires, one Sector is
            drawn. The operator recorded at expiry wins the escrowed prize.
          </p>
        </div>

        <a
          href="/play/jackpot"
          className="mt-10 w-fit border border-[#d6a84b]/70 px-5 py-3 text-[0.72rem] tracking-[0.18em] text-[#d6a84b] transition-colors hover:bg-[#d6a84b] hover:text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#d6a84b]"
        >
          VIEW JACKPOT
        </a>
      </div>

      <div
        aria-live="polite"
        className="bg-[linear-gradient(135deg,rgba(214,168,75,0.055),transparent_55%)]"
      >
        {state === 'loading' ? (
          <div className="grid min-h-72 place-items-center p-10 text-[0.72rem] tracking-[0.2em] text-[#777]">
            READING ON-CHAIN POT…
          </div>
        ) : state === 'unavailable' ? (
          <div className="grid min-h-72 place-items-center p-10 text-center">
            <div>
              <div className="text-[1.35rem] font-bold">
                POT DATA UNAVAILABLE
              </div>
              <p className="mt-3 text-[0.85rem] leading-6 text-[#777]">
                Open the Jackpot ledger to check the current draw.
              </p>
            </div>
          </div>
        ) : jackpot ? (
          <CurrentPot jackpot={jackpot} />
        ) : (
          <div className="grid min-h-72 place-items-center p-10 text-center">
            <div>
              <div className="text-[1.35rem] font-bold">NO ACTIVE JACKPOT</div>
              <p className="mt-3 text-[0.85rem] leading-6 text-[#777]">
                The next pot has not started yet.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
