import { describe, expect, it } from 'vitest';
import {
  createArbiterMockHistory,
  createArbiterMockSnapshot,
  isArbiterMockMode,
} from './arbiterMock';

const observedAt = Date.parse('2026-08-24T12:00:00Z');

describe('Arbiter mock snapshots', () => {
  it('creates a first-auction bidding preview without a current winner', () => {
    const snapshot = createArbiterMockSnapshot('bidding', observedAt);

    expect(snapshot.phase).toBe('bidding');
    expect(snapshot.round?.status).toBe('bidding');
    expect(snapshot.round?.fundedTrancheCount).toBe(17);
    expect(snapshot.round?.result).toBeNull();
    expect(snapshot.controller).toBeNull();
    expect(snapshot.billboard).toBeNull();
    expect(Date.parse(snapshot.round!.biddingDeadline!) - observedAt).toBe(
      180_000_000
    );
  });

  it('keeps a pending auction open without resolved deadlines', () => {
    const snapshot = createArbiterMockSnapshot('pending', observedAt);

    expect(snapshot.phase).toBe('pending');
    expect(snapshot.round?.status).toBe('pending');
    expect(snapshot.round?.biddingDeadline).toBeNull();
    expect(snapshot.round?.schedule.biddingDurationSeconds).toBe(259200);
    expect(snapshot.controller).toBeNull();
  });

  it('creates a claimed winner preview', () => {
    const snapshot = createArbiterMockSnapshot('winner', observedAt);

    expect(snapshot.phase).toBe('settled');
    expect(snapshot.round?.result?.hasWinner).toBe(true);
    expect(snapshot.round?.result?.clearingPrice).toBe('37100000000000000000');
    expect(snapshot.controller).not.toBeNull();
  });

  it('provides winner history after the first completed cycle', () => {
    expect(createArbiterMockHistory('pending')).toEqual([]);

    const history = createArbiterMockHistory('bidding');
    expect(history).toHaveLength(4);
    expect(history[0]).toMatchObject({
      roundId: 8,
      bidderCount: 22,
      winningBid: '41750000000000000000',
    });
  });

  it('accepts only supported query modes', () => {
    expect(isArbiterMockMode('bidding')).toBe(true);
    expect(isArbiterMockMode('pending')).toBe(true);
    expect(isArbiterMockMode('resolving')).toBe(true);
    expect(isArbiterMockMode('winner')).toBe(true);
    expect(isArbiterMockMode('live')).toBe(false);
    expect(isArbiterMockMode(null)).toBe(false);
  });
});
