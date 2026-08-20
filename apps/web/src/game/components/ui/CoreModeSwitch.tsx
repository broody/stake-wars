import { useEffect, useRef, useState } from 'react';
import { useSectors } from '../../contexts/SectorContext';
import { useWallet } from '../../contexts/WalletContext';
import type { ControlView, CoreMode, StakeScale } from '../../types';

interface ModeButtonProps {
  label: string;
  mode: CoreMode;
  active: boolean;
  disabled?: boolean;
  onSelect: (mode: CoreMode) => void;
}

function ModeButton({
  label,
  mode,
  active,
  disabled = false,
  onSelect,
}: ModeButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={() => onSelect(mode)}
      className={`relative z-10 w-full px-4 py-2 text-[10px] tracking-[0.22em] transition-colors duration-300 ease-out motion-reduce:transition-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white ${
        active
          ? 'text-black'
          : 'text-neutral-500 hover:text-white disabled:cursor-not-allowed disabled:text-neutral-700'
      }`}
    >
      {label}
    </button>
  );
}

export function CoreModeSwitch() {
  const { address } = useWallet();
  const {
    mode,
    controlView,
    stakeScale,
    changeMode,
    changeControlView,
    changeStakeScale,
  } = useSectors();
  const [controlMenuOpen, setControlMenuOpen] = useState(false);
  const switchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!controlMenuOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!switchRef.current?.contains(event.target as Node)) {
        setControlMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setControlMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [controlMenuOpen]);

  const selectControlView = (view: ControlView) => {
    changeControlView(view);
    if (mode !== 'control') changeMode('control');
  };

  const scaleOptions: { label: string; value: StakeScale }[] = [
    { label: 'ABSOLUTE', value: 'absolute' },
    { label: 'LOG', value: 'logarithmic' },
  ];

  return (
    <div
      ref={switchRef}
      className="pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2 font-mono"
    >
      <div
        id="control-view-options"
        aria-hidden={!controlMenuOpen}
        className={`absolute bottom-full left-0 mb-2 w-[min(88vw,21.5rem)] origin-bottom border border-neutral-700 bg-black/95 p-1 shadow-[6px_6px_0_rgba(255,255,255,0.05)] backdrop-blur-sm transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transition-none ${
          controlMenuOpen
            ? 'visible translate-y-0 opacity-100'
            : 'invisible pointer-events-none translate-y-2 opacity-0'
        }`}
      >
        <div className="px-2 pb-1.5 pt-1 text-[8px] tracking-[0.2em] text-neutral-600">
          CONTROL VIEW
        </div>
        <div className="grid grid-cols-2 gap-1">
          {(
            [
              ['FLAT VIEW', 'flat'],
              ['STAKED VIEW', 'staked'],
            ] as const
          ).map(([label, view]) => (
            <button
              key={view}
              type="button"
              aria-pressed={controlView === view}
              tabIndex={controlMenuOpen ? 0 : -1}
              onClick={() => selectControlView(view)}
              className={`px-3 py-2 text-[9px] tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white ${
                controlView === view
                  ? 'bg-white text-black'
                  : 'bg-neutral-950 text-neutral-500 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {controlView === 'staked' ? (
          <div className="mt-1 border-t border-neutral-800 px-2 pb-1.5 pt-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[8px] tracking-[0.16em] text-neutral-600">
                HEIGHT SCALE
              </span>
              <div className="grid grid-cols-2 border border-neutral-700 p-0.5">
                {scaleOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={stakeScale === option.value}
                    tabIndex={controlMenuOpen ? 0 : -1}
                    onClick={() => changeStakeScale(option.value)}
                    className={`px-2 py-1 text-[8px] tracking-[0.12em] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white ${
                      stakeScale === option.value
                        ? 'bg-neutral-200 text-black'
                        : 'text-neutral-600 hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="Game mode"
        className="relative grid w-[min(88vw,21.5rem)] grid-cols-2 border border-neutral-700 bg-black/90 p-1 shadow-[6px_6px_0_rgba(255,255,255,0.05)] backdrop-blur-sm"
      >
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%_-_0.25rem)] bg-white transition-transform duration-300 ease-out motion-reduce:transition-none ${
            mode === 'projection' ? 'translate-x-full' : 'translate-x-0'
          }`}
        />
        <div className="relative z-10 grid grid-cols-[1fr_2rem]">
          <button
            type="button"
            role="tab"
            aria-label={`Control mode, ${controlView} view`}
            aria-selected={mode === 'control'}
            onClick={() => changeMode('control')}
            className={`w-full py-2 pl-4 text-[10px] tracking-[0.22em] transition-colors duration-300 ease-out motion-reduce:transition-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white ${
              mode === 'control'
                ? 'text-black'
                : 'text-neutral-500 hover:text-white'
            }`}
          >
            CONTROL
          </button>
          <button
            type="button"
            aria-label="Choose Control view"
            aria-expanded={controlMenuOpen}
            aria-controls="control-view-options"
            onClick={() => setControlMenuOpen((open) => !open)}
            className={`grid place-items-center border-l text-[10px] transition-colors duration-300 ease-out motion-reduce:transition-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white ${
              mode === 'control'
                ? 'border-black/15 text-black hover:bg-black/10'
                : 'border-neutral-800 text-neutral-600 hover:text-white'
            }`}
          >
            <span
              aria-hidden="true"
              className={`transition-transform duration-200 motion-reduce:transition-none ${
                controlMenuOpen ? 'rotate-180' : 'rotate-0'
              }`}
            >
              ▴
            </span>
          </button>
        </div>
        <ModeButton
          label="PROJECTION"
          mode="projection"
          active={mode === 'projection'}
          disabled={!address}
          onSelect={changeMode}
        />
      </div>
    </div>
  );
}
