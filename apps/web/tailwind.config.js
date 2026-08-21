/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Command Terminal aesthetic (primary)
        bg: '#000000',
        fg: '#ffffff',
        dim: '#444444',
        grid: '#1a1a1a',
        alert: 'var(--color-alert)',
        // Accent colors for game elements
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
      },
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
  plugins: [],
};
