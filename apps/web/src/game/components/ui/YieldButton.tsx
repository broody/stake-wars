import { useYield } from '../../contexts/useYield';
import { useWallet } from '../../contexts/WalletContext';
import { formatStrk } from '../../utils/format';

export function YieldButton() {
  const { address } = useWallet();
  const { summary, isLoading, openYield } = useYield();

  if (!address) return null;

  const value =
    isLoading && !summary
      ? '…'
      : summary?.lifetimeRewards === null || !summary
        ? '—'
        : formatStrk(summary.lifetimeRewards, 4);

  return (
    <button
      type="button"
      onClick={openYield}
      className="border border-fg px-2 py-2 text-[10px] tracking-wider text-fg transition-colors hover:bg-fg hover:text-bg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-4 sm:text-sm"
      aria-label="Open yield ledger"
    >
      <span>YIELD</span>
      <span className="hidden xl:inline"> // {value} STRK</span>
    </button>
  );
}
