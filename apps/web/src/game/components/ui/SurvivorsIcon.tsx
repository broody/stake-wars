import type { ReactNode } from 'react';
import type { SystemId, WeaponId } from '../../survivors/content';

/** Line glyphs for the Vanguard's weapons and systems, drawn in currentColor. */
const GLYPHS: Record<WeaponId | SystemId | 'repair' | 'sharpen', ReactNode> = {
  blade: (
    <>
      <path d="M5 19 19 5" />
      <path d="M8 13l3 3M4 20l2-2" />
    </>
  ),
  bolts: (
    <>
      <path d="M4 12h9" />
      <path d="M13 8l5 4-5 4" />
      <path d="M4 7h4M4 17h4" />
    </>
  ),
  shards: (
    <>
      <circle cx="12" cy="12" r="7" strokeDasharray="3 3" />
      <path d="M12 3l2 2-2 2-2-2zM12 17l2 2-2 2-2-2z" />
    </>
  ),
  strike: <path d="M13 3 7 13h5l-1 8 6-10h-5z" />,
  charge: (
    <>
      <circle cx="11" cy="14" r="5" />
      <path d="M14 10l3-3M17 4v2M20 7h-2" />
    </>
  ),
  pulse: (
    <>
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="9" strokeDasharray="2 3" />
    </>
  ),
  force: <path d="M12 4 20 19H4z" />,
  overclock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  thrusters: <path d="M6 5l6 7-6 7M12 5l6 7-6 7" />,
  amplifier: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  plating: <path d="M12 3 20 7v6c0 4-3.5 6.5-8 8-4.5-1.5-8-4-8-8V7z" />,
  nanorepair: (
    <>
      <path d="M12 6v12M6 12h12" />
      <rect x="4" y="4" width="16" height="16" />
    </>
  ),
  tractor: <path d="M6 4v8a6 6 0 0 0 12 0V4M6 8h3M15 8h3" />,
  repair: <path d="M12 6v12M6 12h12" />,
  sharpen: <path d="M5 19 19 5M14 5h5v5" />,
};

export function SurvivorsIcon({
  id,
  className,
}: {
  id: keyof typeof GLYPHS;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      className={className}
    >
      {GLYPHS[id]}
    </svg>
  );
}
