import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ControlPointProvider } from './contexts/ControlPointContext';
import { WalletProvider } from './contexts/WalletContext';
import { Layout } from './components/layout/Layout';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Home } from './pages/Home';
import { Gallery } from './pages/Gallery';
import { Profile } from './pages/Profile';
import { StakeWarsStarknetProvider } from './providers/StarknetProvider';
import { TransactionToastProvider } from './contexts/TransactionToastContext';
import { YieldProvider } from './contexts/YieldContext';

const OwnershipLab = lazy(() =>
  import('./pages/OwnershipLab').then((module) => ({
    default: module.OwnershipLab,
  }))
);

function GameApp() {
  return (
    <StakeWarsStarknetProvider>
      <ErrorBoundary>
        <Router>
          <WalletProvider>
            <TransactionToastProvider>
              <ControlPointProvider>
                <YieldProvider>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/gallery" element={<Gallery />} />
                      <Route path="/profile" element={<Profile />} />
                      <Route
                        path="/ownership-lab"
                        element={
                          <Suspense fallback={null}>
                            <OwnershipLab />
                          </Suspense>
                        }
                      />
                    </Routes>
                  </Layout>
                </YieldProvider>
              </ControlPointProvider>
            </TransactionToastProvider>
          </WalletProvider>
        </Router>
      </ErrorBoundary>
    </StakeWarsStarknetProvider>
  );
}

export default GameApp;
