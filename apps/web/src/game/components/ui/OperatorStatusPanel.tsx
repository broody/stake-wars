import { useSectors } from '../../contexts/SectorContext';
import { useWallet } from '../../contexts/WalletContext';
import { formatStrk } from '../../utils/format';

interface OperatorMetricProps {
  label: string;
  value: bigint;
}

function OperatorMetric({ label, value }: OperatorMetricProps) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span className="text-dim">{label}</span>
      <span className="text-neutral-400">{formatStrk(value)}</span>
    </div>
  );
}

export function OperatorStatusPanel() {
  const { address } = useWallet();
  const {
    operatorStatus,
    ownedSectorIds,
    contestedSectorIds,
    isOperatorLoading,
    operatorError,
    refreshOperator,
  } = useSectors();
  const contestedSectorIdSet = new Set(contestedSectorIds);
  const defendedSectorCount = ownedSectorIds.filter((sectorId) =>
    contestedSectorIdSet.has(sectorId)
  ).length;
  const uncontestedSectorCount = operatorStatus
    ? Math.max(0, operatorStatus.controlledSectorCount - defendedSectorCount)
    : 0;

  return (
    <aside className="pointer-events-auto absolute left-4 top-20 font-mono text-[11px] tracking-wider text-fg">
      {address && isOperatorLoading && (
        <div className="mt-2 flex items-center gap-2 text-dim">
          <span className="h-1.5 w-1.5 animate-pulse bg-white" />
          READING CONTROL FORCE…
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
        <div className="mt-3 block w-64 space-y-1 border-l border-neutral-700 pl-3 text-left">
          <OperatorMetric
            label="AVAILABLE FORCE"
            value={operatorStatus.availableForce}
          />
          <div className="flex items-baseline justify-between gap-6 text-dim">
            <span>SECTORS</span>
            <span className="text-neutral-400">{uncontestedSectorCount}</span>
          </div>
          {operatorStatus.activeChallengeCount > 0 && (
            <div className="flex items-baseline justify-between gap-6 text-dim">
              <span>CONTESTED</span>
              <span className="text-neutral-400">
                {operatorStatus.activeChallengeCount}
              </span>
            </div>
          )}
          {operatorStatus.retired && (
            <div className="pt-2 text-amber-400">
              ADDRESS PERMANENTLY RETIRED
            </div>
          )}
          {operatorStatus.needsSync && (
            <div className="pt-2 text-amber-400">SYNC REQUIRED</div>
          )}
        </div>
      )}
    </aside>
  );
}
