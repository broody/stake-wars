import type { ReactNode } from 'react';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-3 w-3 shrink-0 animate-spin rounded-full border border-current border-r-transparent align-[-2px] motion-reduce:animate-none ${className}`}
    />
  );
}

/** A button label led by a spinner while its action is in progress. */
export function BusyLabel({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {busy ? <Spinner className="mr-2" /> : null}
      {children}
    </>
  );
}
