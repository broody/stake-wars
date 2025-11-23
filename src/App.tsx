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
      description:
        'Select a triangular face on the Iconosphere. Stake $STRK to capture the territory. Highest bidder takes the high ground immediately.',
    },
    {
      title: '02. HOLD',
      description:
        'Your image is beamed onto the face. As long as you hold the territory, your staked tokens are delegated to a Starknet validator.',
    },
    {
      title: '03. CLAIM',
      description:
        'Earn real yield split between the active warlords. Displaced? Re-deploy your funds instantly to a new target. No waiting.',
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

export default App;
