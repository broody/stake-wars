import { describe, expect, it } from 'vitest';
import type { ArbiterRound } from '../services/api';
import {
  arbiterCountdown,
  arbiterDeadline,
  arbiterPhaseLabel,
  formatArbiterAmount,
} from './arbiter';

const round: ArbiterRound = {
  id: 4,
  whisperAddress: '0x123',
  auctionId: 7,
  paymentToken: '0x456',
  reservePrice: '1500000000000000000',
  maxBids: 16,
  schedule: {
    kind: 'start-on-bid',
    biddingDurationSeconds: 259200,
    acceptanceDurationSeconds: 600,
    settlementDurationSeconds: 1800,
  },
  startedAt: '2026-08-21T12:00:00Z',
  biddingDeadline: '2026-08-24T12:00:00Z',
  forceRevealAfter: '2026-08-24T12:10:00Z',
  abortAfter: '2026-08-24T12:20:00Z',
  submissionCount: 3,
  fundedTrancheCount: 2,
  status: 'bidding',
  result: null,
};

describe('Arbiter lifecycle presentation', () => {
  it('maps public lifecycle states without inventing bidder data', () => {
    expect(arbiterPhaseLabel('pending')).toBe('WAITING FOR FIRST BID');
    expect(arbiterPhaseLabel('bidding')).toBe('BIDDING OPEN');
    expect(arbiterDeadline('bidding', round)).toEqual({
      label: 'BIDDING CLOSES',
      at: round.biddingDeadline,
    });
    expect(arbiterDeadline('recovery', round)).toBeNull();
  });

  it('formats round timing and token amounts', () => {
    expect(
      arbiterCountdown(
        round.biddingDeadline!,
        Date.parse('2026-08-24T10:58:57Z')
      )
    ).toBe('01:01:03');
    expect(formatArbiterAmount(round.reservePrice)).toBe('1.5 [STRK]');
  });
});
