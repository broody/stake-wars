import { WalletButton } from '../components/ui/WalletButton';
import { OperatorActivityTable } from '../components/ui/OperatorActivityTable';
import { useSectors } from '../contexts/SectorContext';
import { useWallet } from '../contexts/WalletContext';
import { shortAddress } from '../utils/format';

export function Operator() {
  const { isConnected, address, walletName } = useWallet();
  const { operatorStatus, isOperatorLoading, operatorError, refreshOperator } =
    useSectors();

  if (!isConnected) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg px-4">
        <div className="w-full max-w-md border border-grid p-8 text-center font-mono">
          <div className="text-xs tracking-[0.24em] text-dim">
            OPERATOR TERMINAL
          </div>
          <h1 className="mb-4 mt-3 text-2xl tracking-wider text-white">
            CONNECT YOUR WALLET
          </h1>
          <p className="mb-6 text-sm leading-relaxed text-neutral-500">
            Connect to read your Control Force, Sectors, and activity.
          </p>
          <div className="inline-block">
            <WalletButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-bg font-mono">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-24">
        <header className="flex flex-col gap-6 border-b border-grid pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] tracking-[0.28em] text-neutral-500">
              OPERATOR TERMINAL
            </div>
            <h1 className="mt-3 text-4xl tracking-[-0.04em] text-white sm:text-6xl">
              CONNECTED OPERATOR
            </h1>
          </div>

          <div className="border border-grid px-5 py-4 sm:min-w-64">
            <div className="text-[8px] tracking-[0.2em] text-neutral-500">
              CONNECTED WALLET
            </div>
            <div className="mt-1 text-[10px] tracking-[0.16em] text-white">
              {walletName || 'WALLET'}
            </div>
            <div className="mt-1 text-[9px] tabular-nums text-neutral-500">
              {address ? shortAddress(address) : 'NOT CONNECTED'}
            </div>
          </div>
        </header>

        <section className="mt-8">
          {isOperatorLoading ? (
            <div className="flex items-center gap-3 border-y border-grid py-12 text-[10px] tracking-[0.18em] text-neutral-500">
              <span className="h-1.5 w-1.5 animate-pulse bg-white" />
              READING ON-CHAIN OPERATOR STATE…
            </div>
          ) : null}

          {operatorError ? (
            <div className="border border-amber-500/40 p-5 text-xs">
              <p className="text-amber-400">{operatorError}</p>
              <button
                type="button"
                onClick={refreshOperator}
                className="mt-4 border border-neutral-600 px-4 py-2 text-[10px] tracking-[0.2em] text-white transition-colors hover:border-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                RETRY OPERATOR READ
              </button>
            </div>
          ) : null}

          {operatorStatus?.needsSync ? (
            <div className="border-l-2 border-amber-400 pl-4 text-[10px] leading-5 text-amber-400">
              OPERATOR SYNC REQUIRED · Live stake is below the Force backing
              your Sectors. Syncing invalidates the current ownership
              generation.
            </div>
          ) : null}
        </section>

        {address ? <OperatorActivityTable operator={address} /> : null}
      </div>
    </div>
  );
}
