import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export function SectionHeading({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-[9px] tracking-[0.24em] text-neutral-500">
          {eyebrow}
        </div>
        <h2 id={id} className="mt-1 text-lg tracking-[0.12em] text-white">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

export function StatCell({
  label,
  value,
  unit,
  detail,
  className,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  detail?: ReactNode;
  className?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={cn('border-b border-r border-grid px-4 py-4', className)}>
      <div className="text-[9px] tracking-[0.2em] text-neutral-500">
        {label}
      </div>
      <div
        className={cn(
          'mt-2 whitespace-nowrap',
          emphasis ? 'text-2xl text-white' : 'text-lg text-neutral-200'
        )}
      >
        {value}
        {unit ? (
          <span className="ml-1.5 text-[10px] tracking-[0.16em] text-neutral-500">
            {unit}
          </span>
        ) : null}
      </div>
      {detail ? (
        <div className="mt-1.5 text-[10px] leading-4 tracking-[0.06em] text-neutral-500">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex border border-grid">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'border-r border-grid px-3 py-1.5 text-[9px] tracking-[0.18em] transition-colors last:border-r-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-white',
            option.value === value
              ? 'bg-fg text-bg'
              : 'text-neutral-500 hover:text-white'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-white',
        className
      )}
    >
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
