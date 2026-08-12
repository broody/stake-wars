import { useEffect } from 'react';
import { useControlPoints } from '../../contexts/ControlPointContext';
import { useWallet } from '../../contexts/WalletContext';
import {
  addressesMatch,
  formatStrk,
  isZeroAddress,
  shortAddress,
} from '../../utils/format';
import { CONTROL_POINT_COLORS } from '../../utils/controlPointVisuals';
import { CaptureControl } from './CaptureControl';

interface StakeRowProps {
  label: string;
  value?: bigint;
  emphasis?: boolean;
}

function StakeRow({ label, value, emphasis = false }: StakeRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-grid py-2">
      <span className="text-[10px] tracking-[0.18em] text-dim">{label}</span>
      <span className={emphasis ? 'text-fg' : 'text-neutral-300'}>
        {value === undefined ? (
          '---'
        ) : (
          <>
            {formatStrk(value)}{' '}
            <span className="text-[10px] text-dim">STRK</span>
          </>
        )}
      </span>
    </div>
  );
}

export function SelectionPanel() {
  const { address } = useWallet();
  const {
    selectedControlPointId,
    selectedControlPointIds,
    mode,
    selectedControlPoint,
    selectedControlPoints,
    isControlPointInteractionLocked,
    controlPointError,
    selectControlPoint,
    refreshControlPoint,
  } = useControlPoints();

  useEffect(() => {
    if (
      mode !== 'control' ||
      selectedControlPointId === null ||
      isControlPointInteractionLocked
    ) {
      return;
    }

    const cancelSelection = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      selectControlPoint(null);
    };

    window.addEventListener('keydown', cancelSelection);
    return () => window.removeEventListener('keydown', cancelSelection);
  }, [
    isControlPointInteractionLocked,
    mode,
    selectControlPoint,
    selectedControlPointId,
  ]);

  if (mode !== 'control' || selectedControlPointId === null) {
    return null;
  }

  const neutral =
    selectedControlPoint !== null &&
    isZeroAddress(selectedControlPoint.controller);
  const controlledByOperator =
    Boolean(address) &&
    selectedControlPoint !== null &&
    addressesMatch(selectedControlPoint.controller, address ?? '0x0');
  const claimableControlPoints = selectedControlPoints.filter(
    (controlPoint) =>
      !address || !addressesMatch(controlPoint.controller, address)
  );
  const fortifiableControlPoints = selectedControlPoints.filter(
    (controlPoint) =>
      Boolean(address) &&
      addressesMatch(controlPoint.controller, address ?? '0x0') &&
      !controlPoint.stale &&
      !controlPoint.needsSync
  );
  const isMultiSelection = selectedControlPointIds.length > 1;

  return (
    <aside className="pointer-events-auto absolute left-3 right-3 top-20 border border-neutral-600 bg-black/90 font-mono text-xs text-fg shadow-[8px_8px_0_rgba(255,255,255,0.06)] backdrop-blur-sm sm:left-auto sm:right-4 sm:w-[22rem]">
      <header className="flex items-center justify-between border-b border-neutral-600 px-4 py-3">
        <div>
          <div className="text-[9px] tracking-[0.24em] text-dim">
            {isMultiSelection
              ? `${selectedControlPointIds.length} CONTROL POINTS SELECTED`
              : 'SELECTED CONTROL POINT'}
          </div>
          <div className="mt-1 text-base tracking-[0.12em]">
            {isMultiSelection ? 'FOCUSED ' : ''}CP-
            {selectedControlPointId.toString().padStart(4, '0')}
          </div>
        </div>
        <button
          type="button"
          onClick={() => selectControlPoint(null)}
          disabled={isControlPointInteractionLocked}
          className="border border-grid px-2 py-1 text-dim transition-colors hover:border-neutral-500 hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-700"
          aria-label="Close Control Point details"
        >
          ESC
        </button>
      </header>

      <div className="px-4 py-3">
        {controlPointError && (
          <div className="py-3">
            <div className="text-amber-400">READ FAILED</div>
            <p className="mt-2 break-words leading-relaxed text-neutral-400">
              {controlPointError}
            </p>
            <button
              type="button"
              onClick={refreshControlPoint}
              className="mt-3 border border-neutral-600 px-3 py-1.5 tracking-widest transition-colors hover:border-white"
            >
              RETRY READ
            </button>
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] tracking-[0.18em] text-dim">STATUS</span>
          <span
            className="flex items-center gap-2 tracking-[0.14em]"
            style={{
              color: controlledByOperator
                ? CONTROL_POINT_COLORS.owned
                : undefined,
            }}
          >
            {selectedControlPoint ? (
              <>
                <span
                  className={`h-1.5 w-1.5 ${neutral ? 'bg-neutral-600' : controlledByOperator ? '' : 'bg-white'}`}
                  style={{
                    backgroundColor: controlledByOperator
                      ? CONTROL_POINT_COLORS.owned
                      : undefined,
                  }}
                />
                {neutral
                  ? 'NEUTRAL'
                  : controlledByOperator
                    ? 'OWNED BY YOU'
                    : 'OCCUPIED'}
              </>
            ) : (
              '---'
            )}
          </span>
        </div>

        <div className="border-t border-grid py-2">
          <div className="text-[10px] tracking-[0.18em] text-dim">OWNER</div>
          <div
            className="mt-1 tracking-wider text-neutral-300"
            title={selectedControlPoint?.controller}
          >
            {!selectedControlPoint
              ? '---'
              : neutral
                ? '—'
                : shortAddress(selectedControlPoint.controller)}
          </div>
        </div>

        <StakeRow
          label="ALLOCATED"
          value={selectedControlPoint?.allocatedStake}
        />
        <StakeRow
          label="REQUIRED CHALLENGE"
          value={selectedControlPoint?.requiredStake}
          emphasis
        />

        {selectedControlPoint ? (
          <>
            {(selectedControlPoint.stale || selectedControlPoint.needsSync) && (
              <div className="mt-3 border border-amber-500/50 px-3 py-2 leading-relaxed text-amber-400">
                This Control Point has stale Operator state and must be synced.
              </div>
            )}

            {claimableControlPoints.length > 0 &&
            selectedControlPoints.length === selectedControlPointIds.length ? (
              <CaptureControl
                key={`capture-${selectedControlPointIds.join('-')}`}
                controlPoints={claimableControlPoints}
              />
            ) : null}

            {fortifiableControlPoints.length > 0 &&
            selectedControlPoints.length === selectedControlPointIds.length ? (
              <CaptureControl
                key={`fortify-${selectedControlPointIds.join('-')}`}
                controlPoints={fortifiableControlPoints}
                intent="fortify"
              />
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}
