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

function GameApp() {
  return (
    <StakeWarsStarknetProvider>
      <ErrorBoundary>
        <Router>
          <WalletProvider>
            <TransactionToastProvider>
              <ControlPointProvider>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/gallery" element={<Gallery />} />
                    <Route path="/profile" element={<Profile />} />
                  </Routes>
                </Layout>
              </ControlPointProvider>
            </TransactionToastProvider>
          </WalletProvider>
        </Router>
      </ErrorBoundary>
    </StakeWarsStarknetProvider>
  );
}

export default GameApp;
