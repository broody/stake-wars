import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  OwnershipGlobe,
  type GlobePerformanceMetrics,
  type OwnershipReliefMode,
} from '../components/3d/OwnershipGlobe';
import {
  OWNERSHIP_SCENARIOS,
  STAKE_RELIEF_CAP_STRK,
  type OwnershipScenario,
} from '../utils/ownershipScenarios';
import { SECTOR_COUNT } from '../utils/sectorGeometry';
import {
  EXAMPLE_IMAGE_ATLAS_GPU_BYTES,
  EXAMPLE_IMAGE_ATLAS_HEIGHT,
  EXAMPLE_IMAGE_ATLAS_WIDTH,
  EXAMPLE_IMAGE_DETAIL_SIZE,
  selectExampleImageSectorIds,
} from '../utils/exampleImageAtlas';
import { useTransactionToast } from '../contexts/TransactionToastContext';

const IMAGE_COUNT_OPTIONS = [0, 64, 256, 1_000, SECTOR_COUNT] as const;
const WAVE_SCENARIOS = OWNERSHIP_SCENARIOS.filter(
  (scenario) => scenario.kind === 'wave'
);
const DISTRIBUTION_SCENARIOS = OWNERSHIP_SCENARIOS.filter(
  (scenario) => scenario.kind === 'distribution'
);
const ignoreHoveredSector: (sectorId: number | null) => void = () => undefined;

type ToastExampleState = 'submitting' | 'confirmed' | 'failed';

function formatMebibytes(bytes: number): string {
  return `${Math.round(bytes / 1_048_576)} MIB`;
}

function formatOccupancy(scenario: OwnershipScenario): string {
  const percentage = (scenario.occupiedSectorCount / SECTOR_COUNT) * 100;
  return `${percentage < 10 ? percentage.toFixed(1) : Math.round(percentage)}%`;
}

