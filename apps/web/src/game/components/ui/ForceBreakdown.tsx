import type { OperatorStatus } from '../../types';
import { formatStrk } from '../../utils/format';

/** Where an Operator's committed FORCE currently sits. */
export function ForceBreakdown({ status }: { status: OperatorStatus }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span>IN SECTORS</span>
      <span className="tabular-nums text-fg-muted">
        {formatStrk(status.sectorForce)}
      </span>
    </div>
  );
}
