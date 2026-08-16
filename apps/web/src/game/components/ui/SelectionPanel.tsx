import { useEffect, useState } from 'react';
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
import { formatControlPointTenure } from '../../utils/controlPointTenure';
import { groupBatchControlPoints } from '../../services/controlPointBatch';

const TENURE_CLOCK_INTERVAL_MS = 60 * 60 * 1_000;

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
    controlPointControlledSince,
    isControlPointInteractionLocked,
    controlPointError,
    selectControlPoint,
    refreshControlPoint,
  } = useControlPoints();
  const [tenureClock, setTenureClock] = useState(() => Date.now() / 1_000);

  useEffect(() => {
    const interval = window.setInterval(
      () => setTenureClock(Date.now() / 1_000),
      TENURE_CLOCK_INTERVAL_MS
    );
    return () => window.clearInterval(interval);
  }, []);

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
  const selectedControlPointById = new Map(
    selectedControlPoints.map((point) => [point.id, point])
  );
  const selectedTenures = selectedControlPointIds
    .map(
      (id) =>
        selectedControlPointById.get(id)?.controlledSince ??
        controlPointControlledSince.get(id) ??
        null
    )
    .filter((controlledSince): controlledSince is number =>
      Number.isFinite(controlledSince)
    );
  const formattedTenure = (() => {
    if (!isMultiSelection && neutral) return '—';
    if (selectedTenures.length === 0) return '---';
    const formatted = [...selectedTenures]
      .sort((left, right) => right - left)
      .map((controlledSince) =>
        formatControlPointTenure(controlledSince, tenureClock)
      );
    if (!isMultiSelection) return formatted[0];
    const unique = [...new Set(formatted)];
    return unique.length === 1
      ? unique[0]
      : `${unique[0]} – ${unique[unique.length - 1]}`;
  })();
  const tenureTitle =
    !isMultiSelection && selectedTenures[0] !== undefined
      ? `Controlled since ${new Date(selectedTenures[0] * 1_000).toLocaleString()}`
      : undefined;

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
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] tracking-[0.18em] text-dim">
                STATUS
              </span>
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
              <div className="text-[10px] tracking-[0.18em] text-dim">
                OWNER
              </div>
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
              label="CAPTURE POWER"
              value={selectedControlPoint?.capturePower}
            />
          </>
        ) : null}

        <div className="flex items-baseline justify-between gap-6 border-t border-grid py-2">
          <span className="text-[10px] tracking-[0.18em] text-dim">
            HELD FOR
          </span>
          <span className="text-neutral-300" title={tenureTitle}>
            {formattedTenure}
          </span>
        </div>

        {!isMultiSelection ? (
          <StakeRow
            label={
              selectedControlPoint?.activeChallengeId
                ? 'AUCTION RESERVE'
                : 'REQUIRED CHALLENGE'
            }
            value={selectedControlPoint?.requiredStake}
            emphasis
          />
        ) : null}

        {!isMultiSelection && selectedControlPoint?.activeChallengeId !== 0n ? (
          <>
            <div className="border-t border-grid py-2">
              <div className="text-[10px] tracking-[0.18em] text-dim">
                SEALED POSITIONS
              </div>
              <div className="mt-1 text-neutral-300">
                {selectedControlPoint?.challengeBidCount ?? 0}
              </div>
            </div>
            <div className="border-t border-grid py-2 text-[9px] leading-relaxed tracking-[0.12em] text-dim">
              THE WINNING MAXIMUM STAYS HIDDEN. AFTER CLOSE, THE AUTHORIZED
              SETTLER PUBLISHES ONLY THE RUNNER-UP AND CLEARING PRICES.
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
            !selectedControlPoint.stale &&
            !selectedControlPoint.needsSync ? (
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
