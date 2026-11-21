import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { useGLTF, useProgress, View } from '@react-three/drei';
import {
  Badge,
  Button,
  cn,
  Eyebrow,
  PageTitle,
  Panel,
  PanelSection,
  SectionHeading,
  SegmentedControl,
  Stat,
  StatGrid,
} from '../../ui';
import {
  ACTIONS,
  actionById,
  type ActionSpec,
  type Bearing,
  type BladeLevel,
  type Stance,
  type SwingOptions,
} from '../actions/actions';
import { ActionDriver } from '../actions/driver';
import { ActionStage } from '../actions/ActionStage';
import { StrikeLevelSelect } from '../components/ui/StrikeLevelSelect';
import { ActionTimeline } from '../actions/ActionTimeline';
import { authoredClip, authoredLoop, probeAction } from '../actions/timeline';
import { RATES, Transport, useTransport } from '../actions/transport';
import {
  newOrbit,
  VIEWS,
  type Overlays,
  type Source,
  type ViewId,
} from '../actions/view';
import { disposeCatalogGround } from '../catalog/ground';
import { VANGUARD } from '../utils/vanguardAnimation';

const SOURCES: { value: Source; label: string }[] = [
  { value: 'game', label: 'IN GAME' },
  { value: 'authored', label: 'AUTHORED CLIP' },
];
const STANCES: { value: Stance; label: string }[] = [
  { value: 'stand', label: 'STAND' },
  { value: 'walk', label: 'WALK' },
  { value: 'run', label: 'RUN' },
];
const BEARINGS: { value: Bearing; label: string }[] = [
  { value: 'left', label: 'LEFT' },
  { value: 'right', label: 'RIGHT' },
  { value: 'ahead', label: 'AHEAD' },
  { value: 'behind', label: 'BEHIND' },
];
const BLADES: { value: string; label: string }[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: 'eclipse', label: 'ECLIPSE' },
];
const RATE_OPTIONS = RATES.map((rate) => ({
  value: String(rate),
  label: `${rate}×`,
}));
const OVERLAYS: { key: keyof Overlays; label: string }[] = [
  { key: 'effects', label: 'EFFECTS' },
  { key: 'path', label: 'BLADE PATH' },
  { key: 'targets', label: 'TARGETS' },
];
const ALL_OVERLAYS: Overlays = { effects: true, path: false, targets: true };
const CARD_ORBIT = { yaw: 0.6, pitch: 0, zoom: 1 };

function Loading() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-label text-fg-subtle">
      LOADING THE VANGUARD · {Math.round(progress)}%
    </div>
  );
}

function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-label text-fg-subtle">{label}</div>
      {children}
    </div>
  );
}

function TransportBar({ transport }: { transport: Transport }) {
  useTransport(transport);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        className="w-20"
        onClick={() => transport.setPlaying(!transport.playing)}
      >
        {transport.playing ? 'PAUSE' : 'PLAY'}
      </Button>
      <Button size="sm" variant="outline" onClick={() => transport.step(-1)}>
        −1 FRAME
      </Button>
      <Button size="sm" variant="outline" onClick={() => transport.step(1)}>
        +1 FRAME
      </Button>
      <SegmentedControl
        label="Playback speed"
        options={RATE_OPTIONS}
        value={String(transport.rate)}
        onChange={(rate) => transport.setRate(Number(rate))}
      />
      <div className="ml-auto text-body tabular-nums text-fg-secondary">
        {transport.time.toFixed(3)}
        <span className="text-fg-subtle"> / {transport.loop.toFixed(3)} s</span>
      </div>
    </div>
  );
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

function Readouts({ transport }: { transport: Transport }) {
  useTransport(transport);
  const readout = transport.readout;
  const upper = readout?.upper;
  const legs = readout?.legs;
  const frame = (reading: { frame: number; frames: number }) =>
    `Frame ${reading.frame.toFixed(1)} of ${reading.frames}`;
  return (
    <Panel>
      <StatGrid className="grid-cols-2">
        <Stat
          label="UPPER BODY"
          value={upper ? upper.clip.toUpperCase() : '—'}
          detail={upper ? frame(upper) : 'No swing playing'}
          wrap
        />
        <Stat
          label="CLIP SPEED"
          value={upper ? `${upper.rate.toFixed(2)}×` : '—'}
          detail="Clip seconds a game second"
        />
        <Stat
          label="SWING BLEND"
          value={upper ? percent(upper.weight) : '—'}
          detail="Weight over the carry"
        />
        <Stat
          label="TORSO TURN"
          value={readout?.twist == null ? '—' : `${Math.round(readout.twist)}°`}
          detail="Chest toward the target"
        />
        <Stat
          label="LEGS"
          value={legs ? legs.clip.toUpperCase() : '—'}
          detail={
            legs
              ? `${frame(legs)} · ${legs.rate.toFixed(2)}× · ${percent(legs.weight)}`
              : undefined
          }
          wrap
        />
        <Stat
          label="GROUND SPEED"
          value={readout ? readout.speed.toFixed(2) : '—'}
          unit="U/S"
        />
      </StatGrid>
    </Panel>
  );
}

