import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { NFTProvider } from './contexts/NFTContext';
import { WalletProvider } from './contexts/WalletContext';
import { Layout } from './components/layout/Layout';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Home } from './pages/Home';
import { Gallery } from './pages/Gallery';
import { Profile } from './pages/Profile';

function GameApp() {
  return (
    <ErrorBoundary>
      <Router>
        <WalletProvider>
          <NFTProvider>
            <AppProvider>
              <Layout>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/gallery" element={<Gallery />} />
                  <Route path="/profile" element={<Profile />} />
                </Routes>
              </Layout>
            </AppProvider>
          </NFTProvider>
        </WalletProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default GameApp;
