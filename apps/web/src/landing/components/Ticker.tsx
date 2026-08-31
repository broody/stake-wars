export const Ticker = () => {
  const tickerText =
    'UPLINK ESTABLISHED... LIVE THEATER ONLINE... 2,000 SECTORS ONLINE... STAKE STRK... GENERATE FORCE... CAPTURE THE HIGH GROUND... PROTOCOL SECURITY CHECK: PASSED... ';

  return (
    <div className="w-full overflow-hidden bg-fg text-bg py-2.5 border-t border-b border-bg whitespace-nowrap">
      <div className="inline-block animate-marquee font-bold text-[0.9rem]">
        {tickerText}
        {tickerText}
      </div>
    </div>
  );
};
