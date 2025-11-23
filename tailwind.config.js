/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#000000',
        fg: '#ffffff',
        dim: '#444444',
        grid: '#1a1a1a',
      },
      fontFamily: {
        main: ['Inter', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      },
      animation: {
        'blinker': 'blinker 1s linear infinite',
        'pulse-slow': 'pulse 3s infinite',
        'marquee': 'marquee 30s linear infinite',
        'loading': 'loading 3s ease-in-out infinite',
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
}

