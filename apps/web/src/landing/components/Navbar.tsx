import { useState } from 'react';

export const Navbar = () => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <nav className="flex justify-between items-center px-5 py-4 border-b border-dim bg-black/80 backdrop-blur-sm fixed w-full top-0 z-[100]">
      <div className="brand flex items-center">
        <span className="font-bold text-[1.2rem] tracking-tight">
          STAKEWARS_<span className="animate-blinker">|</span>
        </span>
      </div>

      <div className="relative">
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="focus:outline-none hover:opacity-80 transition-opacity"
        >
          <img
            src="/stakewars.png"
            alt="Stake Wars Logo"
            className="w-12 h-12"
          />
        </button>

        {isDropdownOpen && (
          <div className="absolute right-0 top-full mt-2 w-max bg-black border border-dim p-4 shadow-xl z-50">
            <div className="text-[0.8rem] text-[#aaa] whitespace-nowrap">
              SYSTEM STATUS: LIVE
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};
