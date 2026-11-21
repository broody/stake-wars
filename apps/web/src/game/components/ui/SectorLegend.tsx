import { useSectors } from '../../contexts/SectorContext';
import { useWallet } from '../../contexts/WalletContext';
import { SECTOR_COUNT } from '../../utils/sectorGeometry';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';
import { Button, panelStyles } from '../../../ui';

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
      <span className="min-w-0">{label}</span>
      <span className="tabular-nums text-fg-secondary">{value}</span>
    </div>
  );
}

export function SectorLegend() {
  const { isConnected } = useWallet();
  const {
    isImageUploadMode,
    occupiedSectorIds,
    ownedSectorIds,
    opponentSectorIds,
    isSectorIndexLoading,
    sectorIndexError,
    refreshSectorIndex,
  } = useSectors();

  if (isImageUploadMode) return null;

  const neutralCount = SECTOR_COUNT - occupiedSectorIds.length;

  return (
    <section
      aria-label="Sector map legend"
      className={panelStyles(
        'floating',
        'pointer-events-auto absolute left-4 top-20 w-48 px-3 py-2.5 font-mono text-label text-fg-subtle'
      )}
    >
      <header className="mb-2 flex items-center justify-between border-b border-line pb-2">
        <span className="text-fg-secondary">SECTORS</span>
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
              ? 'bg-warning'
              : isSectorIndexLoading
                ? 'animate-pulse bg-fg-subtle'
                : 'bg-fg'
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
            value={ownedSectorIds.length}
          />
        ) : null}
        <LegendRow
          color={SECTOR_COLORS.opponent}
          label={isConnected ? 'OTHER PLAYERS' : 'CLAIMED'}
          value={opponentSectorIds.length}
        />
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
        <div className="mt-2 border-t border-line pt-2">
          <Button
            variant="ghost"
            tone="warning"
            size="sm"
            fullWidth
            onClick={refreshSectorIndex}
            className="min-h-0 justify-start px-0 py-0 text-left"
          >
            INDEX UNAVAILABLE · RETRY
          </Button>
        </div>
      )}
    </section>
  );
}
