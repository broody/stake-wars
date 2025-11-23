export const Ticker = () => {
  const tickerText =
    'INITIALIZING UPLINK... CALIBRATING LENSES... LOADING ASSETS... WARLORDS STAND BY... YIELD GENERATORS CHARGING... PROTOCOL SECURITY CHECK: PASSED... AWAITING FINAL LAUNCH ORDERS... ';

  return (
    <div className="w-full overflow-hidden bg-fg text-bg py-2.5 border-t border-b border-bg whitespace-nowrap">
      <div className="inline-block animate-marquee font-bold text-[0.9rem]">
        {tickerText}
        {tickerText}
      </div>
    </div>
  );
};

