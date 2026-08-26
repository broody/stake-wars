import { ArbiterConsole } from '../components/ui/ArbiterModal';
import { ArbiterLogo } from '../components/3d/ArbiterLogo';
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
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_72%_12%,rgba(255,255,255,0.06),transparent_30%)]" />
      <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-24 sm:px-6">
        <header className="mb-6 flex items-end justify-between gap-6">
          <div>
            <div className="text-[9px] tracking-[0.26em] text-fg">
              SEALED CONTROL AUCTION
            </div>
            <h1 className="mt-2 text-5xl font-bold tracking-[-0.08em] text-fg sm:text-6xl">
              ARBITER
            </h1>
            <p className="mt-3 max-w-xl text-xs leading-5 text-neutral-400">
              Control changes only when the next winner is confirmed. The first
              sealed bid starts a three-day auction.
            </p>
          </div>
          <ArbiterLogo className="pointer-events-none hidden h-20 w-20 shrink-0 sm:block lg:h-24 lg:w-24" />
        </header>

        <div>
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
            title="CONTROL AUCTION"
          />
        </div>
      </div>
    </div>
  );
}
