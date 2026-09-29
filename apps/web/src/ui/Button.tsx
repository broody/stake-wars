import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from './cn';
import { Spinner } from './Spinner';
import { buttonStyles, type ButtonStyleOptions } from './styles';

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonStyleOptions {
  /** Shows a spinner, disables the button and marks it aria-busy. */
  busy?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/** The × that dismisses a dialog, panel or toast. */
export function CloseButton({
  label,
  size = 'md',
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** Accessible name, such as "Close split transaction progress". */
  label: string;
  /** `sm` for toasts and dense rows. */
  size?: 'sm' | 'md';
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'shrink-0 leading-none text-fg-subtle transition-colors hover-enabled:text-fg disabled:cursor-wait disabled:text-fg-disabled',
        size === 'sm' ? 'px-1 text-heading' : 'px-2 py-1 text-title',
        className
      )}
      {...props}
    >
      ×
    </button>
  );
}

/**
 * Every clickable action. For a navigation link that looks like a button,
 * give the link `buttonStyles()` instead.
 */
export function Button({
  variant,
  tone,
  size,
  fullWidth,
  busy = false,
  className,
  disabled,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={buttonStyles({ variant, tone, size, fullWidth, className })}
      {...props}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}
