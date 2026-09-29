import type { HTMLAttributes } from 'react';
import { cn } from './cn';
import type { Tone } from './styles';

type BadgeTone = Tone | 'success';

const outline: Record<BadgeTone, string> = {
  neutral: 'border-line-strong text-fg-muted',
  accent: 'border-accent/60 text-accent',
  gold: 'border-gold/60 text-gold',
  warning: 'border-warning/60 text-warning',
  danger: 'border-danger-line text-danger',
  success: 'border-success/60 text-success',
};

const solid: Record<BadgeTone, string> = {
  neutral: 'border-fg bg-fg text-surface',
  accent: 'border-accent bg-accent text-surface',
  gold: 'border-gold bg-gold text-surface',
  warning: 'border-warning bg-warning text-surface',
  danger: 'border-danger-strong bg-danger-strong text-surface',
  success: 'border-success bg-success text-surface',
};

/** A short status or category marker. Pair color with a word, never alone. */
export function Badge({
  tone = 'neutral',
  variant = 'outline',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  variant?: 'outline' | 'solid';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap border px-1.5 py-0.5 text-tag',
        (variant === 'solid' ? solid : outline)[tone],
        className
      )}
      {...props}
    />
  );
}
