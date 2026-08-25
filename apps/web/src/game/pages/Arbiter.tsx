import { ArbiterConsole } from '../components/ui/ArbiterModal';
import { useArbiterPreview } from '../contexts/useArbiterPreview';
import { useWallet } from '../contexts/WalletContext';

export function Arbiter() {
  const {
    snapshot,
    isLoading,
    error,
    refresh,
    previewMode,
    onPreviewModeChange,
  } = useArbiterPreview();
  const { address } = useWallet();

  return (
    <div className="h-full w-full overflow-y-auto bg-bg font-mono">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-24">
        <header className="flex flex-col gap-6 border-b border-grid pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] tracking-[0.28em] text-neutral-500">
              GLOBAL CONTROL // SEALED-BID MARKET
            </div>
            <h1 className="mt-3 text-4xl tracking-[-0.04em] text-white sm:text-6xl">
              ARBITER AUCTION
            </h1>
          </div>

          <p className="max-w-md text-xs leading-6 text-neutral-400 sm:text-right sm:text-sm">
            Win a temporary control window for the Arbiter projection. Bid
            values and bidder identities remain sealed while the round is
            active; only verified public contract state is shown here.
          </p>
        </header>

        <div className="mt-8">
          <ArbiterConsole
            isOpen
            onClose={() => undefined}
            snapshot={snapshot}
            isLoading={isLoading}
            error={error}
            onRefresh={refresh}
            previewMode={previewMode}
            onPreviewModeChange={onPreviewModeChange}
            presentation="page"
            viewerAddress={address}
            title="AUCTION CONSOLE"
          />
        </div>
      </div>
    </div>
  );
}
