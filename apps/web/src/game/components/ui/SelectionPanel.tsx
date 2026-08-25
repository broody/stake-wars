import { useEffect } from 'react';
import { useSectors } from '../../contexts/SectorContext';
import { useWallet } from '../../contexts/WalletContext';
import {
  addressesMatch,
  formatStrk,
  isZeroAddress,
  shortAddress,
} from '../../utils/format';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';
import { CaptureControl } from './CaptureControl';
import { BatchCaptureControl } from './BatchCaptureControl';
import { groupBatchSectors } from '../../services/sectorBatch';

function ImageUploadAction({
  sectorCount,
  onSelect,
}: {
  sectorCount: number;
  onSelect: () => void;
}) {
  return (
    <div className="mt-4">
      <div
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[8px] tracking-[0.2em] text-neutral-600"
        aria-hidden="true"
      >
        <span className="border-t border-neutral-800" />
        <span>OR</span>
        <span className="border-t border-neutral-800" />
      </div>
      <section className="mt-3 border border-amber-300/50 bg-amber-300/[0.04] px-3 py-3">
        <header className="flex items-center justify-between gap-3 text-[10px] tracking-[0.18em] text-amber-200">
          <span>DISPLAY ARTWORK</span>
          <span className="text-[8px] text-amber-300/60">IMAGE ACTION</span>
        </header>
        <p className="mt-2 text-[9px] leading-relaxed tracking-[0.08em] text-neutral-500">
          Publish one image across {sectorCount} selected Sector
          {sectorCount === 1 ? '' : 's'}.
        </p>
        <button
          type="button"
          onClick={onSelect}
          className="mt-3 w-full border border-amber-300 bg-amber-300 px-4 py-3 text-[10px] font-semibold tracking-[0.2em] text-black transition-colors hover:border-amber-200 hover:bg-amber-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          UPLOAD IMAGE{sectorCount === 1 ? '' : ` TO ${sectorCount} SECTORS`}
        </button>
      </section>
    </div>
  );
}

