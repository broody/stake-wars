import type { BeaconPhase, BeaconRound } from '../services/api';
import { formatCountdown, formatStrk } from './format';

const PHASE_LABELS: Record<BeaconPhase, string> = {
  none: 'NO ROUND',
  pending: 'WAITING FOR FIRST BID',
  bidding: 'BIDDING OPEN',
  settling: 'SETTLING',
};

export function beaconPhaseLabel(phase: BeaconPhase): string {
  return PHASE_LABELS[phase];
}

export function beaconDeadline(
  phase: BeaconPhase,
  round: BeaconRound
): { label: string; at: string } | null {
  return phase === 'bidding' && round.endsAt
    ? { label: 'BIDDING CLOSES', at: round.endsAt }
    : null;
}

export function beaconCountdown(at: string, now: number): string {
  const deadline = Date.parse(at);
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return '--:--:--';
  return formatCountdown((deadline - now) / 1_000);
}

export function formatBeaconAmount(value: string): string {
  try {
    return `${formatStrk(BigInt(value))} [STRK]`;
  } catch {
    return '— [STRK]';
  }
}
