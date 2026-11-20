import { useRef, type PointerEvent } from 'react';
import { cn } from '../../ui';
import { REBUKE_GESTURE } from '../utils/vanguardOffhand';
import { VANGUARD } from '../utils/vanguardAnimation';
import {
  CLIP_FPS,
  CLIP_SECONDS,
  SWING_ACTIVE,
  SWING_BLEND,
  SWING_CLIPS,
  swingElapsedAt,
  swingFrameTimes,
  type ActionProbe,
  type ClipName,
} from './timeline';
import { useTransport, type Transport } from './transport';

interface Mark {
  from: number;
  /** Omitted for an instant. */
  to?: number;
  className: string;
  title: string;
  label?: string;
  /** A short tick at the foot of the row, such as one authored frame. */
  tick?: boolean;
  /** A thin band along the top of the row, over the spans. */
  strip?: boolean;
}

interface Row {
  label: string;
  marks: Mark[];
}

const HIT_FRAME = Math.round(VANGUARD.impact * CLIP_FPS);
const seconds = (time: number) => `${time.toFixed(3)} s`;

/** Rows for the game's composite: the swing, its retiming and its effects. */
function gameRows(probe: ActionProbe): Row[] {
  const rows: Row[] = [];
  const swing = probe.swing;
  if (swing) {
    const end = swing.start + swing.duration;
    const clipSeconds = CLIP_SECONDS[swing.clip];
    const at = (clip: number) =>
      swing.start + swingElapsedAt(clip, swing.duration, clipSeconds);
    rows.push({
      label: 'SWING',
      marks: [
        {
          from: swing.start,
          to: end,
          className: 'bg-line-strong',
          title: `${swing.clip} on the upper body for ${seconds(swing.duration)}`,
          label: swing.clip.toUpperCase(),
        },
        {
          from: swing.start,
          to: swing.start + SWING_BLEND.in * swing.duration,
          className: 'bg-fg-muted',
          title: 'Blending in from the carry',
          strip: true,
        },
        {
          from: end - SWING_BLEND.out * swing.duration,
          to: end,
          className: 'bg-fg-muted',
          title: 'Blending back to the carry',
          strip: true,
        },
        ...swingFrameTimes(swing).map((time, frame) => ({
          from: time,
          tick: true,
          className: frame === HIT_FRAME ? 'bg-accent' : 'bg-fg-muted',
          title: `${swing.clip} frame ${frame} shows at ${seconds(time)}`,
        })),
      ],
    });
    rows.push({
      label: 'CUT',
      marks: [
        {
          from: at(SWING_ACTIVE[0]),
          to: at(SWING_ACTIVE[1]),
          className: 'bg-fg-muted',
          title: 'The clip’s authored active frames, 6 to 11',
          label: '6–11',
        },
        {
          from: swing.impact,
          className: 'bg-accent',
          title: `The sim’s hit, at ${seconds(swing.impact)}`,
          label: 'HIT',
        },
      ],
    });
  }
  if (probe.slash)
    rows.push({
      label: 'SLASH',
      marks: [
        {
          from: probe.slash.start,
          to: probe.slash.start + probe.slash.life,
          className: 'bg-fg-secondary/70',
          title: `The ground mark appears at ${seconds(probe.slash.start)} and fades over ${seconds(probe.slash.life)}`,
          label: probe.slash.kind === 'eclipse' ? 'ECLIPSE' : 'MARK',
        },
      ],
    });
  if (probe.sounds.length) {
    // Sounds within a few hundredths of each other share one mark.
    const together: { at: number; ids: string[] }[] = [];
    for (const sound of [...probe.sounds].sort((a, b) => a.at - b.at)) {
      const last = together[together.length - 1];
      if (last && sound.at - last.at < 0.03) last.ids.push(sound.id);
      else together.push({ at: sound.at, ids: [sound.id] });
    }
    rows.push({
      label: 'SOUND',
      marks: together.map(({ at, ids }) => ({
        from: at,
        className: ids.includes('swing') ? 'bg-warning' : 'bg-fg',
        title: ids
          .map((id) =>
            id === 'swing'
              ? `The swing sound peaks at ${seconds(at)}`
              : `A ${id} sound plays at ${seconds(at)}`
          )
          .join('. '),
        label: ids.map((id) => id.toUpperCase()).join(' + '),
      })),
    });
  }
  if (probe.crescent)
    rows.push({
      label: 'CRESCENT',
      marks: [
        {
          from: probe.crescent.start,
          to: probe.crescent.end,
          className: 'bg-fg-secondary/60',
          title: 'A crescent in flight',
          label: 'IN FLIGHT',
        },
      ],
    });
  if (probe.rebuke)
    rows.push({
      label: 'REBUKE',
      marks: [
        {
          from: probe.rebuke.start,
          to: probe.rebuke.start + REBUKE_GESTURE.end,
          className: 'bg-line-strong',
          title: 'Left gauntlet braces, extends, and recovers',
          label: 'COUNTER',
        },
        {
          from: probe.rebuke.start,
          to: probe.rebuke.start + probe.rebuke.life,
          className: 'bg-fg-secondary/70',
          title: 'The shockwave grows and fades',
          strip: true,
        },
      ],
    });
  if (probe.lob && probe.burn)
    rows.push({
      label: 'CHARGE',
      marks: [
        {
          from: probe.lob.start,
          to: probe.burn.start,
          className: 'bg-fg-secondary/70',
          label: 'LOB',
          title: `${probe.lob.count} airborne`,
        },
        {
          from: probe.burn.start,
          to: probe.burn.start + probe.burn.life,
          className: 'bg-accent/70',
          label: 'BURN',
          title: 'Impact and burning ground',
        },
      ],
    });
  if (probe.pulses.length)
    rows.push({
      label: 'FIELD',
      marks: probe.pulses.map((at) => ({
        from: at,
        className: 'bg-accent',
        title: `Field deals damage at ${seconds(at)}`,
        label: 'PULSE',
      })),
    });
  if (probe.shardHits.length)
    rows.push({
      label: 'SHARDS',
      marks: probe.shardHits.map((at) => ({
        from: at,
        className: 'bg-fg-secondary',
        label: 'HIT',
        title: `Orbit Shards hit at ${seconds(at)}`,
      })),
    });
  if (probe.aegis.length)
    rows.push({
      label: 'AEGIS',
      marks: probe.aegis.map((hit) => ({
        from: hit.at,
        className: hit.result === 'broke' ? 'bg-danger' : 'bg-fg-secondary',
        title:
          hit.result === 'broke'
            ? `The gauge breaks at ${seconds(hit.at)}`
            : `A hit is blocked at ${seconds(hit.at)}`,
        label: hit.result === 'broke' ? 'BREAK' : 'BLOCK',
      })),
    });
  if (probe.strikes.length)
    rows.push({
      label: 'STRIKE',
      marks: probe.strikes.map(({ at, linked, count }) => ({
        from: at,
        className: linked ? 'bg-fg-muted' : 'bg-fg',
        label: linked ? 'HOP' : 'HIT',
        title: `${count} ${linked ? 'chain' : 'orbital'} impacts at ${seconds(at)}`,
      })),
    });
  if (probe.wounds.length)
    rows.push({
      label: 'HURT',
      marks: probe.wounds.map((at) => ({
        from: at,
        to: at + VANGUARD.recoilDuration,
        className: 'bg-danger/50',
        title: 'The shoulders recoil and settle back into the stride',
        label: 'RECOIL',
      })),
    });
  if (probe.fall !== undefined)
    rows.push({
      label: 'FALL',
      marks: [
        {
          from: probe.fall,
          to: Math.min(probe.loop, probe.fall + VANGUARD.deathDuration),
          className: 'bg-line-strong',
          title: 'The Defeated clip’s three seconds',
          label: 'DEFEATED',
        },
      ],
    });
  return rows;
}

