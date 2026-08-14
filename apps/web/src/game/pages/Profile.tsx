import { WalletButton } from '../components/ui/WalletButton';
import { OperatorActivityTable } from '../components/ui/OperatorActivityTable';
import { useControlPoints } from '../contexts/ControlPointContext';
import { useWallet } from '../contexts/WalletContext';
import { formatStrk, shortAddress } from '../utils/format';

export function Profile() {
  const { isConnected, address, username, walletName } = useWallet();
  const { operatorStatus, isOperatorLoading, operatorError, refreshOperator } =
    useControlPoints();
  const stakeMetrics = operatorStatus
    ? [{ label: 'STAKING POWER', value: operatorStatus.liveDelegatedAmount }]
    : [];

  if (!isConnected) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg">
        <div className="border border-grid p-8 text-center font-mono">
          <div className="text-xs tracking-[0.24em] text-dim">
            OPERATOR TERMINAL
          </div>
          <h2 className="mb-4 mt-3 text-2xl text-white">CONNECT YOUR WALLET</h2>
          <p className="mb-6 max-w-sm text-sm leading-relaxed text-neutral-500">
            Connect to read your live STRK staking power and Control Points.
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
      <div className="mx-auto max-w-4xl px-4 py-24">
        <div className="border-b border-grid pb-6">
          <div className="text-xs tracking-[0.24em] text-dim">
            OPERATOR TERMINAL
          </div>
          <h1 className="mt-2 text-3xl tracking-wider text-white">
            {username || 'CONNECTED OPERATOR'}
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            {walletName || 'Wallet'} ·{' '}
            {address ? shortAddress(address) : 'Not connected'}
          </p>
        </div>

        {isOperatorLoading && (
          <div className="flex items-center gap-3 py-16 text-sm text-dim">
            <span className="h-2 w-2 animate-pulse bg-white" />
            READING ON-CHAIN COMMAND POWER…
          </div>
        )}

        {operatorError && (
          <div className="py-12 text-sm">
            <p className="text-amber-400">{operatorError}</p>
            <button
              type="button"
              onClick={refreshOperator}
              className="mt-4 border border-neutral-600 px-4 py-2 tracking-widest text-white hover:border-white"
            >
              RETRY READ
            </button>
          </div>
        )}

        {operatorStatus && (
          <>
            <div className="grid border-l border-t border-grid sm:grid-cols-1">
              {stakeMetrics.map(({ label, value }) => (
                <div
                  key={label.toString()}
                  className="border-b border-r border-grid p-5"
                >
                  <div className="text-[10px] tracking-[0.2em] text-dim">
                    {label.toString()}
                  </div>
                  <div className="mt-3 text-xl text-white">
                    {formatStrk(value)}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-center justify-between border-y border-grid py-4 text-sm">
              <span className="text-dim">OWNED POINTS</span>
              <span>{operatorStatus.controlledPointCount}</span>
            </div>

            {operatorStatus.needsSync && (
              <div className="mt-6 border border-amber-500/50 p-4 text-sm text-amber-400">
                Your live stake is below the power backing your Control Points.
                Operator sync will invalidate the current ownership generation.
              </div>
            )}
          </>
        )}

        {address && <OperatorActivityTable operator={address} />}
      </div>
    </div>
  );
}
