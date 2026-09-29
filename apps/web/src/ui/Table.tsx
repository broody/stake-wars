import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react';
import { cn } from './cn';

/**
 * Data tables: label-sized headers, caption-sized cells, hairline rows.
 * Numbers go in `numeric` cells so they align right on tabular figures.
 */
export function Table({
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn('w-full border-collapse text-left text-caption', className)}
      {...props}
    />
  );
}

export function TableHead({
  className,
  sticky = false,
  ...props
}: HTMLAttributes<HTMLTableSectionElement> & { sticky?: boolean }) {
  return (
    <thead
      className={cn(
        'text-label text-fg-subtle',
        sticky && 'sticky top-0 z-[1] bg-surface',
        className
      )}
      {...props}
    />
  );
}

export function TableRow({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-t border-line', className)} {...props} />;
}

export function TableHeaderCell({
  className,
  numeric = false,
  scope = 'col',
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope={scope}
      className={cn(
        'whitespace-nowrap px-3 py-2 font-normal',
        numeric && 'text-right',
        className
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  numeric = false,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        'px-3 py-2 text-fg-secondary',
        numeric && 'whitespace-nowrap text-right tabular-nums',
        className
      )}
      {...props}
    />
  );
}
