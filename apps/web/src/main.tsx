import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { selectApp } from './appSelection';
import './index.css';

const { isGameApp, gameBasename } = selectApp(
  window.location.hostname,
  window.location.pathname
);

async function renderApp() {
  const root = createRoot(document.getElementById('root')!);

  if (isGameApp) {
    const { default: GameApp } = await import('./game/App');
    root.render(
      <StrictMode>
        <GameApp basename={gameBasename} />
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
