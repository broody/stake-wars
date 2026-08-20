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

export function SectorLegend() {
  const { isConnected } = useWallet();
  const {
    mode,
    occupiedSectorIds,
    ownedSectorIds,
    opponentSectorIds,
    contestedSectorIds,
    isSectorIndexLoading,
    sectorIndexError,
    refreshSectorIndex,
  } = useSectors();
  const contestedSectorIdSet = new Set(contestedSectorIds);
  const uncontestedOwnedCount = ownedSectorIds.filter(
    (sectorId) => !contestedSectorIdSet.has(sectorId)
  ).length;
  const uncontestedOpponentCount = opponentSectorIds.filter(
    (sectorId) => !contestedSectorIdSet.has(sectorId)
  ).length;

  if (!isConnected || mode !== 'control') return null;

  const neutralCount = SECTOR_COUNT - occupiedSectorIds.length;

  return (
    <section
      aria-label="Sector map legend"
      className="pointer-events-auto absolute bottom-24 left-4 w-48 border border-neutral-800 bg-black/80 px-3 py-2.5 font-mono text-[9px] tracking-[0.14em] text-neutral-500 backdrop-blur-sm sm:bottom-5"
    >
      <header className="mb-2 flex items-center justify-between border-b border-neutral-800 pb-2">
        <span className="text-neutral-300">SECTORS</span>
        <span
          role="status"
          aria-label={
            sectorIndexError
              ? 'Torii Sector index offline'
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
        <LegendRow
          color={SECTOR_COLORS.owned}
          label="OWNED BY YOU"
          value={uncontestedOwnedCount}
        />
        <LegendRow
          color={SECTOR_COLORS.opponent}
          label="OTHERS"
          value={uncontestedOpponentCount}
        />
        {contestedSectorIds.length > 0 ? (
          <LegendRow
            color={SECTOR_COLORS.contested}
            label="CONTESTED"
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

      {sectorIndexError && (
        <button
          type="button"
          onClick={refreshSectorIndex}
          className="mt-2 w-full border-t border-neutral-800 pt-2 text-left text-amber-400 hover:text-amber-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          INDEX OFFLINE · RETRY
        </button>
      )}
    </section>
  );
}
