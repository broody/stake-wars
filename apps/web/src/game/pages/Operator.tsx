import { WalletButton } from '../components/ui/WalletButton';
import { OperatorActivityTable } from '../components/ui/OperatorActivityTable';
import { useSectors } from '../contexts/SectorContext';
import { useWallet } from '../contexts/WalletContext';
import { AddressLink } from '../components/ui/AddressLink';
import { Button, Callout, Eyebrow, PageTitle, Panel } from '../../ui';

export function Operator() {
  const { isConnected, address, walletName } = useWallet();
  const { operatorStatus, isOperatorLoading, operatorError, refreshOperator } =
    useSectors();

  if (!isConnected) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface px-4">
        <Panel as="div" className="w-full max-w-md p-8 text-center font-mono">
          <Eyebrow>OPERATOR TERMINAL</Eyebrow>
          <h1 className="mb-4 mt-3 text-title text-fg">CONNECT YOUR WALLET</h1>
          <p className="mb-6 text-body text-fg-subtle">
            Connect to read your Control Force, Sectors, and activity.
          </p>
          <div className="inline-block">
            <WalletButton />
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-surface font-mono">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-24">
        <header className="flex flex-col gap-6 border-b border-line pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>OPERATOR TERMINAL</Eyebrow>
            <PageTitle className="mt-3">CONNECTED OPERATOR</PageTitle>
          </div>

          <Panel as="div" className="min-w-0 px-5 py-4 sm:min-w-64">
            <Eyebrow>CONNECTED WALLET</Eyebrow>
            <div className="mt-1 text-label text-fg">
              {walletName || 'WALLET'}
            </div>
            <div className="mt-1 text-label tabular-nums text-fg-subtle">
              {address ? <AddressLink address={address} /> : 'NOT CONNECTED'}
            </div>
          </Panel>
        </header>

        <section className="mt-8">
          {isOperatorLoading ? (
            <div className="flex items-center gap-3 border-y border-line py-12 text-label text-fg-subtle">
              <span className="h-1.5 w-1.5 animate-pulse bg-fg" />
              READING ON-CHAIN OPERATOR STATE…
            </div>
          ) : null}

          {operatorError ? (
            <Callout
              tone="warning"
              action={
                <Button variant="outline" onClick={refreshOperator}>
                  RETRY OPERATOR READ
                </Button>
              }
            >
              {operatorError}
            </Callout>
          ) : null}

          {operatorStatus?.needsSync ? (
            <Callout tone="warning">
              OPERATOR SYNC REQUIRED · Live stake is below the Force backing
              your Sectors. Syncing invalidates the current ownership
              generation.
            </Callout>
          ) : null}
        </section>

        {address ? <OperatorActivityTable operator={address} /> : null}
      </div>
    </div>
  );
}
