import { useId, useState } from 'react';
import { formatDurationWords } from '../../utils/format';

export type ActionBriefKind =
  | 'capture'
  | 'reinforce'
  | 'challenge'
  | 'join'
  | 'defend'
  | 'leading'
  | 'settle';

interface Brief {
  summary: string;
  details: string[];
}

function briefFor(kind: ActionBriefKind, windowSeconds: number | null): Brief {
  const challengeRules = [
    windowSeconds === null
      ? 'Each new lead resets the timer.'
      : `Each new lead resets the timer to ${formatDurationWords(windowSeconds)}.`,
    'Top bid when time runs out wins the Sector.',
    'Losing bids are spent. Your STRK stays staked.',
  ];

  switch (kind) {
    case 'capture':
      return {
        summary: 'Your FORCE becomes this Sector’s defense.',
        details: [
          'Challengers must beat it by 10%.',
          'Each Sector is one entry in the Supply Drop.',
          'Your STRK stays staked and earning.',
        ],
      };
    case 'reinforce':
      return {
        summary: 'Add FORCE to raise this Sector’s defense.',
        details: [
          'Challengers must beat it by 10%.',
          'Lose the Sector and this FORCE is spent.',
        ],
      };
    case 'challenge':
      return {
        summary: 'Bid 10% over the defense to start a challenge.',
        details: challengeRules,
      };
    case 'join':
      return {
        summary: 'Bid 10% over the top bid to take the lead.',
        details: challengeRules,
      };
    case 'defend':
      return {
        summary: 'You’re under challenge. Outbid them or lose this Sector.',
        details: [
          'Your defense already counts as your bid.',
          ...challengeRules,
        ],
      };
    case 'leading':
      return {
        summary: 'You’re winning. Hold the lead until time runs out.',
        details: challengeRules,
      };
    case 'settle':
      return {
        summary: 'Time’s up. Settle to give the Sector to the top bidder.',
        details: ['Anyone can settle. A keeper usually does it for you.'],
      };
  }
}

export function ActionBrief({
  kind,
  windowSeconds,
}: {
  kind: ActionBriefKind;
  windowSeconds: number | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const detailsId = useId();
  const brief = briefFor(kind, windowSeconds);

  return (
    <div className="border-b border-grid px-3 py-2.5">
      <p className="text-[11px] leading-relaxed tracking-[0.02em] text-neutral-300">
        {brief.summary}
      </p>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={detailsId}
        onClick={() => setIsOpen((open) => !open)}
        className="mt-1.5 text-[9px] tracking-[0.18em] text-dim transition-colors hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        HOW IT WORKS {isOpen ? '[−]' : '[+]'}
      </button>
      {isOpen ? (
        <ul
          id={detailsId}
          className="mt-2 space-y-1.5 text-[10px] leading-relaxed tracking-[0.02em] text-neutral-400"
        >
          {brief.details.map((detail, index) => (
            <li key={index} className="grid grid-cols-[10px_1fr] gap-1">
              <span aria-hidden="true" className="text-dim">
                ›
              </span>
              <span>{detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
