import type { ArbiterPhase, ArbiterRound } from '../services/api';
import { formatCountdown, formatStrk } from './format';

const PHASE_LABELS: Record<ArbiterPhase, string> = {
  none: 'NO ROUND',
  bidding: 'SEALED BIDDING',
  acceptance: 'ACCEPTANCE GRACE',
  settling: 'SETTLEMENT WINDOW',
  recovery: 'RECOVERY AVAILABLE',
  settled: 'SETTLED',
  aborted: 'ABORTED',
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
      return { label: 'BIDDING CLOSES', at: round.biddingDeadline };
    case 'acceptance':
      return { label: 'FORCE REVEAL OPENS', at: round.forceRevealAfter };
    case 'settling':
      return { label: 'RECOVERY OPENS', at: round.abortAfter };
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
