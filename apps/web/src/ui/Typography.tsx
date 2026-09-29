import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { toneText, type StatusTone } from './styles';

/** The one page title per route. */
export function PageTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={cn('font-mono text-display font-bold text-fg', className)}
      {...props}
    />
  );
}

/** The small uppercase line above a title or value. */
export function Eyebrow({
  tone = 'neutral',
  dot = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: StatusTone; dot?: boolean }) {
  return (
    <div
      className={cn(
        'text-label',
        dot && 'flex items-center gap-2',
        toneText[tone],
        className
      )}
      {...props}
    >
      {dot ? (
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 bg-current" />
      ) : null}
      {children}
    </div>
  );
}

/** A section title with its eyebrow, and optional controls on the right. */
export function SectionHeading({
  id,
  eyebrow,
  eyebrowTone,
  title,
  as: Heading = 'h2',
  children,
  className,
}: {
  id?: string;
  eyebrow?: ReactNode;
  eyebrowTone?: StatusTone;
  title: ReactNode;
  as?: 'h2' | 'h3';
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-4',
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <Eyebrow tone={eyebrowTone}>{eyebrow}</Eyebrow> : null}
        <Heading id={id} className="mt-1 text-heading text-fg">
          {title}
        </Heading>
      </div>
      {children}
    </div>
  );
}
