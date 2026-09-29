import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
import {
  backgroundImage,
  boxShadow,
  colors,
  fontSize,
  letterSpacing,
} from './src/ui/tokens';

/**
 * Colors, type sizes and letter spacing replace Tailwind's defaults instead of
 * extending them, so only Stake Wars tokens exist. Edit src/ui/tokens.ts.
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // /play/ui renders every token by name, which Tailwind cannot see statically.
  safelist: [
    ...Object.keys(fontSize).map((role) => `text-${role}`),
    ...Object.keys(letterSpacing).map((name) => `tracking-${name}`),
    ...Object.keys(boxShadow).map((name) => `shadow-${name}`),
    ...Object.keys(backgroundImage).map((name) => `bg-${name}`),
  ],
  theme: {
    colors,
    fontSize,
    letterSpacing,
    extend: {
      backgroundImage,
      boxShadow,
      fontFamily: {
        main: ['Inter', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      },
      animation: {
        blinker: 'blinker 1s linear infinite',
        'pulse-slow': 'pulse 3s infinite',
        marquee: 'marquee 30s linear infinite',
        loading: 'loading 3s ease-in-out infinite',
      },
      keyframes: {
        blinker: {
          '50%': { opacity: '0' },
        },
        marquee: {
          '0%': { transform: 'translate3d(0, 0, 0)' },
          '100%': { transform: 'translate3d(-50%, 0, 0)' },
        },
        loading: {
          '0%': { width: '0%' },
          '50%': { width: '40%' },
          '100%': { width: '0%' },
        },
      },
    },
  },
  plugins: [
    // Hover styles that never apply to a disabled button (see buttonStyles).
    plugin(({ addVariant }) => {
      addVariant('hover-enabled', '&:not(:disabled):hover');
    }),
  ],
} satisfies Config;
