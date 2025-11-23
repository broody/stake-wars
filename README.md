# STAKEWARS.GG

A futuristic, cyberpunk-themed landing page for StakeWars - a Starknet-based staking game.

## Tech Stack

- **React 18** - Modern UI library
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Vite** - Fast build tool and dev server

## Features

- 🌟 Animated starfield background
- 🌐 Rotating wireframe sphere visualization
- 📺 Retro CRT scanline effects
- 🎯 Responsive design
- ⚡ Optimized canvas animations with React hooks

## Getting Started

### Install Dependencies

```bash
pnpm install
```

### Development Server

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
pnpm build
```

### Preview Production Build

```bash
pnpm preview
```

## Project Structure

```
src/
├── components/
│   ├── Footer.tsx           # Footer component
│   ├── Hero.tsx            # Hero section
│   ├── MechanicsCard.tsx   # Game mechanics cards
│   ├── Navbar.tsx          # Navigation bar
│   ├── Scanlines.tsx       # CRT scanline overlay
│   ├── Starfield.tsx       # Animated starfield background
│   ├── StatsBoard.tsx      # Statistics dashboard
│   ├── Ticker.tsx          # Scrolling ticker text
│   └── WireframeSphere.tsx # 3D rotating sphere
├── App.tsx                 # Main app component
├── main.tsx               # App entry point
└── index.css              # Global styles
```

## Customization

The theme colors and animations can be customized in `tailwind.config.js`:

```javascript
colors: {
  bg: '#000000',
  fg: '#ffffff',
  dim: '#444444',
  grid: '#1a1a1a',
}
```

## License

© 2024 STAKEWARS.GG // POWERED BY STARKNET

