/**
 * Stake Wars design tokens: the single source of truth for type, color and
 * letter spacing. `tailwind.config.ts` builds its theme from this file, and
 * canvas, SVG and three.js code imports the same values at runtime.
 *
 * Change a value here, never at a call site. When a design needs something
 * this file does not offer, add a token (and document it on /play/ui) instead
 * of reaching for an arbitrary Tailwind value.
 */

type FontSize = [
  size: string,
  options: { lineHeight: string; letterSpacing: string },
];

/**
 * Type roles, smallest first. Each role fixes size, line height and letter
 * spacing together, so `text-label` is the whole style. The floor is 11px:
 * nothing in the product renders smaller.
 */
export const fontSize = {
  /** 11px. Badges, chips, chart axes and dense metadata. */
  tag: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.12em' }],
  /** 12px. Uppercase labels: eyebrows, stat labels, buttons, table headers. */
  label: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.16em' }],
  /** 13px. Supporting sentences, details, notices and footnotes. */
  caption: ['0.8125rem', { lineHeight: '1.25rem', letterSpacing: '0.02em' }],
  /** 14px. Default reading text. */
  body: ['0.875rem', { lineHeight: '1.5rem', letterSpacing: '0' }],
  /** 17px. Introductory paragraphs and landing copy. */
  lead: ['1.0625rem', { lineHeight: '1.75rem', letterSpacing: '0' }],
  /** 18px. Section and panel headings. */
  heading: ['1.125rem', { lineHeight: '1.5rem', letterSpacing: '0.08em' }],
  /** 20px. Secondary figures: stat cells, table highlights. */
  'figure-sm': ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],
  /** 24px. Card and dialog titles, landing subheads. */
  title: ['1.5rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
  /** 30px. Headline figures. */
  figure: ['1.875rem', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
  /** 36–60px. Page titles. */
  display: [
    'clamp(2.25rem, 1.25rem + 4vw, 3.75rem)',
    { lineHeight: '1', letterSpacing: '-0.06em' },
  ],
  /** 48–128px. The landing hero and oversized feature numbers. */
  hero: [
    'clamp(3rem, 1rem + 8vw, 8rem)',
    { lineHeight: '0.9', letterSpacing: '-0.04em' },
  ],
  /** 160–256px. Decorative background numerals only. */
  ghost: [
    'clamp(10rem, 4rem + 16vw, 16rem)',
    { lineHeight: '1', letterSpacing: '-0.04em' },
  ],
} satisfies Record<string, FontSize>;

/**
 * Letter-spacing overrides for text whose role does not match its casing,
 * such as an uppercase phrase inside body copy. Roles already carry their
 * own spacing; most elements need none of these.
 */
export const letterSpacing = {
  tight: '-0.04em',
  normal: '0',
  wide: '0.08em',
  caps: '0.16em',
};

/**
 * Colors by purpose. Tailwind's default palette (neutral-500, amber-400…) is
 * intentionally unavailable: pick the role, not the shade.
 */
export const colors = {
  transparent: 'transparent',
  current: 'currentColor',
  inherit: 'inherit',

  /** Backgrounds. `surface` is the page; `raised` and `hover` sit on it. */
  surface: {
    DEFAULT: '#000000',
    raised: '#0a0a0a',
    hover: '#171717',
  },
  /** Text and icons, from most to least prominent. */
  fg: {
    DEFAULT: '#ffffff',
    secondary: '#d4d4d4',
    muted: '#a3a3a3',
    subtle: '#8a8a8a',
    /** Disabled controls and decorative glyphs only; never readable copy. */
    disabled: '#525252',
  },
  /** Borders, rules and grid lines. */
  line: {
    DEFAULT: '#1a1a1a',
    strong: '#404040',
  },
  /** Stake Wars orange: our validator and brand moments. */
  accent: {
    DEFAULT: '#ff4a04',
    soft: '#ff6a2f',
    surface: '#0a0300',
  },
  /** Supply Drop gold. */
  gold: {
    DEFAULT: '#d6a84b',
    soft: '#e4bd6b',
    /** The lit edges of the 3D Supply Drop. */
    edge: '#f2c76e',
    /** The dark hull of the 3D Supply Drop before it has a winner. */
    deep: '#17130b',
  },
  /** The player's own Sectors on the Core. */
  owned: '#ffb82e',
  /** Attention: pending, cooling down, recoverable problems. */
  warning: {
    DEFAULT: '#fbbf24',
    soft: '#fcd34d',
    faint: '#fde68a',
    strong: '#f59e0b',
  },
  /** Failures and destructive or hostile actions. */
  danger: {
    DEFAULT: '#f87171',
    strong: '#c94f5a',
    line: '#b91c1c',
  },
  /** Confirmed, healthy, gained. */
  success: '#34d399',
};

/**
 * Hard offset shadows for panels floating over the 3D Core. The tinted
 * variants belong to gold (Supply Drop) and warning panels.
 */
export const boxShadow = {
  hard: '8px 8px 0 rgba(255, 255, 255, 0.08)',
  'hard-sm': '6px 6px 0 rgba(255, 255, 255, 0.08)',
  'hard-gold': '8px 8px 0 rgba(214, 168, 75, 0.12)',
  'hard-warning': '6px 6px 0 rgba(251, 191, 36, 0.12)',
  /** Status-light glows. */
  'glow-gold': '0 0 14px rgba(214, 168, 75, 0.75)',
  'glow-warning': '0 0 10px rgba(252, 211, 77, 0.65)',
  'glow-danger': '0 0 20px rgba(201, 79, 90, 0.75)',
  /** A 1px dark halo that keeps a guide legible over imagery. */
  halo: '0 0 0 1px rgba(0, 0, 0, 0.75)',
  /** A 3px gold rule on the left edge of the selected row. */
  'inset-gold': 'inset 3px 0 0 #d6a84b',
};

/** Atmospheric washes behind hero panels. */
export const backgroundImage = {
  'glow-white':
    'radial-gradient(circle at 72% 48%, rgba(255, 255, 255, 0.07), transparent 31%)',
  'glow-white-corner':
    'radial-gradient(circle at 88% 10%, rgba(255, 255, 255, 0.055), transparent 24%)',
  'glow-gold-corner':
    'radial-gradient(circle at 78% 18%, rgba(214, 168, 75, 0.06), transparent 26%)',
  'gold-sheen':
    'linear-gradient(135deg, rgba(214, 168, 75, 0.055), transparent 55%)',
  'gold-slash':
    'linear-gradient(115deg, transparent 0%, transparent 58%, rgba(214, 168, 75, 0.035) 58%, rgba(214, 168, 75, 0.035) 100%)',
};

/**
 * Chart palette for SVG and canvas marks. Series colors follow the entity:
 * the network is neutral, Stake Wars is accent, pending exits are warning.
 */
export const chartColors = {
  network: '#e5e5e5',
  featured: colors.accent.DEFAULT,
  pending: colors.warning.DEFAULT,
  grid: colors.line.DEFAULT,
  axis: colors.fg.subtle,
  crosshair: colors.fg.disabled,
  surface: colors.surface.DEFAULT,
  label: colors.fg.secondary,
} as const;

/** Pixel sizes for SVG text, matching the type roles above. */
export const chartFontSize = {
  axis: 11,
  label: 12,
} as const;
