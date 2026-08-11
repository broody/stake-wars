import { useControlPoints } from '../../contexts/ControlPointContext';
import { useWallet } from '../../contexts/WalletContext';
import { CONTROL_POINT_COUNT } from '../../utils/controlPointGeometry';
import { formatStrk } from '../../utils/format';

interface OperatorMetricProps {
  label: string;
  value: bigint;
  highlight?: boolean;
}

function OperatorMetric({ label, value, highlight }: OperatorMetricProps) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span className="text-dim">{label}</span>
      <span className={highlight ? 'text-fg' : 'text-neutral-400'}>
        {formatStrk(value)} STRK
      </span>
    </div>
  );
}

export function OperatorStatusPanel() {
  const { address } = useWallet();
  const { operatorStatus, isOperatorLoading, operatorError, refreshOperator } =
    useControlPoints();

  return (
    <aside className="pointer-events-auto absolute left-4 top-20 font-mono text-[11px] tracking-wider text-fg">
      <div className="text-dim">
        {'>'} CORE_GRID <span className="text-fg">{CONTROL_POINT_COUNT}</span>
      </div>

      {!address && (
        <div className="mt-1 text-dim">
          {'>'} OPERATOR <span className="text-neutral-500">DISCONNECTED</span>
        </div>
      )}

      {address && isOperatorLoading && (
        <div className="mt-2 flex items-center gap-2 text-dim">
          <span className="h-1.5 w-1.5 animate-pulse bg-white" />
          READING COMMAND POWER…
        </div>
      )}

      {address && operatorError && (
        <button
          type="button"
          onClick={refreshOperator}
          className="mt-2 text-left text-amber-400 hover:text-amber-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {'>'} OPERATOR READ FAILED · RETRY
        </button>
      )}

      {operatorStatus && (
        <div className="mt-3 w-64 space-y-1 border-l border-neutral-700 pl-3">
          <OperatorMetric
            label="DELEGATED"
            value={operatorStatus.liveDelegatedAmount}
          />
          <OperatorMetric
            label="ALLOCATED"
            value={operatorStatus.totalAllocated}
          />
          <OperatorMetric
            label="AVAILABLE"
            value={operatorStatus.availableStake}
            highlight
          />
          <div className="flex items-baseline justify-between gap-6 pt-1 text-dim">
            <span>CONTROLLED</span>
            <span>{operatorStatus.controlledPointCount}</span>
          </div>
          {operatorStatus.needsSync && (
            <div className="pt-2 text-amber-400">SYNC REQUIRED</div>
          )}
        </div>
      )}
    </aside>
  );
}