/** One action, large, with playback, timing and the knobs that shape it. */
function Inspector({ spec }: { spec: ActionSpec }) {
  const [options, setOptions] = useState<SwingOptions | undefined>(spec.swing);
  const [strikeLevel, setStrikeLevel] = useState(1);
  const preview = useMemo(
    () => (spec.kind === 'orbital-strike' ? { ...spec, strikeLevel } : spec),
    [spec, strikeLevel]
  );
  const [source, setSource] = useState<Source>('game');
  const [view, setView] = useState<ViewId>('front');
  const [overlays, setOverlays] = useState<Overlays>({
    effects: true,
    path: true,
    targets: true,
  });
  const transport = useMemo(() => new Transport(), []);
  const orbit = useMemo(newOrbit, []);
  const driver = useMemo(
    () => new ActionDriver(preview, options),
    [preview, options]
  );
  const probe = useMemo(
    () => probeAction(preview, options),
    [preview, options]
  );
  const clip = authoredClip(spec, probe);
  const authored = source === 'authored' && clip !== null;
  const loop = authored ? authoredLoop(clip).loop : probe.loop;

  useEffect(() => {
    transport.frame = authored ? 1 / 24 : 1 / 60;
    transport.setLoop(loop);
  }, [transport, authored, loop]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select')) return;
      if (event.code === 'Space' && !target?.closest('button')) {
        event.preventDefault();
        transport.setPlaying(!transport.playing);
      } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        event.preventDefault();
        transport.step(event.code === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [transport]);

  // Drag to circle the Vanguard and scroll to zoom, in every view but the game's.
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const element = stage.current;
    if (!element || view === 'game') return;
    // Only with Ctrl or ⌘ (a trackpad pinch), so the page still scrolls past.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      orbit.zoom = Math.min(
        3,
        Math.max(0.35, orbit.zoom * Math.exp(event.deltaY * 0.001))
      );
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [orbit, view]);

  const pickView = (next: ViewId) => {
    Object.assign(orbit, newOrbit());
    setView(next);
  };
  const setOption = <K extends keyof SwingOptions>(
    key: K,
    value: SwingOptions[K]
  ) => setOptions((current) => current && { ...current, [key]: value });

  return (
    <section className="mt-8 grid items-start gap-4 xl:grid-cols-5">
      <Panel className="overflow-hidden xl:col-span-3">
        <div
          ref={stage}
          className={cn(
            'relative h-80 w-full touch-pan-y select-none sm:h-96 xl:h-[30rem]',
            view !== 'game' && 'cursor-grab active:cursor-grabbing'
          )}
          onPointerDown={(event) => {
            if (view === 'game') return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerMove={(event) => {
            const last = drag.current;
            if (!last) return;
            orbit.yaw -= (event.clientX - last.x) * 0.01;
            orbit.pitch += (event.clientY - last.y) * 0.01;
            drag.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onDoubleClick={() => Object.assign(orbit, newOrbit())}
        >
          <View className="absolute inset-0">
            <Suspense fallback={null}>
              <ActionStage
                driver={driver}
                transport={transport}
                view={view}
                orbit={orbit}
                overlays={overlays}
                source={source}
                clip={authored ? clip : null}
                framing={spec.framing}
                readout
              />
            </Suspense>
          </View>
          <Loading />
          <div className="pointer-events-none absolute left-3 top-3 flex gap-2">
            <Badge variant="solid">
              {authored ? `AUTHORED · ${clip?.toUpperCase()}` : 'IN GAME'}
            </Badge>
            {view === 'game' ? null : (
              <Badge className="hidden sm:inline-flex">
                DRAG TO TURN · CTRL+SCROLL TO ZOOM
              </Badge>
            )}
          </div>
        </div>
        <PanelSection className="border-t border-line">
          <TransportBar transport={transport} />
          <p className="mt-2 text-caption text-fg-subtle">
            Space plays or pauses; the arrow keys step one{' '}
            {authored ? 'authored frame (1/24 s)' : 'screen frame (1/60 s)'}.
          </p>
        </PanelSection>
        <PanelSection>
          <ActionTimeline
            transport={transport}
            probe={probe}
            clip={authored ? clip : null}
            stride={spec.kind === 'walk' || spec.kind === 'run'}
          />
        </PanelSection>
      </Panel>
      <div className="grid min-w-0 items-start gap-4 md:grid-cols-2 xl:col-span-2 xl:grid-cols-1">
        <Panel>
          <PanelSection>
            <Eyebrow>{spec.group.toUpperCase()}</Eyebrow>
            <h2 className="mt-1 text-heading text-fg">
              {spec.name.toUpperCase()}
            </h2>
            <p className="mt-2 text-caption text-fg-muted">{spec.detail}</p>
          </PanelSection>
          <PanelSection className="space-y-4">
            {spec.kind === 'orbital-strike' && (
              <StrikeLevelSelect
                level={strikeLevel}
                onChange={setStrikeLevel}
              />
            )}
            {clip ? (
              <Control label="SOURCE">
                <SegmentedControl
                  label="Source"
                  options={SOURCES}
                  value={source}
                  onChange={setSource}
                />
              </Control>
            ) : null}
            <Control label="VIEW">
              <SegmentedControl
                label="View"
                options={VIEWS}
                value={view}
                onChange={pickView}
              />
            </Control>
            {options ? (
              <>
                <Control label="STANCE">
                  <SegmentedControl
                    label="Stance"
                    options={STANCES}
                    value={options.stance}
                    onChange={(stance) => setOption('stance', stance)}
                  />
                </Control>
                <Control label="TARGET">
                  <SegmentedControl
                    label="Target"
                    options={BEARINGS}
                    value={options.bearing}
                    onChange={(bearing) => setOption('bearing', bearing)}
                  />
                </Control>
                <Control label="BLADE LEVEL">
                  <SegmentedControl
                    label="Blade level"
                    options={BLADES}
                    value={String(options.blade)}
                    onChange={(blade) =>
                      setOption(
                        'blade',
                        (blade === 'eclipse'
                          ? 'eclipse'
                          : Number(blade)) as BladeLevel
                      )
                    }
                  />
                </Control>
              </>
            ) : null}
            <Control label="SHOW">
              <div className="flex flex-wrap gap-2">
                {OVERLAYS.map(({ key, label }) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={overlays[key] ? 'solid' : 'outline'}
                    aria-pressed={overlays[key]}
                    onClick={() =>
                      setOverlays((current) => ({
                        ...current,
                        [key]: !current[key],
                      }))
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </Control>
          </PanelSection>
        </Panel>
        <Readouts transport={transport} />
      </div>
    </section>
  );
}

/** A small live loop of one action; picking it opens it in the inspector. */
function ActionCard({
  spec,
  selected,
  onSelect,
}: {
  spec: ActionSpec;
  selected: boolean;
  onSelect: () => void;
}) {
  const driver = useMemo(() => new ActionDriver(spec, spec.swing), [spec]);
  const transport = useMemo(() => {
    const transport = new Transport();
    transport.setLoop(driver.loop);
    return transport;
  }, [driver]);
  return (
    <Panel
      as="article"
      tone={selected ? 'strong' : 'default'}
      className="relative overflow-hidden"
    >
      <View className="h-40 w-full">
        <Suspense fallback={null}>
          <ActionStage
            driver={driver}
            transport={transport}
            view="front"
            orbit={CARD_ORBIT}
            overlays={ALL_OVERLAYS}
            source="game"
            clip={null}
            framing={spec.framing}
          />
        </Suspense>
      </View>
      <PanelSection className="border-t border-line">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-label text-fg">
            <button
              type="button"
              onClick={onSelect}
              aria-pressed={selected}
              className="text-left after:absolute after:inset-0"
            >
              {spec.name.toUpperCase()}
            </button>
          </h3>
          {selected && <Badge tone="accent">INSPECTING</Badge>}
        </div>
        <p className="mt-2 text-caption text-fg-muted">{spec.detail}</p>
      </PanelSection>
    </Panel>
  );
}

/**
 * Unlisted dashboard of every action the player's Vanguard takes, for
 * refining its animation. Each action is a short scripted run of the game's
 * own simulation, drawn by the game's own renderers into one shared canvas.
 */
export function Actions() {
  const container = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const spec = actionById(params.get('action')) ?? ACTIONS[0];
  useEffect(() => disposeCatalogGround, []);

  const groups = new Map<string, ActionSpec[]>();
  for (const action of ACTIONS)
    groups.set(action.group, [...(groups.get(action.group) ?? []), action]);
  const select = (id: string) => {
    setParams({ action: id }, { replace: true });
    container.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div
      ref={container}
      className="relative h-full w-full overflow-y-auto bg-surface font-mono"
    >
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-20 sm:px-6 sm:pt-24">
        <header className="border-b border-line pb-6">
          <Eyebrow>CORE SURVIVORS · UNLISTED</Eyebrow>
          <PageTitle className="mt-3">VANGUARD ACTIONS</PageTitle>
          <p className="mt-4 max-w-3xl text-body text-fg-muted">
            Every action the player’s Vanguard takes, played by the game’s own
            simulation and animation code. Pick one to slow it down, step it
            frame by frame, and see how each sword clip is retimed to land on
            the hit.
          </p>
        </header>
        <Inspector key={spec.id} spec={spec} />
        {[...groups].map(([group, actions]) => (
          <section key={group} className="mt-10">
            <SectionHeading title={group.toUpperCase()} />
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {actions.map((action) => (
                <ActionCard
                  key={action.id}
                  spec={action}
                  selected={action.id === spec.id}
                  onSelect={() => select(action.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      <Canvas
        eventSource={container as RefObject<HTMLElement>}
        style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}
      >
        <View.Port />
      </Canvas>
    </div>
  );
}

useGLTF.preload(VANGUARD.url);
