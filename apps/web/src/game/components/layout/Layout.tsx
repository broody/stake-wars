import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWallet } from '../../contexts/WalletContext';
import { cn } from '../../utils/cn';
import { ActivityButton } from '../ui/ActivityButton';
import { ActivityModal } from '../ui/ActivityModal';
import { WalletButton } from '../ui/WalletButton';
import { YieldButton } from '../ui/YieldButton';
import { YieldModal } from '../ui/YieldModal';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { address } = useWallet();
  const [isActivityOpen, setActivityOpen] = useState(false);

  const closeActivity = useCallback(() => setActivityOpen(false), []);

  useEffect(() => {
    if (!address) closeActivity();
  }, [address, closeActivity]);

  const navLinks = [
    { path: '/', label: 'THE CORE' },
    { path: '/gallery', label: 'GALLERY' },
    { path: '/profile', label: 'PROFILE' },
  ];

  return (
    <div className="w-full h-screen flex flex-col bg-bg font-mono">
      {/* Navigation */}
      <nav className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-bg/80 to-transparent border-b border-grid">
        <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-2">
              <span className="text-sm font-bold tracking-wider text-fg sm:text-xl">
                STAKE<span className="text-dim">//</span>WARS
              </span>
            </Link>

            {/* Nav Links */}
            <div className="hidden space-x-8 md:flex">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={cn(
                    'text-dim hover:text-fg transition-colors text-sm tracking-widest',
                    location.pathname === link.path &&
                      'text-fg border-b border-fg'
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-1 sm:gap-3">
              {address ? (
                <>
                  <ActivityButton onClick={() => setActivityOpen(true)} />
                  <YieldButton />
                </>
              ) : null}
              <WalletButton />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full h-full overflow-hidden">{children}</main>
      <YieldModal />
      <ActivityModal
        isOpen={isActivityOpen}
        operator={address}
        onClose={closeActivity}
      />
    </div>
  );
};
