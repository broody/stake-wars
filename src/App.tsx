import { Analytics } from '@vercel/analytics/react';
import { Starfield } from './components/Starfield';
import { WireframeIcosphere } from './components/WireframeIcosphere';
import { Scanlines } from './components/Scanlines';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Ticker } from './components/Ticker';
import { StatsBoard } from './components/StatsBoard';
import { MechanicsCard } from './components/MechanicsCard';
import { Footer } from './components/Footer';

function App() {
  const mechanics = [
    {
      title: '01. STAKE',
      description: (
        <>
          Select a sector on the Iconosphere. Stake $STRK to capture the
          territory. Your funds are instantly{' '}
          <span className="text-fg font-bold border-b border-dotted border-dim">
            delegated to a Starknet Validator
          </span>
          , securing the actual L2 network while you fight for position.
        </>
      ),
    },
    {
      title: '02. HOLD',
      description: (
        <>
          Your image is beamed onto the face. As long as you hold the high
          ground, your delegated stake is{' '}
          <span className="text-fg font-bold border-b border-dotted border-dim">
            generating real protocol yield
          </span>{' '}
          in the background. You are now a guardian of the network.
        </>
      ),
    },
    {
      title: '03. CLAIM',
      description: (
        <>
          Extract your tribute. The yield is derived from{' '}
          <span className="text-fg font-bold border-b border-dotted border-dim">
            validator rewards
          </span>
          , not token inflation. If you are displaced by a higher bidder,
          re-deploy your funds instantly to strike a new target.
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

      {/* Vercel Analytics */}
      <Analytics />
    </>
  );
}

export default App;
