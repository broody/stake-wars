import { useControlPoints } from '../../contexts/ControlPointContext';
import { useWallet } from '../../contexts/WalletContext';
import type { CoreMode } from '../../types';

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
      className={`relative px-4 py-2 text-[10px] tracking-[0.22em] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white ${
        active
          ? 'bg-white text-black'
          : 'text-neutral-500 hover:text-white disabled:cursor-not-allowed disabled:text-neutral-700'
      }`}
    >
      {label}
    </button>
  );
}

export function CoreModeSwitch() {
  const { address } = useWallet();
  const { mode, changeMode } = useControlPoints();

  return (
    <div className="pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2 font-mono">
      <div className="mb-1 text-center text-[8px] tracking-[0.28em] text-neutral-600">
        CORE INTERFACE
      </div>
      <div
        role="tablist"
        aria-label="Core interface mode"
        className="flex border border-neutral-700 bg-black/90 p-1 shadow-[6px_6px_0_rgba(255,255,255,0.05)] backdrop-blur-sm"
      >
        <ModeButton
          label="CONTROL"
          mode="control"
          active={mode === 'control'}
          onSelect={changeMode}
        />
        <ModeButton
          label="PROJECTION"
          mode="projection"
          active={mode === 'projection'}
          disabled={!address}
          onSelect={changeMode}
        />
      </div>
      {!address && (
        <div className="mt-1 text-center text-[8px] tracking-wider text-neutral-600">
          CONNECT TO UNLOCK PROJECTION
        </div>
      )}
    </div>
  );
}
