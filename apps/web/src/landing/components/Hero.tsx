import { buttonStyles } from '../../ui';

export const Hero = () => {
  return (
    <section className="h-screen flex flex-col justify-center items-center text-center relative px-5">
      <h1 className="font-main text-hero uppercase mix-blend-exclusion font-black">
        That's No Moon.
      </h1>
      <h2 className="font-mono text-lead tracking-wide mt-5 mb-10 text-fg-muted text-left md:text-center">
        <span className="block md:inline">/// TARGET: 2,000 SECTORS</span>
        <span className="hidden md:inline"> &nbsp; </span>
        <span className="block md:inline">/// OBJECTIVE: HIGH GROUND</span>
        <span className="hidden md:inline"> &nbsp; </span>
        <span className="block md:inline">/// YIELD: ACTIVE</span>
      </h2>
      <a
        href="/play"
        className={buttonStyles({
          variant: 'outline',
          size: 'xl',
          className:
            'group relative overflow-hidden border-fg bg-surface/70 text-fg duration-200 focus-visible:outline-2 focus-visible:outline-offset-4',
        })}
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