/** Rows for a gait loop: two strides. */
function strideRows(loop: number): Row[] {
  return [
    {
      label: 'STRIDE',
      marks: [0, loop / 2].map((from) => ({
        from,
        to: from + loop / 2,
        className: 'bg-line-strong',
        title: 'One full stride',
        label: 'STRIDE',
      })),
    },
  ];
}

/** Rows for one clip played as authored, frame by frame. */
function clipRows(clip: ClipName): Row[] {
  const length = CLIP_SECONDS[clip];
  const frames = Math.round(length * CLIP_FPS);
  const swing = (SWING_CLIPS as string[]).includes(clip);
  const rows: Row[] = [
    {
      label: 'CLIP',
      marks: [
        {
          from: 0,
          to: length,
          className: 'bg-line-strong',
          title: `${clip}: ${frames} frames at ${CLIP_FPS} fps`,
          label: clip.toUpperCase(),
        },
        ...Array.from({ length: frames + 1 }, (_, frame) => ({
          from: frame / CLIP_FPS,
          tick: true,
          className: swing && frame === HIT_FRAME ? 'bg-accent' : 'bg-fg-muted',
          title: `Frame ${frame}`,
        })),
      ],
    },
  ];
  if (swing)
    rows.push({
      label: 'CUT',
      marks: [
        {
          from: SWING_ACTIVE[0],
          to: SWING_ACTIVE[1],
          className: 'bg-fg-muted',
          title: 'The authored active frames, 6 to 11',
          label: '6–11',
        },
        {
          from: VANGUARD.impact,
          className: 'bg-accent',
          title: 'The authored strike frame',
          label: `FRAME ${HIT_FRAME}`,
        },
      ],
    });
  return rows;
}