function OwnershipScenarioCard({
  scenario,
  reliefMode,
  imageSectorIds,
  flipped,
}: {
  scenario: OwnershipScenario;
  reliefMode: OwnershipReliefMode;
  imageSectorIds: readonly number[];
  flipped: boolean;
}) {
  const [markedOwner, setMarkedOwner] = useState(0);
  const [performance, setPerformance] =
    useState<GlobePerformanceMetrics | null>(null);
  const [selectedDetailSectorId, setSelectedDetailSectorId] = useState<
    number | null
  >(null);
  const imageSectorIdSet = useMemo(
    () => new Set(imageSectorIds),
    [imageSectorIds]
  );
  const activeSelectedDetailSectorId =
    selectedDetailSectorId !== null &&
    imageSectorIdSet.has(selectedDetailSectorId)
      ? selectedDetailSectorId
      : null;

  useEffect(() => {
    if (
      selectedDetailSectorId !== null &&
      !imageSectorIdSet.has(selectedDetailSectorId)
    ) {
      setSelectedDetailSectorId(null);
    }
  }, [imageSectorIdSet, selectedDetailSectorId]);
  const validMarkedOwner =
    markedOwner >= 0 && markedOwner < scenario.ownerCount ? markedOwner : 0;
  const selectSector = useCallback(
    (sectorId: number, owner: number) => {
      if (owner >= 0) setMarkedOwner(owner);
      setSelectedDetailSectorId(
        imageSectorIdSet.has(sectorId) ? sectorId : null
      );
    },
    [imageSectorIdSet]
  );

  return (
    <article className="overflow-hidden border border-neutral-700 bg-[#050505]">
      <header className="grid gap-4 border-b border-grid px-4 py-3 sm:grid-cols-[1fr_auto]">
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
        <div className="sm:text-right">
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:flex sm:gap-5">
            <div>
              <div className="text-xl tabular-nums text-fg">
                {scenario.occupiedSectorCount.toLocaleString()}
              </div>
              <div className="text-[8px] tracking-[0.16em] text-neutral-500">
                OCCUPIED
              </div>
            </div>
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
                {scenario.contestedSectorIds.length}
              </div>
              <div className="text-[8px] tracking-[0.16em] text-neutral-500">
                CONTESTED
              </div>
            </div>
            <div>
              <div className="text-xl tabular-nums text-fg">
                {imageSectorIds.length.toLocaleString()}
              </div>
              <div className="text-[8px] tracking-[0.16em] text-neutral-500">
                IMAGES
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
          imageSectorIds={imageSectorIds}
          selectedDetailSectorId={activeSelectedDetailSectorId}
          flipped={flipped}
          onPerformanceSample={setPerformance}
          onHoverSector={ignoreHoveredSector}
          onSelectSector={selectSector}
        />
      </div>

      <dl className="grid grid-cols-2 gap-px border-t border-grid bg-grid sm:grid-cols-4 lg:grid-cols-7">
        {[
          ['FPS', performance?.fps ?? '—'],
          ['DRAW CALLS', performance?.drawCalls ?? '—'],
          ['TRIANGLES', performance?.triangles.toLocaleString() ?? '—'],
          ['GPU TEXTURES', performance?.textures ?? '—'],
          ['CAMERA', performance ? performance.cameraDistance.toFixed(1) : '—'],
          ['IMAGE ATLAS', imageSectorIds.length > 0 ? '1 CALL' : 'OFF'],
          [
            'DETAIL TIER',
            performance && performance.textures > 1
              ? `${EXAMPLE_IMAGE_DETAIL_SIZE} PX`
              : 'OFF',
          ],
        ].map(([label, value]) => (
          <div key={label} className="bg-[#050505] px-4 py-3 text-center">
            <dt className="text-[8px] tracking-[0.14em] text-neutral-600">
              {label}
            </dt>
            <dd className="mt-1 text-[10px] tabular-nums text-neutral-300">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function CoreLab() {
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    () => OWNERSHIP_SCENARIOS[0]?.id ?? ''
  );
  const [reliefMode, setReliefMode] = useState<OwnershipReliefMode>('flat');
  const [requestedImageCount, setRequestedImageCount] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const toastExampleId = useRef(0);
  const { notifySubmitting, notifyConfirmed, notifyFailed } =
    useTransactionToast();
  const showToastExample = useCallback(
    (state: ToastExampleState, label: string) => {
      toastExampleId.current += 1;
      const hash = `0x${toastExampleId.current.toString(16).padStart(64, '0')}`;
      notifySubmitting(hash, label);
      if (state === 'confirmed') notifyConfirmed(hash);
      if (state === 'failed') {
        notifyFailed(hash, 'Transaction reverted before it reached the Core.');
      }
    },
    [notifyConfirmed, notifyFailed, notifySubmitting]
  );
  const showToastStackExample = useCallback(() => {
    showToastExample('confirmed', 'CAPTURE');
    showToastExample('confirmed', 'STAKE');
    showToastExample('failed', 'YIELD CLAIM');
    showToastExample('confirmed', 'ARTWORK');
    showToastExample('submitting', 'UNSTAKE');
    showToastExample('confirmed', 'REWARD CLAIM');
    showToastExample('failed', 'BATCH CAPTURE');
    showToastExample('submitting', 'SECTOR FLIP');
  }, [showToastExample]);
  const selectedScenario =
    OWNERSHIP_SCENARIOS.find(
      (scenario) => scenario.id === selectedScenarioId
    ) ?? OWNERSHIP_SCENARIOS[0];
  const imageSectorIds = useMemo(
    () =>
      selectedScenario
        ? selectExampleImageSectorIds(
            selectedScenario.ownerBySector,
            requestedImageCount,
            selectedScenario.seed
          )
        : [],
    [requestedImageCount, selectedScenario]
  );

  if (!selectedScenario) return null;

  return (
    <div className="activity-scrollbar h-full overflow-y-auto bg-black px-3 pb-12 pt-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="grid gap-6 border-l-2 border-amber-300 pl-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-[9px] tracking-[0.24em] text-amber-300">
              RENDER + STATE EXPERIMENTS
            </p>
            <h1 className="mt-2 text-2xl tracking-[0.16em] text-fg sm:text-3xl">
              CORE SYSTEMS LAB
            </h1>
            <p className="mt-3 max-w-3xl text-[10px] leading-6 tracking-[0.08em] text-neutral-500">
              Every globe contains all 2,000 Sectors. Drag to rotate, scroll to
              zoom, hover to inspect a tile, and select a tile to mark its owner
              across the complete Core. Red stripes mark active contests; black
              regions are unoccupied. Example images use one atlas-backed draw
              call; these procedural samples isolate render cost from future
              network and decode cost. Select an imaged tile, or zoom close and
              hover, to add one {EXAMPLE_IMAGE_DETAIL_SIZE}px detail texture.
              Stake relief has a hard {STAKE_RELIEF_CAP_STRK.toLocaleString()}{' '}
              STRK height cap. Use the wave-load scenarios and Flip Preview to
              compare the same transition across different occupied Sector
              counts.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[9px] tracking-[0.12em]">
            <span className="text-neutral-600">OCCUPANCY</span>
            <span className="text-right text-fg">
              {formatOccupancy(selectedScenario)}
            </span>
            <span className="text-neutral-600">SECTORS</span>
            <span className="text-right text-fg">
              {SECTOR_COUNT.toLocaleString()}
            </span>
            <span className="text-neutral-600">UNOCCUPIED</span>
            <span className="text-right text-neutral-500">
              {selectedScenario.unoccupiedSectorIds.length}
            </span>
            <span className="text-neutral-600">MARKED OWNER</span>
            <span className="text-right text-amber-300">LIGHT GOLD</span>
            <span className="text-neutral-600">CONTESTED</span>
            <span className="text-right text-red-500">RED STRIPES</span>
            <span className="text-neutral-600">IMAGES</span>
            <span className="text-right text-fg">
              {imageSectorIds.length.toLocaleString()}
            </span>
            <span className="text-neutral-600">ATLAS</span>
            <span className="text-right text-fg">
              {EXAMPLE_IMAGE_ATLAS_WIDTH} × {EXAMPLE_IMAGE_ATLAS_HEIGHT}
            </span>
            <span className="text-neutral-600">ATLAS RGBA</span>
            <span className="text-right text-fg">
              {formatMebibytes(EXAMPLE_IMAGE_ATLAS_GPU_BYTES)}
            </span>
            <span className="text-neutral-600">DETAIL TIER</span>
            <span className="text-right text-fg">
              {EXAMPLE_IMAGE_DETAIL_SIZE} PX · 1 MAX
            </span>
            <span className="text-neutral-600">RELIEF</span>
            <span className="text-right text-fg">
              {reliefMode === 'stake' ? 'STAKED STRK' : 'FLAT'}
            </span>
            {reliefMode === 'stake' ? (
              <>
                <span className="text-neutral-600">SCALE</span>
                <span className="text-right text-fg">LOGARITHMIC</span>
                <span className="text-neutral-600">HEIGHT CAP</span>
                <span className="text-right text-fg">
                  {STAKE_RELIEF_CAP_STRK.toLocaleString()} STRK
                </span>
              </>
            ) : null}
          </div>
        </header>

        <div className="mt-8 max-w-[1100px]">
          <section className="mb-4 grid border border-neutral-700 bg-[#050505] lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="border-b border-grid px-4 py-4 lg:border-b-0 lg:border-r">
              <div className="flex items-center gap-3">
                <h2 className="text-[10px] tracking-[0.2em] text-fg">
                  TRANSACTION TOASTS
                </h2>
                <span className="border border-amber-300/50 px-1.5 py-0.5 text-[8px] tracking-[0.14em] text-amber-300">
                  INTERACTION LAB
                </span>
              </div>
              <p className="mt-2 max-w-xl text-[9px] leading-relaxed tracking-[0.08em] text-neutral-500">
                Trigger individual states or load a full stack. The newest
                transaction stays in front; hover the bottom-right stack or move
                keyboard focus into it, then scroll to inspect its history.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-grid sm:grid-cols-4 lg:min-w-[520px]">
              <button
                type="button"
                onClick={() => showToastExample('submitting', 'CAPTURE')}
                className="bg-black px-4 py-3 text-left text-[9px] tracking-[0.14em] text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:z-10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-inset focus-visible:outline-white"
              >
                SUBMITTING
              </button>
              <button
                type="button"
                onClick={() => showToastExample('confirmed', 'STAKE')}
                className="bg-black px-4 py-3 text-left text-[9px] tracking-[0.14em] text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:z-10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-inset focus-visible:outline-white"
              >
                CONFIRMED
              </button>
              <button
                type="button"
                onClick={() => showToastExample('failed', 'YIELD CLAIM')}
                className="bg-black px-4 py-3 text-left text-[9px] tracking-[0.14em] text-amber-400 transition-colors hover:bg-neutral-900 hover:text-amber-300 focus-visible:z-10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-inset focus-visible:outline-white"
              >
                FAILED
              </button>
              <button
                type="button"
                onClick={showToastStackExample}
                className="bg-amber-300 px-4 py-3 text-left text-[9px] tracking-[0.14em] text-black transition-colors hover:bg-amber-200 focus-visible:z-10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-inset focus-visible:outline-white"
              >
                LOAD STACK ×8
              </button>
            </div>
          </section>

          <div className="mb-4 grid gap-px border border-neutral-700 bg-grid lg:grid-cols-4">
            <label className="grid gap-2 bg-[#050505] px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-5">
              <span className="text-[9px] tracking-[0.18em] text-neutral-500">
                SCENARIO
              </span>
              <select
                value={selectedScenario.id}
                onChange={(event) => {
                  setSelectedScenarioId(event.target.value);
                  setFlipped(false);
                }}
                className="min-w-0 border border-neutral-600 bg-black px-3 py-2 text-[10px] tracking-[0.12em] text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <optgroup label="FLIP WAVE LOAD">
                  {WAVE_SCENARIOS.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.occupiedSectorCount.toLocaleString()} OCCUPIED ·{' '}
                      {scenario.ownerCount} OPERATORS
                    </option>
                  ))}
                </optgroup>
                <optgroup label="OWNERSHIP DISTRIBUTIONS">
                  {DISTRIBUTION_SCENARIOS.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.title} · {scenario.ownerCount} OPERATORS ·{' '}
                      {scenario.distribution.toUpperCase()}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>

            <div className="grid gap-2 bg-[#050505] px-4 py-3">
              <span className="text-[9px] tracking-[0.18em] text-neutral-500">
                FLIP PREVIEW
              </span>
              <button
                type="button"
                onClick={() => setFlipped((current) => !current)}
                aria-pressed={flipped}
                className="border border-amber-300 bg-amber-300 px-3 py-2 text-left text-[10px] tracking-[0.12em] text-black hover:bg-amber-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {flipped ? 'RETURN TO CONTROL' : 'FLIP TO PROJECTION'}
              </button>
              <span className="text-[8px] leading-relaxed tracking-[0.1em] text-neutral-600">
                EACH TRIGGER PICKS A NEW EXTERNAL ORIGIN
              </span>
            </div>

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
            </div>

            <label className="grid gap-2 bg-[#050505] px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-5 lg:grid-cols-1 lg:items-stretch">
              <span className="text-[9px] tracking-[0.18em] text-neutral-500">
                EXAMPLE IMAGES
              </span>
              <select
                value={requestedImageCount}
                onChange={(event) =>
                  setRequestedImageCount(Number(event.target.value))
                }
                className="min-w-0 border border-neutral-600 bg-black px-3 py-2 text-[10px] tracking-[0.12em] text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {IMAGE_COUNT_OPTIONS.map((count) => (
                  <option key={count} value={count}>
                    {count === 0
                      ? 'NONE'
                      : count === SECTOR_COUNT
                        ? `ALL OCCUPIED · ${(
                            SECTOR_COUNT -
                            selectedScenario.unoccupiedSectorIds.length
                          ).toLocaleString()}`
                        : `${count.toLocaleString()} IMAGES`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <OwnershipScenarioCard
            key={`${selectedScenario.id}-${reliefMode}`}
            scenario={selectedScenario}
            reliefMode={reliefMode}
            imageSectorIds={imageSectorIds}
            flipped={flipped}
          />
        </div>
      </div>
    </div>
  );
}
