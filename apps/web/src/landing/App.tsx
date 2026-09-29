import { useId, useState, type ReactNode } from 'react';
import { Starfield } from './components/Starfield';
import { WireframeIcosphere } from './components/WireframeIcosphere';
import { Scanlines } from './components/Scanlines';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Ticker } from './components/Ticker';
import { StatsBoard } from './components/StatsBoard';
import { MechanicsCard } from './components/MechanicsCard';
import { SupplyDropFeature } from './components/SupplyDropFeature';
import { Footer } from './components/Footer';
import { buttonStyles, Eyebrow, ExternalLink, Panel } from '../ui';

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
    <div className={bordered ? 'border-t border-line-strong' : undefined}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={answerId}
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full cursor-pointer items-start justify-between gap-6 p-[30px] text-left transition-colors hover:bg-fg/[0.03] focus-visible:outline-offset-[-1px] md:p-10"
      >
        <span className="text-lead font-bold text-fg">{question}</span>
        <span aria-hidden="true" className="shrink-0 text-label text-fg-subtle">
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
          <div className="max-w-3xl px-[30px] pb-[30px] text-lead text-fg-secondary md:px-10 md:pb-10">
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
          Stake $STRK to generate{' '}
          <span className="text-fg font-bold border-b border-dotted border-line-strong">
            FORCE
          </span>
          . Use FORCE to capture Sectors.
        </>
      ),
    },
    {
      title: '02. HOLD',
      description: (
        <>
          Beam a custom image onto your Sector for as long as you hold it. Your
          staked $STRK keeps earning{' '}
          <span className="text-fg font-bold border-b border-dotted border-line-strong">
            real protocol yield
          </span>
          .
        </>
      ),
    },
    {
      title: '03. CONTEST',
      description: (
        <>
          Commit{' '}
          <span className="text-fg font-bold border-b border-dotted border-line-strong">
            10% more FORCE
          </span>{' '}
          than a Sector&apos;s defense to take it. The previous owner gets their
          FORCE back to use again.
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
        <div className="mb-16 grid grid-cols-1 gap-10 md:grid-cols-3">
          {mechanics.map((mechanic, index) => (
            <MechanicsCard
              key={index}
              title={mechanic.title}
              description={mechanic.description}
            />
          ))}
        </div>

        {/* Beacon auction */}
        <Panel
          aria-labelledby="beacon-heading"
          tone="strong"
          className="mb-16 overflow-hidden bg-surface/70 lg:grid lg:grid-cols-[1.35fr_0.65fr]"
        >
          <a
            href="/play/beacon"
            aria-label="View the Beacon"
            className="relative block min-h-72 overflow-hidden border-b border-line-strong bg-surface focus-visible:outline-offset-[-1px] lg:border-b-0 lg:border-r"
          >
            <img
              src="https://assets.stakewars.gg/site/beacon/v1/beacon-orbit-poster.jpg"
              alt="The Stake Wars Core with the Beacon orbiting above it"
              loading="lazy"
              className="h-full min-h-72 w-full object-cover"
            />
            <video
              aria-hidden="true"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              poster="https://assets.stakewars.gg/site/beacon/v1/beacon-orbit-poster.jpg"
              className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
            >
              <source
                src="https://assets.stakewars.gg/site/beacon/v1/beacon-orbit.mp4"
                type="video/mp4"
              />
            </video>
          </a>

          <div className="flex flex-col justify-center px-[30px] py-10 md:px-10 lg:py-12">
            <h2 id="beacon-heading" className="text-display font-bold">
              THE BEACON
            </h2>
            <p className="mt-6 text-lead text-fg">
              Win the signal above the Core.
            </p>
            <p className="mt-4 max-w-xl text-body text-fg-muted">
              Operators outbid each other in an open on-chain auction for the
              Beacon—the lone broadcast orbiting the battlefield. The winner
              publishes an image, message, and link for every commander to see.
            </p>
            <a
              href="/play/beacon"
              className={buttonStyles({
                variant: 'outline',
                tone: 'gold',
                className: 'mt-8 w-fit',
              })}
            >
              OPEN THE BEACON
            </a>
          </div>
        </Panel>

        {/* Supply Drop */}
        <SupplyDropFeature />

        {/* FAQ */}
        <section
          aria-labelledby="faq-heading"
          className="mb-[100px] border-y border-line-strong bg-surface/60"
        >
          <div className="grid md:grid-cols-[0.32fr_1fr]">
            <header className="border-b border-line-strong p-[30px] md:border-b-0 md:border-r">
              <Eyebrow className="mb-2">FIELD MANUAL</Eyebrow>
              <h2 id="faq-heading" className="text-display font-bold">
                FAQ
              </h2>
            </header>

            <div>
              <FaqItem question="What is FORCE?" bordered={false}>
                <p>
                  FORCE represents your usable power in Stake Wars. It is
                  calculated from the $STRK you stake with the Stake Wars
                  validator and stays synchronized with your current staking
                  position. Use FORCE to capture and take over Sectors.
                  Currently, FORCE is tracked within the Stake Wars contract
                  rather than issued as a separate ERC-20 token.
                </p>
              </FaqItem>

              <FaqItem question="What is the Beacon?">
                <p>
                  The Beacon is a billboard orbiting the Core. Operators compete
                  for control in an <strong>open ascending auction</strong>:
                  every bid is public, each new bid must beat the lead by 10%,
                  and outbid STRK is refunded immediately. A late bid extends
                  the clock so rivals can answer. The winner can publish a
                  transmission with an image, a short description, and a
                  destination link.
                </p>
              </FaqItem>

              <FaqItem question="What is a Supply Drop?">
                <p>
                  A Supply Drop is a prize round funded by a portion of Stake
                  Wars pool commissions. When the round closes, one Sector is
                  selected at random, and the Operator who controlled it at the
                  deadline wins the prize. Every Sector you control gives you
                  another chance to win. If the selected Sector has no eligible
                  controller, the prize rolls over into another round.
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
                  <ExternalLink
                    href="https://voyager.online/staking?validator=0x026232d459668b7183dd54e7cddccd27e168882b597743e233645cefa61eb1eb"
                    className="font-bold text-fg"
                  >
                    live Starknet validator
                  </ExternalLink>
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
                  unstaking withdrawal permanently retires your address. All its
                  Sectors and FORCE are immediately zeroed, and the address
                  cannot participate again.
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
