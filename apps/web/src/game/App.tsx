import { lazy, Suspense } from 'react';
import {
  BrowserRouter as Router,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { SectorProvider } from './contexts/SectorContext';
import { WalletProvider } from './contexts/WalletContext';
import { Layout } from './components/layout/Layout';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Home } from './pages/Home';
import { Gallery } from './pages/Gallery';
import { Arbiter } from './pages/Arbiter';
import { Operator } from './pages/Operator';
import { Staking } from './pages/Staking';
import { StakeWarsStarknetProvider } from './providers/StarknetProvider';
import { TransactionToastProvider } from './contexts/TransactionToastContext';
import { YieldProvider } from './contexts/YieldContext';
import { SectorImageProvider } from './contexts/SectorImageContext';
import { ArbiterProvider } from './contexts/ArbiterContext';

const CoreLab = lazy(() =>
  import('./pages/OwnershipLab').then((module) => ({
    default: module.CoreLab,
  }))
);

interface GameAppProps {
  basename?: string;
}

function GamePages() {
  const location = useLocation();
  const isCoreActive = location.pathname === '/';

  return (
    <div className="relative h-full w-full">
      <div
        className={`absolute inset-0 ${
          isCoreActive ? 'visible' : 'invisible pointer-events-none'
        }`}
        aria-hidden={!isCoreActive}
        inert={!isCoreActive}
      >
        <Home active={isCoreActive} />
      </div>

      {isCoreActive ? null : (
        <div className="absolute inset-0 z-[1]">
          <Routes>
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/staking" element={<Staking />} />
            <Route path="/arbiter" element={<Arbiter />} />
            <Route path="/arbiter/history" element={<Arbiter />} />
            <Route path="/operator" element={<Operator />} />
            <Route
              path="/core-lab"
              element={
                <Suspense fallback={null}>
                  <CoreLab />
                </Suspense>
              }
            />
          </Routes>
        </div>
      )}
    </div>
  );
}

function GameApp({ basename }: GameAppProps) {
  return (
    <StakeWarsStarknetProvider>
      <ErrorBoundary>
        <Router basename={basename}>
          <WalletProvider>
            <TransactionToastProvider>
              <SectorProvider>
                <SectorImageProvider>
                  <ArbiterProvider>
                    <YieldProvider>
                      <Layout>
                        <GamePages />
                      </Layout>
                    </YieldProvider>
                  </ArbiterProvider>
                </SectorImageProvider>
              </SectorProvider>
            </TransactionToastProvider>
          </WalletProvider>
        </Router>
      </ErrorBoundary>
    </StakeWarsStarknetProvider>
  );
}

export default GameApp;
