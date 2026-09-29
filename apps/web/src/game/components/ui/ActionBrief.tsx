import { useId, useState } from 'react';

export type ActionBriefKind = 'capture' | 'takeover' | 'reinforce';

interface Brief {
  summary: string;
  details: string[];
}

const BRIEFS: Record<ActionBriefKind, Brief> = {
  capture: {
    summary: 'Your FORCE becomes this Sector’s defense.',
    details: [
      'Anyone can take it by committing 10% more.',
      'If they do, your FORCE comes back to you.',
      'Each Sector is one entry in the Supply Drop.',
      'Your STRK stays staked and earning.',
    ],
  },
  takeover: {
    summary: 'Beat its defense by 10% and it’s yours right away.',
    details: [
      'The owner gets their FORCE back.',
      'They can take it back by beating you by 10%.',
      'Your STRK stays staked and earning.',
    ],
  },
  reinforce: {
    summary: 'Add FORCE to raise this Sector’s defense.',
    details: [
      'Anyone taking it must beat the new total by 10%.',
      'If it’s taken, all of your FORCE comes back.',
    ],
  },
};

export function ActionBrief({ kind }: { kind: ActionBriefKind }) {
  const [isOpen, setIsOpen] = useState(false);
  const detailsId = useId();
  const brief = BRIEFS[kind];

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
