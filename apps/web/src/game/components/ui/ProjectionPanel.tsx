import { useControlPoints } from '../../contexts/ControlPointContext';

export function ProjectionPanel() {
  const {
    mode,
    projectionControlPointIds,
    projectionLoadingId,
    projectionError,
    toggleProjectionControlPoint,
    clearProjectionSelection,
  } = useControlPoints();

  if (mode !== 'projection') {
    return null;
  }

  return (
    <aside className="pointer-events-auto absolute left-3 right-3 top-20 border border-neutral-600 bg-black/90 font-mono text-xs text-fg shadow-[8px_8px_0_rgba(255,255,255,0.06)] backdrop-blur-sm sm:left-auto sm:right-4 sm:w-[22rem]">
      <header className="border-b border-neutral-600 px-4 py-3">
        <div className="text-[9px] tracking-[0.24em] text-dim">
          IMAGE PROJECTION
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-4">
          <span className="text-base tracking-[0.12em]">
            SELECT CONTROL POINTS
          </span>
          <span className="text-[10px] tracking-wider text-neutral-500">
            {projectionControlPointIds.length} VERIFIED
          </span>
        </div>
      </header>

      <div className="px-4 py-3">
        <p className="leading-relaxed text-neutral-400">
          Select Control Points you currently control. Ownership is verified
          on-chain before a point joins the projection group.
        </p>

        {projectionLoadingId !== null && (
          <div className="mt-3 flex items-center gap-3 border-t border-grid pt-3 text-dim">
            <span className="h-2 w-2 animate-pulse bg-amber-400" />
            VERIFYING CP-{projectionLoadingId.toString().padStart(4, '0')}…
          </div>
        )}

        {projectionError && (
          <div className="mt-3 border border-amber-500/50 px-3 py-2 leading-relaxed text-amber-400">
            {projectionError}
          </div>
        )}

        {projectionControlPointIds.length === 0 ? (
          <div className="mt-4 border border-dashed border-neutral-800 px-3 py-5 text-center text-[10px] tracking-[0.16em] text-neutral-600">
            NO CONTROL POINTS SELECTED
          </div>
        ) : (
          <div className="mt-4">
            <div className="mb-2 text-[9px] tracking-[0.2em] text-dim">
              PROJECTION GROUP
            </div>
            <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
              {projectionControlPointIds.map((controlPointId) => (
                <button
                  key={controlPointId}
                  type="button"
                  onClick={() =>
                    void toggleProjectionControlPoint(controlPointId)
                  }
                  className="border border-neutral-600 px-2 py-1.5 text-[10px] tracking-wider text-neutral-300 transition-colors hover:border-white hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
                  aria-label={`Remove Control Point ${controlPointId} from projection`}
                >
                  CP-{controlPointId.toString().padStart(4, '0')} ×
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={clearProjectionSelection}
              className="mt-4 text-[9px] tracking-[0.2em] text-neutral-500 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              CLEAR PROJECTION GROUP
            </button>
          </div>
        )}

        <div className="mt-4 border-t border-grid pt-3 text-[9px] leading-relaxed tracking-[0.12em] text-neutral-600">
          IMAGE PREPARATION AND UPLOAD WILL BE ADDED IN THE NEXT SLICE.
        </div>
      </div>
    </aside>
  );
}
