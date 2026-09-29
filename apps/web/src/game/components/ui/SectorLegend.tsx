import { useEffect, useState } from 'react';
import { useSectors } from '../../contexts/SectorContext';
import { useWallet } from '../../contexts/WalletContext';
import { SECTOR_COUNT } from '../../utils/sectorGeometry';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';

interface LegendRowProps {
  color: string;
  label: string;
  value: string | number;
  outline?: boolean;
}

function LegendRow({ color, label, value, outline = false }: LegendRowProps) {
  return (
    <div className="grid grid-cols-[12px_1fr_auto] items-center gap-2">
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 rotate-45"
        style={{
          backgroundColor: outline ? 'transparent' : color,
          border: `1px solid ${color}`,
          boxShadow: outline ? `0 0 0 1px ${color}33` : undefined,
        }}
      />
      <span>{label}</span>
      <span className="text-neutral-300">{value}</span>
    </div>
  );
}

const INSPECT_HINT_KEY = 'stakewars:hint:inspect-sector';
const MULTI_SELECT_HINT_KEY = 'stakewars:hint:multi-select';

function readHintDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function dismissHint(key: string) {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Hints are a convenience; failing to remember one only shows it again.
  }
}

/** A first-run hint that stays dismissed once the player has done the thing. */
function useFirstRunHint(key: string, completed: boolean): boolean {
  const [isDismissed, setDismissed] = useState(() => readHintDismissed(key));

  useEffect(() => {
    if (!completed || isDismissed) return;
    dismissHint(key);
    setDismissed(true);
  }, [completed, isDismissed, key]);

  return !isDismissed;
}

export function SectorLegend() {
  const { isConnected } = useWallet();
  const {
    isImageUploadMode,
    occupiedSectorIds,
    ownedSectorIds,
    opponentSectorIds,
    contestedSectorIds,
    isSectorIndexLoading,
    sectorIndexError,
    refreshSectorIndex,
    selectedSectorId,
    selectedSectorIds,
  } = useSectors();
  const showInspectHint = useFirstRunHint(
    INSPECT_HINT_KEY,
    selectedSectorId !== null
  );
  const showMultiSelectHint = useFirstRunHint(
    MULTI_SELECT_HINT_KEY,
    selectedSectorIds.length > 1
  );
  const contestedSectorIdSet = new Set(contestedSectorIds);
  const uncontestedOwnedCount = ownedSectorIds.filter(
    (sectorId) => !contestedSectorIdSet.has(sectorId)
  ).length;
  const uncontestedOpponentCount = opponentSectorIds.filter(
    (sectorId) => !contestedSectorIdSet.has(sectorId)
  ).length;

  if (isImageUploadMode) return null;

  const neutralCount = SECTOR_COUNT - occupiedSectorIds.length;

  return (
    <section
      aria-label="Sector map legend"
      className="pointer-events-auto absolute left-4 top-20 w-48 border border-neutral-800 bg-black/80 px-3 py-2.5 font-mono text-[9px] tracking-[0.14em] text-neutral-500 backdrop-blur-sm"
    >
      <header className="mb-2 flex items-center justify-between border-b border-neutral-800 pb-2">
        <span className="text-neutral-300">SECTORS</span>
        <span
          role="status"
          aria-label={
            sectorIndexError
              ? 'Torii Sector index unavailable'
              : isSectorIndexLoading
                ? 'Syncing Torii Sector index'
                : 'Torii Sector index synced'
          }
          className={`h-1.5 w-1.5 ${
            sectorIndexError
              ? 'bg-amber-400'
              : isSectorIndexLoading
                ? 'animate-pulse bg-neutral-500'
                : 'bg-white'
          }`}
          title={
            sectorIndexError
              ? sectorIndexError
              : isSectorIndexLoading
                ? 'Syncing the Torii Sector index'
                : 'Torii Sector index synced'
          }
        />
      </header>

      <div className="space-y-1.5">
        {isConnected ? (
          <LegendRow
            color={SECTOR_COLORS.owned}
            label="YOURS"
            value={uncontestedOwnedCount}
          />
        ) : null}
        <LegendRow
          color={SECTOR_COLORS.opponent}
          label={isConnected ? 'OTHER PLAYERS' : 'CLAIMED'}
          value={uncontestedOpponentCount}
        />
        {contestedSectorIds.length > 0 ? (
          <LegendRow
            color={SECTOR_COLORS.contested}
            label="UNDER CHALLENGE"
            value={contestedSectorIds.length}
          />
        ) : null}
        {neutralCount > 0 ? (
          <LegendRow
            color={SECTOR_COLORS.neutralGrid}
            label="UNOCCUPIED"
            value={neutralCount}
            outline
          />
        ) : null}
      </div>

      {showInspectHint || showMultiSelectHint ? (
        <div
          className={`mt-2 space-y-1 border-t border-neutral-800 pt-2 text-[9px] leading-relaxed tracking-[0.06em] text-neutral-400 ${
            // The multi-select hint alone is mouse-only; hide its divider too.
            showInspectHint ? '' : 'hidden [@media(pointer:fine)]:block'
          }`}
        >
          {showInspectHint ? <p>› CLICK A SECTOR TO INSPECT IT</p> : null}
          {showMultiSelectHint ? (
            <p className="hidden [@media(pointer:fine)]:block">
              › RIGHT-DRAG TO SELECT SEVERAL
            </p>
          ) : null}
        </div>
      ) : null}

      {sectorIndexError && (
        <button
          type="button"
          onClick={refreshSectorIndex}
          className="mt-2 w-full border-t border-neutral-800 pt-2 text-left text-amber-400 hover:text-amber-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          INDEX UNAVAILABLE · RETRY
        </button>
      )}
    </section>
  );
}