/**
 * The action's loop as rows of events under a playhead. Drag across it to
 * scrub; each authored frame of a swing is a tick, so the retiming shows as
 * ticks bunching up after the hit.
 */
export function ActionTimeline({
  transport,
  probe,
  clip,
  stride,
}: {
  transport: Transport;
  probe: ActionProbe;
  /** A clip played as authored, which replaces the run's rows. */
  clip: ClipName | null;
  /** Show the loop as two gait strides. */
  stride: boolean;
}) {
  useTransport(transport);
  const tracks = useRef<HTMLDivElement>(null);
  const loop = transport.loop;
  let rows = clip ? clipRows(clip) : gameRows(probe);
  if (!clip && stride) rows = strideRows(loop);
  if (!rows.length)
    rows = [
      {
        label: 'LOOP',
        marks: [
          {
            from: 0,
            to: loop,
            className: 'bg-line-strong',
            title: 'The clip loops',
            label: 'LOOPING',
          },
        ],
      },
    ];
  const step = loop > 2.2 ? 0.5 : 0.25;
  const ticks = Array.from(
    { length: Math.floor(loop / step + 1e-6) + 1 },
    (_, i) => i * step
  );
  const percent = (time: number) =>
    `${(Math.min(Math.max(time, 0), loop) / loop) * 100}%`;

  const scrub = (event: PointerEvent<HTMLDivElement>) => {
    const box = tracks.current?.getBoundingClientRect();
    if (!box) return;
    transport.setPlaying(false);
    transport.seek(((event.clientX - box.left) / box.width) * loop);
  };

  return (
    <div className="flex gap-3">
      <div className="w-16 shrink-0 sm:w-20">
        {rows.map((row) => (
          <div
            key={row.label}
            className="mb-1 flex h-6 items-center text-tag text-fg-subtle"
          >
            {row.label}
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div
          ref={tracks}
          role="slider"
          tabIndex={0}
          aria-label="Scrub through the loop"
          aria-valuemin={0}
          aria-valuemax={Number(loop.toFixed(3))}
          aria-valuenow={Number(transport.time.toFixed(3))}
          aria-valuetext={seconds(transport.time)}
          className="relative cursor-ew-resize touch-none select-none"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            scrub(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              scrub(event);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            // The page's own arrow-key handler steps a frame.
            event.preventDefault();
          }}
        >
          {rows.map((row) => (
            <div
              key={row.label}
              className="relative mb-1 h-6 overflow-hidden bg-surface-raised"
            >
              {row.marks.map((mark, index) =>
                mark.tick ? (
                  <div
                    key={index}
                    title={mark.title}
                    className={cn('absolute bottom-0 h-2 w-px', mark.className)}
                    style={{ left: percent(mark.from) }}
                  />
                ) : mark.strip && mark.to !== undefined ? (
                  <div
                    key={index}
                    title={mark.title}
                    className={cn('absolute top-0 h-1', mark.className)}
                    style={{
                      left: percent(mark.from),
                      width: `calc(${percent(mark.to)} - ${percent(mark.from)})`,
                    }}
                  />
                ) : mark.to === undefined ? (
                  <div
                    key={index}
                    title={mark.title}
                    className="absolute inset-y-0 flex items-center"
                    style={{ left: percent(mark.from) }}
                  >
                    <div className={cn('h-full w-0.5', mark.className)} />
                    {mark.label ? (
                      <span className="ml-1 text-tag text-fg-secondary">
                        {mark.label}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div
                    key={index}
                    title={mark.title}
                    className={cn(
                      'absolute inset-y-0 flex items-center overflow-hidden',
                      mark.className
                    )}
                    style={{
                      left: percent(mark.from),
                      width: `calc(${percent(mark.to)} - ${percent(mark.from)})`,
                    }}
                  >
                    {mark.label ? (
                      <span className="truncate px-1 text-tag text-fg">
                        {mark.label}
                      </span>
                    ) : null}
                  </div>
                )
              )}
            </div>
          ))}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px bg-fg"
            style={{ left: percent(transport.time) }}
          />
        </div>
        <div className="relative h-4">
          {ticks.map((time) => (
            <span
              key={time}
              className={cn(
                'absolute text-tag tabular-nums text-fg-subtle',
                time === 0
                  ? ''
                  : time >= loop - 1e-6
                    ? '-translate-x-full'
                    : '-translate-x-1/2'
              )}
              style={{ left: percent(time) }}
            >
              {Number(time.toFixed(2))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
