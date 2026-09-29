import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import type { StatusTone } from './styles';

const tones: Record<StatusTone, string> = {
  neutral: 'border-line-strong text-fg-muted',
  accent: 'border-accent text-accent',
  gold: 'border-gold text-gold',
  warning: 'border-warning text-warning',
  danger: 'border-danger text-danger',
  success: 'border-success text-success',
};

/**
 * A notice set off by a rule on its left: warnings, errors, explanations.
 * Use role="alert" for errors that appear after an action.
 */
export function Callout({
  tone = 'neutral',
  title,
  action,
  className,
  children,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  tone?: StatusTone;
  title?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'border-l-2 py-1 pl-4 text-caption',
        tones[tone],
        className
      )}
      {...props}
    >
      {title ? <div className="mb-1 text-label">{title}</div> : null}
      {children}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
