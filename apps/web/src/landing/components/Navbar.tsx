import { useState } from 'react';
import { Panel } from '../../ui';

export const Navbar = () => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <nav className="flex justify-between items-center px-5 py-4 border-b border-line-strong bg-surface/80 backdrop-blur-sm fixed w-full top-0 z-[100]">
      <div className="flex items-center">
        <span className="font-bold text-heading">
          STAKEWARS<span className="animate-blinker">_</span>
        </span>
      </div>

      <div className="relative">
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="hover:opacity-80 transition-opacity"
        >
          <img
            src="/stakewars.svg"
            alt="Stake Wars Logo"
            className="w-12 h-12"
          />
        </button>

        {isDropdownOpen && (
          <Panel
            as="div"
            tone="strong"
            className="absolute right-0 top-full mt-2 w-max p-4 shadow-xl z-50"
          >
            <div className="text-caption text-fg-muted whitespace-nowrap">
              SYSTEM STATUS: LIVE
            </div>
          </Panel>
        )}
      </div>
    </nav>
  );
};
