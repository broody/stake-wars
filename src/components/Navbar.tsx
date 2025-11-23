export const Navbar = () => {
  return (
    <nav className="flex justify-between items-center px-10 py-5 border-b border-dim bg-black/80 backdrop-blur-sm fixed w-full top-0 z-[100]">
      <div className="brand font-bold text-[1.2rem] tracking-tight">
        STAKEWARS_<span className="animate-blinker">|</span>
      </div>
      <div className="status status-offline text-[0.8rem] text-dim hidden md:block animate-pulse-slow">
        SYSTEM STATUS: OFFLINE
      </div>
      <a
        href="#"
        className="btn-connect bg-transparent text-dim px-5 py-2.5 font-bold font-mono border border-dim uppercase cursor-not-allowed opacity-70"
      >
        [ DISCONNECTED ]
      </a>
    </nav>
  );
};
