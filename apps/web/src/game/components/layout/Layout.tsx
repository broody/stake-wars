import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { WalletButton } from '../ui/WalletButton';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();

  const navLinks = [
    { path: '/', label: 'THE CORE' },
    { path: '/staking', label: 'STAKING' },
    { path: '/profile', label: 'PROFILE' },
  ];

  return (
    <div className="w-full h-screen flex flex-col bg-bg font-mono">
      {/* Navigation */}
      <nav className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-bg/80 to-transparent border-b border-grid">
        <div className="px-4">
          <div className="grid h-16 grid-cols-[auto_1fr_auto] items-center gap-3">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-2">
              <span className="hidden text-sm font-bold tracking-wider text-fg sm:inline sm:text-xl">
                STAKE<span className="text-dim">//</span>WARS
              </span>
              <span className="text-sm font-bold tracking-wider text-fg sm:hidden">
                S<span className="text-dim">//</span>W
              </span>
            </Link>

            {/* Nav Links */}
            <div className="flex items-center justify-center gap-3 sm:gap-6 md:absolute md:left-1/2 md:-translate-x-1/2 md:gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={cn(
                    'border-b border-transparent py-1 text-[9px] tracking-[0.12em] text-dim transition-colors hover:text-fg sm:text-xs sm:tracking-widest md:text-sm',
                    location.pathname === link.path &&
                      'text-fg border-b border-fg'
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center justify-end">
              <WalletButton />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full h-full overflow-hidden">{children}</main>
    </div>
  );
};
