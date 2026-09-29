import { cn } from './cn';

/**
 * Class recipes for elements that cannot be a library component, such as a
 * react-router <Link> styled as a button. Components in this folder use the
 * same recipes, so both paths stay identical.
 */

export type Tone = 'neutral' | 'accent' | 'gold' | 'warning' | 'danger';
export type ButtonVariant = 'solid' | 'outline' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const buttonTones: Record<ButtonVariant, Record<Tone, string>> = {
  solid: {
    neutral:
      'border-fg bg-fg text-surface hover-enabled:bg-surface hover-enabled:text-fg',
    accent:
      'border-accent bg-accent text-surface hover-enabled:bg-surface hover-enabled:text-accent',
    gold: 'border-gold bg-gold text-surface hover-enabled:bg-surface hover-enabled:text-gold',
    warning:
      'border-warning bg-warning text-surface hover-enabled:bg-surface hover-enabled:text-warning',
    danger:
      'border-danger-strong bg-danger-strong text-surface hover-enabled:bg-surface hover-enabled:text-danger-strong focus-visible:outline-danger-strong',
  },
  outline: {
    neutral:
      'border-line-strong text-fg-secondary hover-enabled:border-fg hover-enabled:bg-fg hover-enabled:text-surface',
    accent:
      'border-accent/70 text-accent hover-enabled:bg-accent hover-enabled:text-surface',
    gold: 'border-gold/70 text-gold hover-enabled:bg-gold hover-enabled:text-surface focus-visible:outline-gold',
    warning:
      'border-warning/70 text-warning hover-enabled:bg-warning hover-enabled:text-surface',
    danger:
      'border-danger-line text-danger hover-enabled:border-danger hover-enabled:bg-danger hover-enabled:text-surface',
  },
  ghost: {
    neutral: 'border-transparent text-fg-subtle hover-enabled:text-fg',
    accent: 'border-transparent text-accent hover-enabled:text-accent-soft',
    gold: 'border-transparent text-gold hover-enabled:text-gold-soft',
    warning: 'border-transparent text-warning hover-enabled:text-warning-soft',
    danger: 'border-transparent text-danger hover-enabled:text-fg',
  },
  link: {
    neutral: 'text-fg-secondary hover-enabled:text-fg',
    accent: 'text-accent hover-enabled:text-accent-soft',
    gold: 'text-gold hover-enabled:text-gold-soft',
    warning: 'text-warning hover-enabled:text-warning-soft',
    danger: 'text-danger hover-enabled:text-fg',
  },
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 py-1.5 text-tag',
  md: 'min-h-10 px-4 py-2.5 text-label',
  lg: 'min-h-12 px-6 py-3.5 text-label',
  /** Landing hero calls to action only. */
  xl: 'min-h-14 px-10 py-4 text-heading',
};

/**
 * Disabled buttons stay legible because they often carry the reason
 * ("ENTER STRK AMOUNT"). They keep their tooltip; hover styles use the
 * `hover-enabled:` variant so a disabled button never reacts.
 */
const buttonDisabled: Record<ButtonVariant, string> = {
  solid:
    'disabled:border-line-strong disabled:bg-surface-hover disabled:text-fg-subtle',
  outline:
    'disabled:border-line disabled:bg-transparent disabled:text-fg-subtle',
  ghost: 'disabled:text-fg-disabled',
  link: 'disabled:text-fg-disabled disabled:no-underline',
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  tone?: Tone;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

export function buttonStyles({
  variant = 'outline',
  tone = 'neutral',
  size = 'md',
  fullWidth = false,
  className,
}: ButtonStyleOptions = {}) {
  return cn(
    'inline-flex items-center justify-center gap-2 font-mono transition-colors',
    'disabled:cursor-not-allowed aria-busy:cursor-wait',
    variant === 'link'
      ? 'underline decoration-line-strong decoration-dotted underline-offset-4 hover-enabled:decoration-current'
      : cn('border', buttonSizes[size]),
    variant === 'link' && (size === 'sm' ? 'text-tag' : 'text-label'),
    buttonTones[variant][tone],
    buttonDisabled[variant],
    fullWidth && 'w-full',
    className
  );
}

export type PanelTone =
  | 'default'
  | 'strong'
  | 'floating'
  | 'floating-gold'
  | 'floating-warning'
  | 'accent'
  | 'gold'
  | 'warning'
  | 'danger';

const panelTones: Record<PanelTone, string> = {
  default: 'border-line bg-surface',
  strong: 'border-line-strong bg-surface',
  /** A panel over the 3D Core: translucent, blurred, offset shadow. */
  floating: 'border-line-strong bg-surface/95 shadow-hard backdrop-blur-md',
  'floating-gold':
    'border-gold/70 bg-surface/95 shadow-hard-gold backdrop-blur-md',
  'floating-warning':
    'border-warning-strong/60 bg-surface/95 shadow-hard-warning backdrop-blur-md',
  accent: 'border-accent/60 bg-accent-surface',
  gold: 'border-gold/40 bg-gold/[0.03]',
  warning: 'border-warning-strong/60 bg-warning-strong/[0.04]',
  danger: 'border-danger-line/70 bg-danger/[0.04]',
};

export function panelStyles(tone: PanelTone = 'default', className?: string) {
  return cn('border', panelTones[tone], className);
}

const textLinkTones: Record<Tone, string> = {
  neutral:
    'decoration-fg-disabled hover:text-fg hover:decoration-fg hover:decoration-solid',
  accent: 'text-accent decoration-accent/50 hover:text-accent-soft',
  gold: 'text-gold decoration-gold/50 hover:text-gold-soft',
  warning: 'text-warning decoration-warning/50 hover:text-warning-soft',
  danger: 'text-danger decoration-danger/50 hover:text-fg',
};

/** Inline links inside running text: dotted underline, solid on hover. */
export function textLinkStyles(tone: Tone = 'neutral', className?: string) {
  return cn(
    'underline decoration-dotted underline-offset-2 transition-colors',
    textLinkTones[tone],
    className
  );
}

export type FieldSize = 'sm' | 'md' | 'lg';

const fieldSizes: Record<FieldSize, string> = {
  sm: 'px-3 py-2 text-label',
  md: 'px-3 py-2.5 text-caption',
  /** Amount entry: large tabular figures. */
  lg: 'px-4 py-3 text-figure-sm tabular-nums',
};

/**
 * Text inputs, selects and textareas. The border brightens on focus (gold
 * for Supply Drop forms) in place of the outline ring.
 */
export function fieldStyles({
  size = 'md',
  tone = 'neutral',
  className,
}: { size?: FieldSize; tone?: 'neutral' | 'gold'; className?: string } = {}) {
  return cn(
    'w-full min-w-0 border border-line-strong bg-surface text-fg outline-none transition-colors placeholder:text-fg-subtle',
    'focus-visible:outline-none disabled:cursor-not-allowed disabled:text-fg-subtle motion-reduce:transition-none',
    tone === 'gold' ? 'focus:border-gold' : 'focus:border-fg',
    fieldSizes[size],
    className
  );
}

export type StatusTone = Tone | 'success';

export const toneText: Record<StatusTone, string> = {
  neutral: 'text-fg-subtle',
  accent: 'text-accent',
  gold: 'text-gold',
  warning: 'text-warning',
  danger: 'text-danger',
  success: 'text-success',
};
