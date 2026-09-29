import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { panelStyles, type PanelTone } from './styles';

type PanelElement = 'section' | 'div' | 'aside' | 'article' | 'header';

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: PanelElement;
  tone?: PanelTone;
  children?: ReactNode;
}

/** A bordered surface. Padding belongs to its sections, not the panel. */
export function Panel({
  as: Element = 'section',
  tone = 'default',
  className,
  ...props
}: PanelProps) {
  return <Element className={panelStyles(tone, className)} {...props} />;
}

/** A padded band inside a Panel, separated from the next by a rule. */
export function PanelSection({
  className,
  divided = true,
  ...props
}: HTMLAttributes<HTMLDivElement> & { divided?: boolean }) {
  return (
    <div
      className={cn(
        'p-5 sm:p-6',
        divided && 'border-b border-line last:border-b-0',
        className
      )}
      {...props}
    />
  );
}
