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
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-24">
        <header className="flex flex-col gap-6 border-b border-grid pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] tracking-[0.28em] text-neutral-500">
              CORE KEEPER // SEALED INFLUENCE
            </div>
            <div className="mt-3 flex items-center gap-0">
              <h1 className="text-4xl tracking-[-0.04em] text-white sm:text-6xl">
                ARBITER
              </h1>
              <ArbiterLogo className="pointer-events-none h-14 w-14 shrink-0 sm:h-20 sm:w-20" />
            </div>
          </div>

          <div className="max-w-md space-y-3 text-xs leading-6 text-neutral-400 sm:text-right sm:text-sm">
            <p>
              The Arbiter&apos;s duty cannot be bought. Its favor can. Sealed
              bribes grant the favored Operator a temporary Period of Influence
              over its public projection.
            </p>
          </div>
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
            title="INFLUENCE CONSOLE"
          />
        </div>
      </div>
    </div>
  );
}
