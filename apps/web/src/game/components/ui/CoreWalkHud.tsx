export function CoreWalkEntry({
  disabled,
  onEnter,
}: {
  disabled: boolean;
  onEnter: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onEnter}
      className="pointer-events-auto absolute bottom-5 left-4 z-20 hidden items-center gap-2 border border-[#ffb82e]/55 bg-black/70 px-3 py-2 font-mono text-[10px] tracking-[0.12em] text-[#ffb82e] backdrop-blur-sm transition-colors hover:border-[#ffb82e] hover:bg-[#ffb82e] hover:text-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-700 sm:flex"
      aria-label="Enter surface drive mode"
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 bg-current" />
      DRIVE THE CORE
      <span className="text-[8px] opacity-60">WASD</span>
    </button>
  );
}

export function CoreWalkHud({ onExit }: { onExit: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 font-mono">
      <div
        role="status"
        className="absolute left-4 top-20 flex items-center gap-2 border border-[#ffb82e]/35 bg-black/65 px-3 py-2 text-[9px] tracking-[0.14em] text-[#ffb82e] backdrop-blur-sm"
      >
        <span className="h-1.5 w-1.5 animate-pulse bg-[#ffb82e] motion-reduce:animate-none" />
        ROVER LINK
      </div>

      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 opacity-70"
      >
        <span className="absolute left-0 top-1/2 h-px w-1.5 bg-[#ffb82e]" />
        <span className="absolute right-0 top-1/2 h-px w-1.5 bg-[#ffb82e]" />
        <span className="absolute left-1/2 top-0 h-1.5 w-px bg-[#ffb82e]" />
        <span className="absolute bottom-0 left-1/2 h-1.5 w-px bg-[#ffb82e]" />
      </div>

      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap bg-black/65 px-3 py-2 text-[9px] tracking-[0.1em] text-neutral-400 backdrop-blur-sm">
        <span>
          <strong className="font-normal text-white">WASD</strong> DRIVE
        </span>
        <span className="h-3 w-px bg-neutral-700" />
        <span>
          <strong className="font-normal text-white">RMB / SHIFT+DRAG</strong>{' '}
          CAMERA
        </span>
        <span className="h-3 w-px bg-neutral-700" />
        <button
          type="button"
          onClick={onExit}
          className="pointer-events-auto text-neutral-400 hover:text-[#ffb82e] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <strong className="font-normal text-white">ESC</strong> ORBIT
        </button>
      </div>
    </div>
  );
}
