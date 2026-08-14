import { useYield } from '../../contexts/useYield';
import { useWallet } from '../../contexts/WalletContext';
import { formatStrk } from '../../utils/format';

export function YieldButton() {
  const { address } = useWallet();
  const { summary, isLoading, openStaking } = useYield();

  if (!address) return null;

  const value =
    isLoading && !summary
      ? '…'
      : !summary
        ? '—'
        : formatStrk(summary.stakedAmount, 4);

  return (
    <button
      type="button"
      onClick={openStaking}
      className="border border-fg px-2 py-2 text-[10px] tracking-wider text-fg transition-colors hover:bg-fg hover:text-bg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-4 sm:text-sm"
      aria-label="Open staking position"
    >
      <span>STAKING</span>
      <span className="hidden xl:inline"> // {value} STRK</span>
    </button>
  );
}
