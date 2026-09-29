import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { chartColors, nearestIndex, niceTicks } from '../../utils/stakingChart';
import { formatDay, formatMonth } from '../../utils/stakingFormat';

export interface SeriesPoint {
  t: number;
  v: number;
}

const MARGIN = { top: 12, right: 14, bottom: 24, left: 52 };
const AXIS_FONT = 9;

function useMeasuredWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.max(160, element.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

interface TimeSeriesChartProps {
  points: SeriesPoint[];
  color: string;
  seriesLabel: string;
  formatValue: (value: number) => string;
  height?: number;
  emptyLabel?: string;
}

export function TimeSeriesChart({
  points,
  color,
  seriesLabel,
  formatValue,
  height = 220,
  emptyLabel = 'NOT ENOUGH HISTORY YET',
}: TimeSeriesChartProps) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);
  const gradientId = useId();
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const totalHeight = height + MARGIN.top + MARGIN.bottom;

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const tMin = points[0].t;
    const tMax = points[points.length - 1].t;
    const ticks = niceTicks(Math.max(...points.map((point) => point.v)));
    const yMax = ticks[ticks.length - 1] || 1;
    const x = (t: number) =>
      MARGIN.left + ((t - tMin) / Math.max(1, tMax - tMin)) * plotWidth;
    const y = (v: number) => MARGIN.top + height - (v / yMax) * height;
    const line = points
      .map(
        (point, index) =>
          `${index ? 'L' : 'M'}${x(point.t).toFixed(1)},${y(point.v).toFixed(1)}`
      )
      .join('');
    const baseline = MARGIN.top + height;
    const area = `${line}L${x(tMax).toFixed(1)},${baseline}L${x(tMin).toFixed(1)},${baseline}Z`;
    const span = tMax - tMin;
    const tickCount = Math.max(2, Math.min(6, Math.floor(plotWidth / 110)));
    const timeTicks = Array.from(
      { length: tickCount },
      (_, index) => tMin + (span * index) / (tickCount - 1)
    );
    const formatTick = span > 120 * 86_400 ? formatMonth : formatDay;
    return { x, y, line, area, ticks, timeTicks, formatTick };
  }, [height, plotWidth, points]);

  const pointAt = useCallback(
    (clientX: number, rect: DOMRect) => {
      if (!geometry) return null;
      const tMin = points[0].t;
      const tMax = points[points.length - 1].t;
      const fraction = (clientX - rect.left - MARGIN.left) / plotWidth;
      return nearestIndex(points, tMin + fraction * (tMax - tMin));
    },
    [geometry, plotWidth, points]
  );

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    setActive(
      pointAt(event.clientX, event.currentTarget.getBoundingClientRect())
    );
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const last = points.length - 1;
    const current = active ?? last;
    const next =
      event.key === 'ArrowLeft'
        ? Math.max(0, current - 1)
        : event.key === 'ArrowRight'
          ? Math.min(last, current + 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  };

  useEffect(() => {
    setActive((current) =>
      current !== null && current >= points.length ? null : current
    );
  }, [points.length]);

  if (!geometry) {
    return (
      <div
        ref={ref}
        className="flex w-full min-w-0 items-center justify-center text-[9px] tracking-[0.2em] text-neutral-600"
        style={{ height: totalHeight }}
      >
        {emptyLabel}
      </div>
    );
  }

  const last = points[points.length - 1];
  const hovered = active === null ? null : points[active];
  const hoverX = hovered ? geometry.x(hovered.t) : 0;
  const tooltipLeft = hoverX > width - 170;

  return (
    <div ref={ref} className="relative w-full min-w-0 select-none">
      <svg
        width={width}
        height={totalHeight}
        role="img"
        aria-label={`${seriesLabel}: ${formatValue(last.v)} on ${formatDay(last.t)}. Use arrow keys to read earlier values.`}
        tabIndex={0}
        className="block touch-pan-y focus-visible:outline focus-visible:outline-1 focus-visible:outline-neutral-500"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(points.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.14} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {geometry.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={geometry.y(tick)}
              y2={geometry.y(tick)}
              stroke={chartColors.grid}
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 8}
              y={geometry.y(tick)}
              dy="0.32em"
              textAnchor="end"
              fill={chartColors.axis}
              fontSize={AXIS_FONT}
              className="tabular-nums"
            >
              {formatValue(tick)}
            </text>
          </g>
        ))}
        {geometry.timeTicks.map((tick, index) => (
          <text
            key={tick}
            x={geometry.x(tick)}
            y={MARGIN.top + height + 16}
            textAnchor={
              index === 0
                ? 'start'
                : index === geometry.timeTicks.length - 1
                  ? 'end'
                  : 'middle'
            }
            fill={chartColors.axis}
            fontSize={AXIS_FONT}
            letterSpacing="0.08em"
          >
            {geometry.formatTick(tick)}
          </text>
        ))}
        <path d={geometry.area} fill={`url(#${gradientId})`} />
        <path
          d={geometry.line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hovered ? (
          <line
            x1={hoverX}
            x2={hoverX}
            y1={MARGIN.top}
            y2={MARGIN.top + height}
            stroke={chartColors.crosshair}
            strokeWidth={1}
          />
        ) : null}
        <circle
          cx={geometry.x((hovered ?? last).t)}
          cy={geometry.y((hovered ?? last).v)}
          r={4}
          fill={color}
          stroke={chartColors.surface}
          strokeWidth={2}
        />
      </svg>
      {hovered ? (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-36 border border-neutral-800 bg-black/95 px-3 py-2"
          style={
            tooltipLeft ? { right: width - hoverX + 12 } : { left: hoverX + 12 }
          }
        >
          <div className="text-sm text-white">{formatValue(hovered.v)}</div>
          <div className="mt-1 flex items-center gap-2 text-[9px] tracking-[0.14em] text-neutral-500">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-3"
              style={{ backgroundColor: color }}
            />
            {seriesLabel} · {formatDay(hovered.t)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A compact trend line without axes, for stat panels. */
export function Sparkline({
  points,
  color,
  label,
  height = 44,
}: {
  points: SeriesPoint[];
  color: string;
  label: string;
  height?: number;
}) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>(200);
  const path = useMemo(() => {
    if (points.length < 2) return null;
    const tMin = points[0].t;
    const tMax = points[points.length - 1].t;
    const values = points.map((point) => point.v);
    const vMin = Math.min(...values);
    const vMax = Math.max(...values);
    const range = vMax - vMin || 1;
    const pad = 5;
    const coordinates = points.map((point) => [
      pad + ((point.t - tMin) / Math.max(1, tMax - tMin)) * (width - pad * 2),
      pad + (1 - (point.v - vMin) / range) * (height - pad * 2),
    ]);
    return {
      d: coordinates
        .map(
          ([x, y], index) =>
            `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
        )
        .join(''),
      end: coordinates[coordinates.length - 1],
    };
  }, [height, points, width]);

  return (
    <div ref={ref} className="w-full min-w-0">
      {path ? (
        <svg width={width} height={height} role="img" aria-label={label}>
          <path
            d={path.d}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={path.end[0]}
            cy={path.end[1]}
            r={4}
            fill={color}
            stroke={chartColors.surface}
            strokeWidth={2}
          />
        </svg>
      ) : (
        <div style={{ height }} aria-label={label} />
      )}
    </div>
  );
}

export interface ColumnDatum {
  key: string;
  label: string;
  /** Used when columns are too narrow for the full label. */
  shortLabel?: string;
  value: number;
  detail: string;
}

/** Columns from one baseline, capped at 24px, with a per-column tooltip. */
export function ColumnChart({
  data,
  color,
  formatValue,
  height = 150,
}: {
  data: ColumnDatum[];
  color: string;
  formatValue: (value: number) => string;
  height?: number;
}) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>(480);
  const [active, setActive] = useState<number | null>(null);
  const top = 18;
  const bottom = 22;
  const band = width / Math.max(1, data.length);
  const barWidth = Math.min(24, band * 0.5);
  const maximum = Math.max(0, ...data.map((datum) => datum.value));
  const largest = data.findIndex(
    (datum) => datum.value === maximum && maximum > 0
  );
  const scale = (value: number) =>
    maximum > 0 ? (value / maximum) * height : 0;
  const baseline = top + height;

  return (
    <div ref={ref} className="relative w-full min-w-0 select-none">
      <svg
        width={width}
        height={top + height + bottom}
        role="img"
        aria-hidden="true"
      >
        <line
          x1={0}
          x2={width}
          y1={baseline}
          y2={baseline}
          stroke={chartColors.grid}
          strokeWidth={1}
        />
        {data.map((datum, index) => {
          const center = band * index + band / 2;
          const barHeight = scale(datum.value);
          const x = center - barWidth / 2;
          const y = baseline - barHeight;
          const radius = Math.min(4, barHeight, barWidth / 2);
          const d =
            barHeight > 0
              ? `M${x},${baseline}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + barWidth - radius}Q${x + barWidth},${y} ${x + barWidth},${y + radius}V${baseline}Z`
              : '';
          return (
            <g key={datum.key}>
              {d ? (
                <path
                  d={d}
                  fill={color}
                  opacity={active === null || active === index ? 1 : 0.55}
                />
              ) : null}
              {index === largest ? (
                <text
                  x={center}
                  y={y - 6}
                  textAnchor="middle"
                  fill="#d4d4d4"
                  fontSize={9}
                >
                  {formatValue(datum.value)}
                </text>
              ) : null}
              <text
                x={center}
                y={baseline + 15}
                textAnchor="middle"
                fill={chartColors.axis}
                fontSize={AXIS_FONT}
                letterSpacing="0.08em"
              >
                {band < 56 && datum.shortLabel ? datum.shortLabel : datum.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex">
        {data.map((datum, index) => (
          <button
            key={datum.key}
            type="button"
            className="h-full flex-1 cursor-crosshair focus-visible:outline focus-visible:outline-1 focus-visible:outline-neutral-500"
            aria-label={`${datum.label}: ${formatValue(datum.value)}, ${datum.detail}`}
            onPointerEnter={() => setActive(index)}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
          />
        ))}
      </div>
      {active !== null ? (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-32 border border-neutral-800 bg-black/95 px-3 py-2"
          style={
            band * active + band / 2 > width - 150
              ? { right: width - band * active - band / 2 + 18 }
              : { left: band * active + band / 2 + 18 }
          }
        >
          <div className="text-sm text-white">
            {formatValue(data[active].value)}
          </div>
          <div className="mt-1 text-[9px] tracking-[0.14em] text-neutral-500">
            {data[active].label} · {data[active].detail}
          </div>
        </div>
      ) : null}
    </div>
  );
}
