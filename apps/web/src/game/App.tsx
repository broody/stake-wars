import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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
                        <Routes>
                          <Route path="/" element={<Home />} />
                          <Route path="/gallery" element={<Gallery />} />
                          <Route path="/staking" element={<Staking />} />
                          <Route path="/arbiter" element={<Arbiter />} />
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
