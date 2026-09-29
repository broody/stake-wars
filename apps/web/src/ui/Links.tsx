import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { textLinkStyles, type Tone } from './styles';

/**
 * A link that opens in a new tab, marked with ↗ and announced to screen
 * readers. `quiet` drops the underline for links inside tables and headers.
 */
export function ExternalLink({
  href,
  tone = 'neutral',
  quiet = false,
  className,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  tone?: Tone;
  quiet?: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        quiet
          ? cn('transition-colors hover:text-fg', className)
          : textLinkStyles(tone, className)
      }
      {...props}
    >
      {children}
      <span aria-hidden="true" className="ml-1 opacity-60">
        ↗
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
