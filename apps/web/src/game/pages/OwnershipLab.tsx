import { useCallback, useMemo, useState } from 'react';
import {
  OwnershipGlobe,
  type OwnershipReliefMode,
} from '../components/3d/OwnershipGlobe';
import {
  OWNERSHIP_SCENARIOS,
  STAKE_RELIEF_CAP_STRK,
  type OwnershipScenario,
} from '../utils/ownershipScenarios';
import { CONTROL_POINT_COUNT } from '../utils/controlPointGeometry';
import { shortAddress } from '../utils/format';

function scenarioStats(scenario: OwnershipScenario): {
  largest: number;
  median: number;
  smallest: number;
} {
  const sorted = [...scenario.counts].sort((left, right) => left - right);
  return {
    largest: sorted[sorted.length - 1],
    median: sorted[Math.floor(sorted.length / 2)],
    smallest: sorted[0],
  };
}

function OwnershipScenarioCard({
  scenario,
  reliefMode,
  logarithmicScale,
}: {
  scenario: OwnershipScenario;
  reliefMode: OwnershipReliefMode;
  logarithmicScale: boolean;
}) {
  const [markedOwner, setMarkedOwner] = useState(0);
  const [hoveredControlPointId, setHoveredControlPointId] = useState<
    number | null
  >(null);
  const validMarkedOwner =
    markedOwner >= 0 && markedOwner < scenario.ownerCount ? markedOwner : 0;
  const stats = useMemo(() => scenarioStats(scenario), [scenario]);
  const hoveredAssignment =
    hoveredControlPointId === null ||
    hoveredControlPointId < 0 ||
    hoveredControlPointId >= scenario.ownerByControlPoint.length
      ? null
      : scenario.ownerByControlPoint[hoveredControlPointId];
  const hoveredOwner =
    hoveredAssignment !== null && hoveredAssignment >= 0
      ? hoveredAssignment
      : null;
  const isHoveredUnoccupied = hoveredAssignment === -1;
  const inspectedOwner = hoveredOwner ?? validMarkedOwner;
  const inspectedAddress = scenario.ownerAddresses[inspectedOwner];
  const inspectedCount = scenario.counts[inspectedOwner];
  const inspectedStake = scenario.stakedStrkByOwner[inspectedOwner] ?? 0;
  const selectOwner = useCallback((owner: number) => {
    setMarkedOwner(owner);
    setHoveredControlPointId(null);
  }, []);

  const cycleOwner = (direction: -1 | 1) => {
    setMarkedOwner(
      (current) =>
        (current + direction + scenario.ownerCount) % scenario.ownerCount
    );
    setHoveredControlPointId(null);
  };

  return (
    <article className="overflow-hidden border border-neutral-700 bg-[#050505]">
      <header className="grid grid-cols-[1fr_auto] gap-4 border-b border-grid px-4 py-3">
        <div>
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-semibold tracking-[0.2em] text-fg">
              {scenario.title}
            </h2>
            <span className="text-[9px] tracking-[0.14em] text-neutral-500">
              {scenario.distribution.toUpperCase()}
            </span>
          </div>
          <p className="mt-1 max-w-md text-[9px] leading-relaxed tracking-[0.08em] text-neutral-500">
            {scenario.description}
          </p>
        </div>
        <div className="text-right">
          <div className="flex gap-5">
            <div>
              <div className="text-xl tabular-nums text-fg">
                {scenario.ownerCount}
              </div>
              <div className="text-[8px] tracking-[0.16em] text-neutral-500">
                OPERATORS
              </div>
            </div>
            <div>
              <div className="text-xl tabular-nums text-red-500">
                {scenario.contestedControlPointIds.length}
              </div>
              <div className="text-[8px] tracking-[0.16em] text-neutral-500">
                CONTESTED
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="h-[360px] border-b border-grid sm:h-[420px]">
        <OwnershipGlobe
          scenario={scenario}
          markedOwner={validMarkedOwner}
          reliefMode={reliefMode}
          logarithmicScale={logarithmicScale}
          onHoverControlPoint={setHoveredControlPointId}
          onSelectOwner={selectOwner}
        />
      </div>

      <div className="grid gap-px bg-grid sm:grid-cols-[1.45fr_1fr]">
        <section className="bg-[#050505] px-4 py-3" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => cycleOwner(-1)}
              className="border border-neutral-700 px-2 py-1 text-[10px] text-neutral-400 hover:border-white hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label="Mark previous owner"
            >
              ←
            </button>
            <div className="min-w-0 flex-1 text-center">
              <div className="text-[8px] tracking-[0.18em] text-amber-300">
                {isHoveredUnoccupied
                  ? 'TILE STATUS'
                  : hoveredOwner === null
                    ? 'MARKED OWNER'
                    : 'TILE OWNER'}
              </div>
              <div className="mt-1 truncate text-[10px] tracking-[0.1em] text-fg">
                {isHoveredUnoccupied ? (
                  'UNOCCUPIED'
                ) : (
                  <>
                    OP-{String(inspectedOwner + 1).padStart(3, '0')} ·{' '}
                    {shortAddress(inspectedAddress)}
                  </>
                )}
              </div>
              <div className="mt-1 text-[9px] tabular-nums text-neutral-500">
                {isHoveredUnoccupied
                  ? `CP-${String(hoveredControlPointId).padStart(4, '0')}`
                  : `${inspectedCount} CONTROL POINTS${
                      hoveredControlPointId === null
                        ? ''
                        : ` · CP-${String(hoveredControlPointId).padStart(4, '0')}`
                    }`}
              </div>
              {isHoveredUnoccupied ? null : (
                <div className="mt-1 text-[8px] tabular-nums tracking-[0.1em] text-neutral-600">
                  SIMULATED STAKE · {inspectedStake.toLocaleString()} STRK
                  {inspectedStake > STAKE_RELIEF_CAP_STRK
                    ? ' · HEIGHT CAPPED'
                    : ''}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => cycleOwner(1)}
              className="border border-neutral-700 px-2 py-1 text-[10px] text-neutral-400 hover:border-white hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label="Mark next owner"
            >
              →
            </button>
          </div>
        </section>

        <dl className="grid grid-cols-3 bg-[#050505] px-4 py-3 text-center">
          {[
            ['MAX', stats.largest],
            ['MED', stats.median],
            ['MIN', stats.smallest],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[8px] tracking-[0.14em] text-neutral-600">
                {label}
              </dt>
              <dd className="mt-1 text-[10px] tabular-nums text-neutral-300">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  );
}

export function OwnershipLab() {
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    () => OWNERSHIP_SCENARIOS[0]?.id ?? ''
  );
  const [reliefMode, setReliefMode] = useState<OwnershipReliefMode>('flat');
  const [logarithmicScale, setLogarithmicScale] = useState(true);
  const selectedScenario =
    OWNERSHIP_SCENARIOS.find(
      (scenario) => scenario.id === selectedScenarioId
    ) ?? OWNERSHIP_SCENARIOS[0];

  if (!selectedScenario) return null;

  return (
    <div className="activity-scrollbar h-full overflow-y-auto bg-black px-3 pb-12 pt-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="grid gap-6 border-l-2 border-amber-300 pl-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-[9px] tracking-[0.24em] text-amber-300">
              VISUAL REVIEW ENDPOINT
            </p>
            <h1 className="mt-2 text-2xl tracking-[0.16em] text-fg sm:text-3xl">
              OWNERSHIP DENSITY LAB
            </h1>
            <p className="mt-3 max-w-3xl text-[10px] leading-6 tracking-[0.08em] text-neutral-500">
              Every globe contains all 2,000 Control Points. Drag to rotate,
              scroll to zoom, hover to inspect a tile, and select a tile to mark
              its owner across the complete Core. Red stripes mark active
              contests; black regions are unoccupied. Stake relief has a hard{' '}
              {STAKE_RELIEF_CAP_STRK.toLocaleString()} STRK height cap.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[9px] tracking-[0.12em]">
            <span className="text-neutral-600">OCCUPANCY</span>
            <span className="text-right text-fg">
              {Math.round(
                ((CONTROL_POINT_COUNT -
                  selectedScenario.unoccupiedControlPointIds.length) /
                  CONTROL_POINT_COUNT) *
                  100
              )}
              %
            </span>
            <span className="text-neutral-600">CONTROL POINTS</span>
            <span className="text-right text-fg">
              {CONTROL_POINT_COUNT.toLocaleString()}
            </span>
            <span className="text-neutral-600">UNOCCUPIED</span>
            <span className="text-right text-neutral-500">
              {selectedScenario.unoccupiedControlPointIds.length}
            </span>
            <span className="text-neutral-600">MARKED OWNER</span>
            <span className="text-right text-amber-300">LIGHT GOLD</span>
            <span className="text-neutral-600">CONTESTED</span>
            <span className="text-right text-red-500">RED STRIPES</span>
            <span className="text-neutral-600">RELIEF</span>
            <span className="text-right text-fg">
              {reliefMode === 'stake' ? 'STAKED STRK' : 'FLAT'}
            </span>
            {reliefMode === 'stake' ? (
              <>
                <span className="text-neutral-600">SCALE</span>
                <span className="text-right text-fg">
                  {logarithmicScale ? 'LOGARITHMIC' : 'LINEAR'}
                </span>
                <span className="text-neutral-600">HEIGHT CAP</span>
                <span className="text-right text-fg">
                  {STAKE_RELIEF_CAP_STRK.toLocaleString()} STRK
                </span>
              </>
            ) : null}
          </div>
        </header>

        <div className="mt-8 max-w-[1100px]">
          <div className="mb-4 grid gap-px border border-neutral-700 bg-grid sm:grid-cols-2">
            <label className="grid gap-2 bg-[#050505] px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-5">
              <span className="text-[9px] tracking-[0.18em] text-neutral-500">
                SCENARIO
              </span>
              <select
                value={selectedScenario.id}
                onChange={(event) => setSelectedScenarioId(event.target.value)}
                className="min-w-0 border border-neutral-600 bg-black px-3 py-2 text-[10px] tracking-[0.12em] text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {OWNERSHIP_SCENARIOS.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.title} · {scenario.ownerCount} OPERATORS ·{' '}
                    {scenario.distribution.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 bg-[#050505] px-4 py-3">
              <label className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-5">
                <span className="text-[9px] tracking-[0.18em] text-neutral-500">
                  RELIEF
                </span>
                <select
                  value={reliefMode}
                  onChange={(event) =>
                    setReliefMode(event.target.value as OwnershipReliefMode)
                  }
                  className="min-w-0 border border-neutral-600 bg-black px-3 py-2 text-[10px] tracking-[0.12em] text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <option value="flat">FLAT OWNERSHIP</option>
                  <option value="stake">STAKED STRK · CAPPED</option>
                </select>
              </label>

              {reliefMode === 'stake' ? (
                <label className="flex cursor-pointer items-center justify-end gap-3 border-t border-grid pt-3 text-[9px] tracking-[0.16em] text-neutral-400">
                  <span>LOGARITHMIC SCALE</span>
                  <input
                    type="checkbox"
                    checked={logarithmicScale}
                    onChange={(event) =>
                      setLogarithmicScale(event.target.checked)
                    }
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="grid size-4 place-items-center border border-neutral-500 bg-black text-[10px] text-black peer-checked:border-amber-300 peer-checked:bg-amber-300 peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white"
                  >
                    {logarithmicScale ? '✓' : ''}
                  </span>
                </label>
              ) : null}
            </div>
          </div>

          <OwnershipScenarioCard
            key={`${selectedScenario.id}-${reliefMode}`}
            scenario={selectedScenario}
            reliefMode={reliefMode}
            logarithmicScale={logarithmicScale}
          />
        </div>
      </div>
    </div>
  );
}
