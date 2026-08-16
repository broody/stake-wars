import { useControlPoints } from '../../contexts/ControlPointContext';
import { CONTROL_POINT_COUNT } from '../../utils/controlPointGeometry';
import { CONTROL_POINT_COLORS } from '../../utils/controlPointVisuals';

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

export function ControlPointLegend() {
  const {
    mode,
    occupiedControlPointIds,
    ownedControlPointIds,
    opponentControlPointIds,
    contestedControlPointIds,
    isControlPointIndexLoading,
    controlPointIndexError,
    refreshControlPointIndex,
  } = useControlPoints();
  const contestedControlPointIdSet = new Set(contestedControlPointIds);
  const uncontestedOwnedCount = ownedControlPointIds.filter(
    (controlPointId) => !contestedControlPointIdSet.has(controlPointId)
  ).length;
  const uncontestedOpponentCount = opponentControlPointIds.filter(
    (controlPointId) => !contestedControlPointIdSet.has(controlPointId)
  ).length;

  if (mode !== 'control') return null;

  const neutralCount = CONTROL_POINT_COUNT - occupiedControlPointIds.length;

  return (
    <section
      aria-label="Control Point map legend"
      className="pointer-events-auto absolute bottom-24 left-4 w-48 border border-neutral-800 bg-black/80 px-3 py-2.5 font-mono text-[9px] tracking-[0.14em] text-neutral-500 backdrop-blur-sm sm:bottom-5"
    >
      <header className="mb-2 flex items-center justify-between border-b border-neutral-800 pb-2">
        <span className="text-neutral-300">CONTROL POINTS</span>
        <span
          role="status"
          aria-label={
            controlPointIndexError
              ? 'Torii Control Point index offline'
              : isControlPointIndexLoading
                ? 'Syncing Torii Control Point index'
                : 'Torii Control Point index synced'
          }
          className={`h-1.5 w-1.5 ${
            controlPointIndexError
              ? 'bg-amber-400'
              : isControlPointIndexLoading
                ? 'animate-pulse bg-neutral-500'
                : 'bg-white'
          }`}
          title={
            controlPointIndexError
              ? controlPointIndexError
              : isControlPointIndexLoading
                ? 'Syncing the Torii Control Point index'
                : 'Torii Control Point index synced'
          }
        />
      </header>

      <div className="space-y-1.5">
        <LegendRow
          color={CONTROL_POINT_COLORS.owned}
          label="OWNED BY YOU"
          value={uncontestedOwnedCount}
        />
        <LegendRow
          color={CONTROL_POINT_COLORS.opponent}
          label="OTHER OPERATORS"
          value={uncontestedOpponentCount}
        />
        {contestedControlPointIds.length > 0 ? (
          <LegendRow
            color={CONTROL_POINT_COLORS.contested}
            label="CONTESTED"
            value={contestedControlPointIds.length}
          />
        ) : null}
        {neutralCount > 0 ? (
          <LegendRow
            color={CONTROL_POINT_COLORS.neutralGrid}
            label="UNOCCUPIED"
            value={neutralCount}
            outline
          />
        ) : null}
      </div>

      {controlPointIndexError && (
        <button
          type="button"
          onClick={refreshControlPointIndex}
          className="mt-2 w-full border-t border-neutral-800 pt-2 text-left text-amber-400 hover:text-amber-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          INDEX OFFLINE · RETRY
        </button>
      )}
    </section>
  );
}
