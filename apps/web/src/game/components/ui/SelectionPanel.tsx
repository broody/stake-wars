import { useEffect } from 'react';
import { useSectors } from '../../contexts/SectorContext';
import { useWallet } from '../../contexts/WalletContext';
import { addressesMatch, formatStrk, isZeroAddress } from '../../utils/format';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';
import { CaptureControl } from './CaptureControl';
import { BatchCaptureControl } from './BatchCaptureControl';
import { AddressLink } from './AddressLink';
import { groupBatchSectors } from '../../services/sectorBatch';
import { Button, Callout, Eyebrow, Panel, panelStyles } from '../../../ui';

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
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-tag text-fg-subtle"
        aria-hidden="true"
      >
        <span className="border-t border-line" />
        <span>OR</span>
        <span className="border-t border-line" />
      </div>
      <Panel tone="warning" className="mt-3 px-3 py-3">
        <header className="flex items-center justify-between gap-3">
          <Eyebrow tone="warning">DISPLAY ARTWORK</Eyebrow>
          <span className="text-tag text-warning-soft/60">IMAGE ACTION</span>
        </header>
        <p className="mt-2 text-caption text-fg-subtle">
          Publish one image across {sectorCount} selected Sector
          {sectorCount === 1 ? '' : 's'}.
        </p>
        <Button
          variant="solid"
          tone="warning"
          fullWidth
          onClick={onSelect}
          className="mt-3"
        >
          UPLOAD IMAGE{sectorCount === 1 ? '' : ` TO ${sectorCount} SECTORS`}
        </Button>
      </Panel>
    </div>
  );
}

export function SelectionPanel({ active = true }: { active?: boolean }) {
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
      !active ||
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
    active,
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
    <aside
      className={panelStyles(
        'floating',
        'activity-scrollbar pointer-events-auto absolute bottom-20 left-3 right-3 top-20 overflow-y-auto font-mono text-caption text-fg sm:bottom-auto sm:left-auto sm:right-4 sm:max-h-[calc(100vh-7rem)] sm:w-[22rem]'
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-line-strong px-4 py-3">
        <div className="min-w-0">
          <Eyebrow>
            {isMultiSelection
              ? `${selectedSectorIds.length} SECTORS SELECTED`
              : 'SELECTED SECTOR'}
          </Eyebrow>
          <div className="mt-1 text-heading">
            {isMultiSelection
              ? 'MULTIPLE'
              : `SECTOR-${selectedSectorId.toString().padStart(4, '0')}`}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => selectSector(null)}
          disabled={isSectorInteractionLocked}
          className="shrink-0"
          aria-label="Close Sector details"
        >
          ESC
        </Button>
      </header>

      <div className="px-4 py-3">
        {sectorError && (
          <Callout
            tone="warning"
            title="READ FAILED"
            className="my-3"
            action={
              <Button variant="outline" size="sm" onClick={refreshSector}>
                RETRY READ
              </Button>
            }
          >
            <p className="break-words text-fg-muted">{sectorError}</p>
          </Callout>
        )}

        {!isMultiSelection ? (
          <>
            <div className="border-b border-line pb-3">
              <Eyebrow>OWNER</Eyebrow>
              <div className="mt-1 flex min-w-0 items-baseline gap-2 tracking-caps text-fg-secondary">
                <span className="min-w-0 truncate">
                  {!selectedSector ? (
                    '---'
                  ) : neutral ? (
                    'NONE · UNCLAIMED'
                  ) : (
                    <AddressLink address={selectedSector.controller} />
                  )}
                </span>
                {controlledByOperator && (
                  <span
                    className="text-label"
                    style={{ color: SECTOR_COLORS.owned }}
                  >
                    (YOU)
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-6 py-2">
              <span className="text-label text-fg-subtle">DEFENSE</span>
              <span className="min-w-0 break-words text-right tabular-nums text-fg-secondary">
                {selectedSector ? (
                  <>
                    {formatStrk(selectedSector.captureForce, 18)}{' '}
                    <span className="text-label text-fg-subtle">FORCE</span>
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
                <Callout tone="warning" className="mt-3">
                  Its last owner no longer has the stake to hold it, so it can
                  be captured at the minimum.
                </Callout>
              )}

            {!isMultiSelection ? (
              <CaptureControl
                key={`action-${selectedSector.id}-${selectedSector.ownershipGeneration}`}
                sectors={[selectedSector]}
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
                  <Callout tone="warning" className="mt-3">
                    {batchGroups.individualOnly.length} selected Sector
                    {batchGroups.individualOnly.length === 1 ? '' : 's'} require
                    an individual takeover or capture and are excluded from
                    batch actions.
                  </Callout>
                )}
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}
