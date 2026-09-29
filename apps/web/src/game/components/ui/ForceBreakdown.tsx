import type { OperatorStatus } from '../../types';
import { formatStrk } from '../../utils/format';

function BreakdownRow({
  label,
  value,
  className = 'text-neutral-400',
}: {
  label: string;
  value: bigint;
  className?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span>{label}</span>
      <span className={`tabular-nums ${className}`}>{formatStrk(value)}</span>
    </div>
  );
}

/** Where an Operator's committed FORCE currently sits. */
export function ForceBreakdown({ status }: { status: OperatorStatus }) {
  return (
    <div className="space-y-1.5">
      <BreakdownRow label="IN SECTORS" value={status.sectorForce} />
      <BreakdownRow label="IN CHALLENGES" value={status.challengeForce} />
      <BreakdownRow
        label="SPENT"
        value={status.spentForce}
        className={
          status.spentForce > 0n ? 'text-amber-400' : 'text-neutral-400'
        }
      />
      {status.spentForce > 0n ? (
        <p className="pt-1 tracking-[0.02em] text-neutral-500">
          Spent FORCE was lost in challenges. Its STRK stays staked.
        </p>
      ) : null}
    </div>
  );
}
