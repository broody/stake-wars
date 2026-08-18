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
import { BatchCaptureControl } from './BatchCaptureControl';
import { groupBatchControlPoints } from '../../services/controlPointBatch';

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
  const isMultiSelection = selectedControlPointIds.length > 1;
  const batchGroups = groupBatchControlPoints(selectedControlPoints, address);
  const hasLoadedFullSelection =
    selectedControlPoints.length === selectedControlPointIds.length;

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
            {isMultiSelection
              ? 'MULTIPLE'
              : `CP-${selectedControlPointId.toString().padStart(4, '0')}`}
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

        {!isMultiSelection ? (
          <>
            <div className="border-b border-grid pb-3">
              <div className="text-[10px] tracking-[0.18em] text-dim">
                OWNER
              </div>
              <div className="mt-1 flex items-baseline gap-2 tracking-wider text-neutral-300">
                <span title={selectedControlPoint?.controller}>
                  {!selectedControlPoint
                    ? '---'
                    : neutral
                      ? '—'
                      : shortAddress(selectedControlPoint.controller)}
                </span>
                {controlledByOperator && (
                  <span
                    className="text-[9px] tracking-[0.16em]"
                    style={{ color: CONTROL_POINT_COLORS.owned }}
                  >
                    (YOU)
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-6 py-2">
              <span className="text-[10px] tracking-[0.18em] text-dim">
                STAKED
              </span>
              <span className="text-neutral-300">
                {selectedControlPoint ? (
                  <>
                    {formatStrk(selectedControlPoint.captureForce, 18)}{' '}
                    <span className="text-[10px] text-dim">STRK</span>
                  </>
                ) : (
                  '---'
                )}
              </span>
            </div>
          </>
        ) : null}

        {selectedControlPoint ? (
          <>
            {!isMultiSelection &&
              (selectedControlPoint.stale ||
                selectedControlPoint.needsSync) && (
                <div className="mt-3 border border-amber-500/50 px-3 py-2 leading-relaxed text-amber-400">
                  This Control Point has stale Operator state and must be
                  synced.
                </div>
              )}

            {!isMultiSelection &&
            ((!selectedControlPoint.stale && !selectedControlPoint.needsSync) ||
              selectedControlPoint.activeChallengeId !== 0n) ? (
              <CaptureControl
                key={`action-${selectedControlPoint.id}-${selectedControlPoint.activeChallengeId}`}
                controlPoints={[selectedControlPoint]}
                intent={controlledByOperator ? 'fortify' : 'capture'}
              />
            ) : null}
            {isMultiSelection && hasLoadedFullSelection ? (
              <>
                {batchGroups.neutral.length > 0 && (
                  <BatchCaptureControl
                    key={`batch-capture-${batchGroups.neutral.map(({ id }) => id).join('-')}`}
                    controlPoints={batchGroups.neutral}
                    intent="capture"
                  />
                )}
                {batchGroups.owned.length > 0 && (
                  <BatchCaptureControl
                    key={`batch-fortify-${batchGroups.owned.map(({ id }) => id).join('-')}`}
                    controlPoints={batchGroups.owned}
                    intent="fortify"
                  />
                )}
                {batchGroups.individualOnly.length > 0 && (
                  <div className="mt-3 border border-amber-500/50 px-3 py-2 leading-relaxed text-amber-400">
                    {batchGroups.individualOnly.length} selected Control Point
                    {batchGroups.individualOnly.length === 1 ? '' : 's'} require
                    an individual challenge or state sync and are excluded from
                    batch actions.
                  </div>
                )}
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}
