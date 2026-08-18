export const Hero = () => {
  return (
    <section className="h-screen flex flex-col justify-center items-center text-center relative px-5">
      <h1 className="font-main text-[clamp(3rem,8vw,8rem)] leading-[0.9] uppercase mix-blend-exclusion font-black">
        That's No Moon.
      </h1>
      <h2 className="font-mono text-[clamp(0.8rem,1.5vw,1.2rem)] mt-5 mb-10 text-[#aaa] tracking-wider text-left md:text-center">
        <span className="block md:inline">/// TARGET: 2,000 SECTORS</span>
        <span className="hidden md:inline"> &nbsp; </span>
        <span className="block md:inline">/// OBJECTIVE: HIGH GROUND</span>
        <span className="hidden md:inline"> &nbsp; </span>
        <span className="block md:inline">/// YIELD: ACTIVE</span>
      </h2>
      <button className="btn-wip px-10 py-4 text-[1.2rem] border border-dotted bg-black/50 text-[#aaa] font-mono uppercase cursor-default relative overflow-hidden transition-all duration-200">
        <span>[ COMING SOON ]</span>
        <span className="absolute top-0 left-0 bottom-0 w-0 bg-white/10 animate-loading" />
      </button>
    </section>
  );
};
