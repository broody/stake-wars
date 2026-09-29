export const Ticker = () => {
  const tickerText =
    'UPLINK ESTABLISHED... LIVE THEATER ONLINE... 2,000 SECTORS ONLINE... STAKE STRK... GENERATE FORCE... CAPTURE THE HIGH GROUND... PROTOCOL SECURITY CHECK: PASSED... ';

  return (
    <div className="w-full overflow-hidden bg-fg text-surface py-2.5 border-t border-b border-surface whitespace-nowrap">
      <div className="inline-block animate-marquee font-bold text-body">
        {tickerText}
        {tickerText}
      </div>
    </div>
  );
};
