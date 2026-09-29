import { describe, expect, it } from 'vitest';
import type { BeaconRound } from './api';
import { buildBeaconBidCalls, buildBeaconSettleCall } from './beaconBid';

const SYSTEM = `0x${'beac0'.padStart(64, '0')}`;
const STRK =
  '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

const round: BeaconRound = {
  id: 7,
  auctionAddress: '0xbeac0',
  paymentToken: STRK,
  reservePrice: '100000000000000000',
  minRaiseBps: 1000,
  biddingDurationSeconds: 259200,
  extensionSeconds: 300,
  startedAt: '2026-09-28T00:00:00Z',
  endsAt: '2026-10-01T00:00:00Z',
  leader: '0xabc',
  leadingBid: '1000000000000000000',
  minimumBid: '1100000000000000000',
  bidCount: 2,
};

describe('Beacon bid calls', () => {
  it('approves exactly the bid and places it on the current round', () => {
    const calls = buildBeaconBidCalls({
      beaconSystemAddress: SYSTEM,
      strkTokenAddress: STRK,
      round,
      bidder: '0xdef',
      amount: 1_100_000_000_000_000_000n,
    });
    expect(calls).toEqual([
      {
        contractAddress: STRK,
        entrypoint: 'approve',
        calldata: [SYSTEM, '1100000000000000000', '0'],
      },
      {
        contractAddress: SYSTEM,
        entrypoint: 'place_beacon_bid',
        calldata: ['7', '1100000000000000000'],
      },
    ]);
  });

  it('rejects bids the contract would refuse before asking the wallet', () => {
    const base = {
      beaconSystemAddress: SYSTEM,
      strkTokenAddress: STRK,
      round,
      bidder: '0xdef',
      amount: 1_100_000_000_000_000_000n,
    };
    expect(() =>
      buildBeaconBidCalls({ ...base, amount: 1_099_999_999_999_999_999n })
    ).toThrow('Bid at least 1.1 STRK.');
    expect(() => buildBeaconBidCalls({ ...base, bidder: '0x0abc' })).toThrow(
      'You already hold the leading bid.'
    );
    expect(() =>
      buildBeaconBidCalls({ ...base, strkTokenAddress: '0x123' })
    ).toThrow('payment token');
    expect(() =>
      buildBeaconBidCalls({ ...base, beaconSystemAddress: '0x999' })
    ).toThrow('does not match this network');
    expect(() =>
      buildBeaconBidCalls({ ...base, beaconSystemAddress: '' })
    ).toThrow('not configured');
  });

  it('builds the permissionless settlement call', () => {
    expect(
      buildBeaconSettleCall({ beaconSystemAddress: SYSTEM, round })
    ).toEqual({
      contractAddress: SYSTEM,
      entrypoint: 'settle_beacon_auction',
      calldata: ['7'],
    });
  });
});
