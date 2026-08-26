import type { ArbiterPhase, ArbiterRound } from '../services/api';
import { formatCountdown, formatStrk } from './format';

const PHASE_LABELS: Record<ArbiterPhase, string> = {
  none: 'NO ROUND',
  pending: 'WAITING FOR FIRST BID',
  bidding: 'BIDDING OPEN',
  acceptance: 'RESOLVING',
  settling: 'RESOLVING',
  recovery: 'RECOVERY',
  settled: 'ROUND COMPLETE',
  aborted: 'ROUND ENDED',
};

export function arbiterPhaseLabel(phase: ArbiterPhase): string {
  return PHASE_LABELS[phase];
}

export function arbiterDeadline(
  phase: ArbiterPhase,
  round: ArbiterRound
): { label: string; at: string } | null {
  switch (phase) {
    case 'bidding':
      return round.biddingDeadline
        ? { label: 'BIDDING CLOSES', at: round.biddingDeadline }
        : null;
    case 'acceptance':
      return round.forceRevealAfter
        ? { label: 'FORCE REVEAL OPENS', at: round.forceRevealAfter }
        : null;
    case 'settling':
      return round.abortAfter
        ? { label: 'RECOVERY OPENS', at: round.abortAfter }
        : null;
    default:
      return null;
  }
}

export function arbiterCountdown(at: string, now: number): string {
  const deadline = Date.parse(at);
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return '--:--:--';
  return formatCountdown((deadline - now) / 1_000);
}

export function formatArbiterAmount(value: string): string {
  try {
    return `${formatStrk(BigInt(value))} [STRK]`;
  } catch {
    return '— [STRK]';
  }
}
