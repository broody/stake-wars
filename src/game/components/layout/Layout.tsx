import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../utils/cn';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();

  const navLinks = [
    { path: '/', label: 'THE CORE' },
    { path: '/gallery', label: 'GALLERY' },
    { path: '/profile', label: 'PROFILE' },
  ];

  return (
    <div className="w-full h-screen flex flex-col bg-bg font-mono">
      {/* Navigation */}
      <nav className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-bg/80 to-transparent border-b border-grid">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-2">
              <span className="text-fg text-xl font-bold tracking-wider">
                STAKE<span className="text-dim">//</span>WARS
              </span>
            </Link>

            {/* Nav Links */}
            <div className="flex space-x-8">
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

            {/* Wallet Connect Button */}
            <button className="px-4 py-2 border border-fg text-fg hover:bg-fg hover:text-bg transition-colors text-sm tracking-wider">
              {'> CONNECT_WALLET'}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full h-full overflow-hidden">{children}</main>
    </div>
  );
};
