import { describe, expect, it } from 'vitest';
import type { BeaconRound } from '../services/api';
import {
  beaconCountdown,
  beaconDeadline,
  beaconPhaseLabel,
  formatBeaconAmount,
} from './beacon';

const round: BeaconRound = {
  id: 4,
  auctionAddress: '0x123',
  paymentToken: '0x456',
  reservePrice: '1500000000000000000',
  minRaiseBps: 1000,
  biddingDurationSeconds: 259200,
  extensionSeconds: 300,
  startedAt: '2026-08-21T12:00:00Z',
  endsAt: '2026-08-24T12:00:00Z',
  leader: '0xabc',
  leadingBid: '1500000000000000000',
  minimumBid: '1650000000000000000',
  bidCount: 1,
};

describe('Beacon lifecycle presentation', () => {
  it('maps public lifecycle states to their deadlines', () => {
    expect(beaconPhaseLabel('pending')).toBe('WAITING FOR FIRST BID');
    expect(beaconPhaseLabel('bidding')).toBe('BIDDING OPEN');
    expect(beaconPhaseLabel('settling')).toBe('SETTLING');
    expect(beaconDeadline('bidding', round)).toEqual({
      label: 'BIDDING CLOSES',
      at: round.endsAt,
    });
    expect(beaconDeadline('settling', round)).toBeNull();
  });

  it('formats round timing and token amounts', () => {
    expect(
      beaconCountdown(round.endsAt!, Date.parse('2026-08-24T10:58:57Z'))
    ).toBe('01:01:03');
    expect(formatBeaconAmount(round.reservePrice)).toBe('1.5 STRK');
  });
});
