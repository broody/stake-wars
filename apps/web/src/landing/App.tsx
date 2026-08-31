import { useId, useState, type ReactNode } from 'react';
import { Starfield } from './components/Starfield';
import { WireframeIcosphere } from './components/WireframeIcosphere';
import { Scanlines } from './components/Scanlines';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Ticker } from './components/Ticker';
import { StatsBoard } from './components/StatsBoard';
import { MechanicsCard } from './components/MechanicsCard';
import { Footer } from './components/Footer';

function FaqItem({
  question,
  children,
  bordered = true,
}: {
  question: string;
  children: ReactNode;
  bordered?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const answerId = useId();

  return (
    <div className={bordered ? 'border-t border-dim' : undefined}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={answerId}
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full cursor-pointer items-start justify-between gap-6 p-[30px] text-left transition-colors hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-1px] focus-visible:outline-white md:p-10"
      >
        <span className="text-[1.15rem] font-bold text-fg">{question}</span>
        <span
          aria-hidden="true"
          className="shrink-0 text-[0.9rem] tracking-widest text-[#888]"
        >
          {isOpen ? '[−]' : '[+]'}
        </span>
      </button>
      <div
        id={answerId}
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="max-w-3xl px-[30px] pb-[30px] text-[1rem] leading-[1.7] text-[#ccc] md:px-10 md:pb-10">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function LandingApp() {
  const mechanics = [
    {
      title: '01. STAKE',
      description: (
        <>
          Stake $STRK with the Stake Wars validator to generate{' '}
          <span className="text-fg font-bold border-b border-dotted border-dim">
            FORCE
          </span>
          . Use FORCE to capture Sectors or initiate Challenges.
        </>
      ),
    },
    {
      title: '02. HOLD',
      description: (
        <>
          A custom image can be beamed onto the Sector. As long as you hold the
          high ground, your staked $STRK is{' '}
          <span className="text-fg font-bold border-b border-dotted border-dim">
            generating real protocol yield
          </span>{' '}
          in the background. You are now a guardian of the network.
        </>
      ),
    },
    {
      title: '03. CHALLENGE',
      description: (
        <>
          Challenge an occupied Sector by committing FORCE. Every escalation
          restarts the response window, and any Operator can{' '}
          <span className="text-fg font-bold border-b border-dotted border-dim">
            take the lead
          </span>{' '}
          until the opposition runs out of FORCE or chooses to stop. Displaced
          losing commitments are permanently spent.
        </>
      ),
    },
  ];

  return (
    <>
      {/* Visual Layers */}
      <Starfield />
      <WireframeIcosphere />
      <Scanlines />

      {/* Navigation */}
      <Navbar />

      {/* Hero Section */}
      <Hero />

      {/* Ticker */}
      <Ticker />

      {/* Main Content */}
      <div className="container max-w-[1200px] mx-auto px-5 py-20">
        {/* Stats Board */}
        <StatsBoard />

        {/* Mechanics Grid */}
        <div className="mechanics mb-16 grid grid-cols-1 gap-10 md:grid-cols-3">
          {mechanics.map((mechanic, index) => (
            <MechanicsCard
              key={index}
              title={mechanic.title}
              description={mechanic.description}
            />
          ))}
        </div>

        {/* FAQ */}
        <section
          aria-labelledby="faq-heading"
          className="mb-[100px] border-y border-dim bg-black/60"
        >
          <div className="grid md:grid-cols-[0.32fr_1fr]">
            <header className="border-b border-dim p-[30px] md:border-b-0 md:border-r">
              <div className="mb-2 text-[0.75rem] tracking-[0.24em] text-[#888]">
                FIELD MANUAL
              </div>
              <h2
                id="faq-heading"
                className="text-[2rem] font-bold tracking-tight"
              >
                FAQ
              </h2>
            </header>

            <div>
              <FaqItem question="What is FORCE?" bordered={false}>
                <p>
                  FORCE represents your usable power in Stake Wars. It is
                  calculated from the $STRK you stake with the Stake Wars
                  validator and stays synchronized with your current staking
                  position. Use FORCE to capture Sectors and initiate or contest
                  Challenges. Currently, FORCE is tracked within the Stake Wars
                  contract rather than issued as a separate ERC-20 token.
                </p>
              </FaqItem>

              <FaqItem question="Which staking tokens are supported?">
                <p>
                  Only $STRK is supported for now. $BTC will eventually be
                  supported, with other utilities in the game.
                </p>
              </FaqItem>

              <FaqItem question="Is Stake Wars running an official Starknet validator?">
                <p>
                  Yes. All game staking goes directly to our{' '}
                  <a
                    href="https://voyager.online/staking?validator=0x026232d459668b7183dd54e7cddccd27e168882b597743e233645cefa61eb1eb"
                    target="_blank"
                    rel="noreferrer"
                    className="border-b border-dotted border-dim font-bold text-fg transition-colors hover:border-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    live Starknet validator
                  </a>
                  . Staking is fully non-custodial: even if Stake Wars shuts
                  down, users can always unstake through the official Starknet
                  Staking contract and retrieve their $STRK.
                </p>
              </FaqItem>

              <FaqItem question="Can I stake or unstake directly through the official Starknet Staking contract instead of using the in-game UI?">
                <p>
                  Yes. Stake Wars reads your current delegated stake from the
                  official Starknet Staking contract, so your FORCE updates
                  automatically no matter where you stake. However, beginning an
                  unstaking withdrawal permanently retires your address because
                  that FORCE may already have been spent. All its Sectors and
                  FORCE are immediately zeroed, and the address cannot
                  participate again.
                </p>
              </FaqItem>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <Footer />
    </>
  );
}

export default LandingApp;
