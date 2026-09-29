import { cn } from './cn';

/** A row of mutually exclusive options, such as a time range or unit. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  /** Accessible name for the group. */
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex border border-line', className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'min-h-8 border-r border-line px-3 py-1.5 text-label transition-colors last:border-r-0 focus-visible:outline-offset-[-2px]',
            option.value === value
              ? 'bg-fg text-surface'
              : 'text-fg-subtle hover:text-fg'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
