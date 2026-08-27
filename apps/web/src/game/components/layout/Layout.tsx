import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { WalletButton } from '../ui/WalletButton';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const coreTrackingSearch =
    new URLSearchParams(location.search).get('tracking') === 'arbiter'
      ? '?tracking=arbiter'
      : '';
  const coreAwareTarget = (path: string) => ({
    pathname: path,
    search: coreTrackingSearch,
  });

  const navLinks = [
    { path: '/', label: 'CORE' },
    { path: '/staking', label: 'FORCE' },
    { path: '/arbiter', label: 'ARBITER' },
    { path: '/operator', label: 'OPERATOR' },
  ];

  return (
    <div className="w-full h-screen flex flex-col bg-bg font-mono">
      {/* Navigation */}
      <nav className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-bg/80 to-transparent border-b border-grid">
        <div className="px-4">
          <div className="grid h-16 grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[auto_1fr_auto] sm:gap-3">
            {/* Logo */}
            <Link
              to={coreAwareTarget('/')}
              data-preserve-core-tracking
              className="hidden items-center space-x-2 sm:flex"
            >
              <span className="text-sm font-bold tracking-wider text-fg sm:text-xl">
                STAKE<span className="text-dim">//</span>WARS
              </span>
            </Link>

            {/* Nav Links */}
            <div className="flex items-center justify-start gap-2 sm:justify-center sm:gap-5 md:absolute md:left-1/2 md:-translate-x-1/2 md:gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={coreAwareTarget(link.path)}
                  data-preserve-core-tracking
                  className={cn(
                    'border-b border-transparent py-1 text-[8px] tracking-[0.08em] text-dim transition-colors hover:text-fg sm:text-xs sm:tracking-widest md:text-sm',
                    (location.pathname === link.path ||
                      (link.path !== '/' &&
                        location.pathname.startsWith(`${link.path}/`))) &&
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
