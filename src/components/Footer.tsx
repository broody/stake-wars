export const Footer = () => {
  return (
    <footer className="border-t border-dim py-10 px-5 text-center text-[0.8rem] text-[#666]">
      <div>STAKEWARS.GG &copy; 2026 // POWERED BY STARKNET</div>
      <div className="footer-loc mt-2.5 text-fg font-bold">
        LOCATION: THE HIGH GROUND
      </div>
      <div className="mt-5">
        <a
          href="https://x.com/stake_wars"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-fg transition-colors"
        >
          [TWITTER]
        </a>{' '}
        &nbsp; [DISCORD] &nbsp; [DOCS]
      </div>
    </footer>
  );
};
