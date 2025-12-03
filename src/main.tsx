import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import './index.css';

// Determine which app to render based on hostname
const hostname = window.location.hostname;
const searchParams = new URLSearchParams(window.location.search);

// Check if we're on the game subdomain or using ?app=game for local dev
const isGameApp =
  hostname === 'play.stakewars.gg' ||
  hostname.startsWith('play.') ||
  searchParams.get('app') === 'game';

async function renderApp() {
  const root = createRoot(document.getElementById('root')!);

  if (isGameApp) {
    const { default: GameApp } = await import('./game/App');
    root.render(
      <StrictMode>
        <GameApp />
        <Analytics />
      </StrictMode>
    );
  } else {
    const { default: LandingApp } = await import('./landing/App');
    root.render(
      <StrictMode>
        <LandingApp />
        <Analytics />
      </StrictMode>
    );
  }
}

renderApp();
