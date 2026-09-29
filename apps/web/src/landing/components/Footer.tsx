import { ExternalLink } from '../../ui';

export const Footer = () => {
  return (
    <footer className="border-t border-line-strong py-10 px-5 text-center text-caption text-fg-subtle">
      <div>STAKEWARS.GG &copy; 2026 // POWERED BY STARKNET</div>
      <div className="mt-2.5">That's no moon, it's a yield generator!</div>
      <div className="mt-5">
        <ExternalLink href="https://x.com/stake_wars" quiet>
          [TWITTER]
        </ExternalLink>
        &nbsp; [DOCS]
      </div>
    </footer>
  );
};
