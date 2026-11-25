/**
 * A local page that funds the Survivor house bot wallets from a connected
 * wallet in one multicall. Run it with `pnpm fund-bots` from apps/web. It is
 * not one of the site's build inputs, so it never ships.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StakeWarsStarknetProvider } from '../../src/game/providers/StarknetProvider';
import { FundBots } from './FundBots';
import '../../src/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StakeWarsStarknetProvider>
      <FundBots />
    </StakeWarsStarknetProvider>
  </StrictMode>
);
