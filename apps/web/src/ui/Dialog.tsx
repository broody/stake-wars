import {
  useEffect,
  useRef,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { CloseButton } from './Button';
import { cn } from './cn';
import { panelStyles } from './styles';

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
};

/**
 * A modal dialog over a dimmed backdrop. Escape and a backdrop click close
 * it while `canClose` is true. Focus moves to `initialFocus`, or to the
 * dialog itself, and returns to the previously focused element on close.
 */
export function Dialog({
  open,
  onClose,
  canClose = true,
  labelledBy,
  describedBy,
  initialFocus,
  size = 'md',
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  canClose?: boolean;
  /** Id of the element that names the dialog, usually its title. */
  labelledBy: string;
  describedBy?: string;
  initialFocus?: RefObject<HTMLElement | null>;
  size?: keyof typeof sizes;
  className?: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    (initialFocus?.current ?? dialogRef.current)?.focus();
    return () => previous?.focus?.();
    // Focus once per opening, not whenever the caller re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && canClose) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [canClose, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-surface/85 px-4 py-10 font-mono backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && canClose) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={panelStyles(
          'floating',
          cn(
            'max-h-full w-full overflow-y-auto border-fg-subtle outline-none',
            sizes[size],
            className
          )
        )}
      >
        {children}
      </section>
    </div>
  );
}

/** The dialog's title row with an optional close control on the right. */
export function DialogHeader({
  eyebrow,
  title,
  titleId,
  onClose,
  closeLabel = 'Close',
  canClose = true,
  closeRef,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  titleId: string;
  onClose?: () => void;
  closeLabel?: string;
  canClose?: boolean;
  /** Lets the caller move focus to the close button. */
  closeRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        {eyebrow ? <div className="text-label">{eyebrow}</div> : null}
        <h2 id={titleId} className="mt-1 text-heading text-fg">
          {title}
        </h2>
      </div>
      {onClose ? (
        <CloseButton
          ref={closeRef}
          label={closeLabel}
          onClick={onClose}
          disabled={!canClose}
        />
      ) : null}
    </header>
  );
}
