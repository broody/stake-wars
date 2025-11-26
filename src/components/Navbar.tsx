export const Navbar = () => {
  return (
    <nav className="flex justify-between items-center px-5 py-4 border-b border-dim bg-black/80 backdrop-blur-sm fixed w-full top-0 z-[100]">
      <div className="brand flex items-center gap-3 md:gap-3 justify-between md:justify-start w-full md:w-auto flex-row-reverse md:flex-row">
        <img src="/stakewars.png" alt="StakeWars Logo" className="w-12 h-12" />
        <span className="font-bold text-[1.2rem] tracking-tight">
          STAKEWARS_<span className="animate-blinker">|</span>
        </span>
      </div>
      <div className="status status-offline text-[0.8rem] text-dim hidden md:block animate-pulse-slow">
        SYSTEM STATUS: OFFLINE
      </div>
    </nav>
  );
};
