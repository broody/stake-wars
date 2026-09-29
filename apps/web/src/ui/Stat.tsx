import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { toneText, type StatusTone } from './styles';

/**
 * A labelled figure. `emphasis` promotes the value to a headline figure.
 * Lay several out in a StatGrid to get hairline dividers between them.
 */
export function Stat({
  label,
  value,
  unit,
  detail,
  emphasis = false,
  tone,
  wrap = false,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  detail?: ReactNode;
  emphasis?: boolean;
  /** Colors the value for a status (pending, gained…); text stays neutral otherwise. */
  tone?: StatusTone;
  /** Lets long values (addresses, 18-decimal amounts) wrap instead of overflow. */
  wrap?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 px-4 py-4', className)}>
      <div className="text-label text-fg-subtle">{label}</div>
      <div
        className={cn(
          'mt-2 tabular-nums',
          wrap ? 'break-words' : 'whitespace-nowrap',
          emphasis
            ? 'text-figure-sm text-fg sm:text-figure'
            : 'text-figure-sm text-fg-secondary',
          tone && tone !== 'neutral' && toneText[tone]
        )}
      >
        {value}
        {unit ? (
          <span className="ml-1.5 text-label text-fg-subtle">{unit}</span>
        ) : null}
      </div>
      {detail ? (
        <div className="mt-1.5 text-caption text-fg-subtle">{detail}</div>
      ) : null}
    </div>
  );
}

/**
 * A grid whose cells are separated by 1px rules. Pass the column classes;
 * each child gets the surface background so the gaps read as lines.
 */
export function StatGrid({
  className,
  tone = 'default',
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: 'default' | 'accent' }) {
  return (
    <div
      className={cn(
        'grid gap-px',
        tone === 'accent'
          ? 'bg-accent/20 [&>*]:bg-accent-surface'
          : 'bg-line [&>*]:bg-surface',
        className
      )}
      {...props}
    />
  );
}
