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
      <a
        href="/play"
        className="group relative overflow-hidden border border-fg bg-black/70 px-10 py-4 font-mono text-[1.2rem] uppercase text-fg transition-colors duration-200 hover:bg-fg hover:text-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
      >
        <span className="relative z-10">[ Enter ]</span>
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1 bg-fg transition-[width] duration-300 group-hover:w-full motion-reduce:transition-none"
        />
      </a>
    </section>
  );
};
