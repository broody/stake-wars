import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { SectorProvider } from './contexts/SectorContext';
import { WalletProvider } from './contexts/WalletContext';
import { Layout } from './components/layout/Layout';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Home } from './pages/Home';
import { Gallery } from './pages/Gallery';
import { Profile } from './pages/Profile';
import { Staking } from './pages/Staking';
import { StakeWarsStarknetProvider } from './providers/StarknetProvider';
import { TransactionToastProvider } from './contexts/TransactionToastContext';
import { YieldProvider } from './contexts/YieldContext';
import { SectorImageProvider } from './contexts/SectorImageContext';

const CoreLab = lazy(() =>
  import('./pages/OwnershipLab').then((module) => ({
    default: module.CoreLab,
  }))
);

function GameApp() {
  return (
    <StakeWarsStarknetProvider>
      <ErrorBoundary>
        <Router>
          <WalletProvider>
            <TransactionToastProvider>
              <SectorProvider>
                <SectorImageProvider>
                  <YieldProvider>
                    <Layout>
                      <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/gallery" element={<Gallery />} />
                        <Route path="/staking" element={<Staking />} />
                        <Route path="/profile" element={<Profile />} />
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