export function SelectionPanel() {
  const { address } = useWallet();
  const {
    selectedSectorId,
    selectedSectorIds,
    isImageUploadMode,
    selectedSector,
    selectedSectors,
    isSectorInteractionLocked,
    sectorError,
    beginImageUpload,
    selectSector,
    refreshSector,
  } = useSectors();

  useEffect(() => {
    if (
      selectedSectorId === null ||
      isImageUploadMode ||
      isSectorInteractionLocked
    ) {
      return;
    }

    const cancelSelection = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      selectSector(null);
    };

    window.addEventListener('keydown', cancelSelection);
    return () => window.removeEventListener('keydown', cancelSelection);
  }, [
    isImageUploadMode,
    isSectorInteractionLocked,
    selectSector,
    selectedSectorId,
  ]);

  if (isImageUploadMode || selectedSectorId === null) {
    return null;
  }

  const neutral =
    selectedSector !== null && isZeroAddress(selectedSector.controller);
  const controlledByOperator =
    Boolean(address) &&
    selectedSector !== null &&
    addressesMatch(selectedSector.controller, address ?? '0x0');
  const isMultiSelection = selectedSectorIds.length > 1;
  const batchGroups = groupBatchSectors(selectedSectors, address);
  const hasLoadedFullSelection =
    selectedSectors.length === selectedSectorIds.length;

  return (
    <aside className="activity-scrollbar pointer-events-auto absolute bottom-20 left-3 right-3 top-20 overflow-y-auto border border-neutral-600 bg-black/90 font-mono text-xs text-fg shadow-[8px_8px_0_rgba(255,255,255,0.06)] backdrop-blur-sm sm:bottom-auto sm:left-auto sm:right-4 sm:max-h-[calc(100vh-7rem)] sm:w-[22rem]">
      <header className="flex items-center justify-between border-b border-neutral-600 px-4 py-3">
        <div>
          <div className="text-[9px] tracking-[0.24em] text-dim">
            {isMultiSelection
              ? `${selectedSectorIds.length} SECTORS SELECTED`
              : 'SELECTED SECTOR'}
          </div>
          <div className="mt-1 text-base tracking-[0.12em]">
            {isMultiSelection
              ? 'MULTIPLE'
              : `SECTOR-${selectedSectorId.toString().padStart(4, '0')}`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => selectSector(null)}
          disabled={isSectorInteractionLocked}
          className="border border-grid px-2 py-1 text-dim transition-colors hover:border-neutral-500 hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-700"
          aria-label="Close Sector details"
        >
          ESC
        </button>
      </header>

      <div className="px-4 py-3">
        {sectorError && (
          <div className="py-3">
            <div className="text-amber-400">READ FAILED</div>
            <p className="mt-2 break-words leading-relaxed text-neutral-400">
              {sectorError}
            </p>
            <button
              type="button"
              onClick={refreshSector}
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
                <span title={selectedSector?.controller}>
                  {!selectedSector
                    ? '---'
                    : neutral
                      ? '—'
                      : shortAddress(selectedSector.controller)}
                </span>
                {controlledByOperator && (
                  <span
                    className="text-[9px] tracking-[0.16em]"
                    style={{ color: SECTOR_COLORS.owned }}
                  >
                    (YOU)
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-6 py-2">
              <span className="text-[10px] tracking-[0.18em] text-dim">
                CAPTURE FORCE
              </span>
              <span className="text-neutral-300">
                {selectedSector ? (
                  <>
                    {formatStrk(selectedSector.captureForce, 18)}{' '}
                    <span className="text-[10px] text-dim">FORCE</span>
                  </>
                ) : (
                  '---'
                )}
              </span>
            </div>
          </>
        ) : null}

        {selectedSector ? (
          <>
            {!isMultiSelection &&
              (selectedSector.stale || selectedSector.needsSync) && (
                <div className="mt-3 border border-amber-500/50 px-3 py-2 leading-relaxed text-amber-400">
                  This Sector has stale Operator state and must be synced.
                </div>
              )}

            {!isMultiSelection &&
            ((!selectedSector.stale && !selectedSector.needsSync) ||
              selectedSector.activeChallengeId !== 0n) ? (
              <CaptureControl
                key={`action-${selectedSector.id}-${selectedSector.activeChallengeId}`}
                sectors={[selectedSector]}
                intent={controlledByOperator ? 'fortify' : 'capture'}
              />
            ) : null}
            {!isMultiSelection &&
            controlledByOperator &&
            !selectedSector.stale &&
            !selectedSector.needsSync ? (
              <ImageUploadAction
                sectorCount={1}
                onSelect={() => beginImageUpload([selectedSector.id])}
              />
            ) : null}
            {isMultiSelection && hasLoadedFullSelection ? (
              <>
                {batchGroups.neutral.length > 0 && (
                  <BatchCaptureControl
                    key={`batch-capture-${batchGroups.neutral.map(({ id }) => id).join('-')}`}
                    sectors={batchGroups.neutral}
                    intent="capture"
                  />
                )}
                {batchGroups.owned.length > 0 && (
                  <>
                    <BatchCaptureControl
                      key={`batch-fortify-${batchGroups.owned.map(({ id }) => id).join('-')}`}
                      sectors={batchGroups.owned}
                      intent="fortify"
                    />
                    <ImageUploadAction
                      sectorCount={batchGroups.owned.length}
                      onSelect={() =>
                        beginImageUpload(
                          batchGroups.owned.map((sector) => sector.id)
                        )
                      }
                    />
                  </>
                )}
                {batchGroups.individualOnly.length > 0 && (
                  <div className="mt-3 border border-amber-500/50 px-3 py-2 leading-relaxed text-amber-400">
                    {batchGroups.individualOnly.length} selected Sector
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
