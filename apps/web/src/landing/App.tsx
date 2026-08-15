import { Starfield } from './components/Starfield';
import { WireframeIcosphere } from './components/WireframeIcosphere';
import { Scanlines } from './components/Scanlines';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Ticker } from './components/Ticker';
import { StatsBoard } from './components/StatsBoard';
import { MechanicsCard } from './components/MechanicsCard';
import { Footer } from './components/Footer';

function LandingApp() {
  const mechanics = [
    {
      title: '01. STAKE',
      description: (
        <>
          Select a{' '}
          <span className="text-fg font-bold border-b border-dotted border-dim">
            Control Point
          </span>{' '}
          on the Core. Choose how much of your available delegated $STRK to
          allocate through the official Starknet staking system. One unit of
          delegation can back only one position.
        </>
      ),
    },
    {
      title: '02. HOLD',
      description: (
        <>
          A custom image can be beamed onto the Control Point. As long as you
          hold the high ground, your staked STRK is{' '}
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
          Attack an occupied point with an encrypted maximum bid during one
          fixed 3-hour window. The{' '}
          <span className="text-fg font-bold border-b border-dotted border-dim">
            winner takes the point
          </span>{' '}
          but commits only the runner-up price. Losing and excess bid collateral
          unlock after settlement.
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
        <div className="mechanics grid grid-cols-1 md:grid-cols-3 gap-10 mb-[100px]">
          {mechanics.map((mechanic, index) => (
            <MechanicsCard
              key={index}
              title={mechanic.title}
              description={mechanic.description}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </>
  );
}

export default LandingApp;
