import { describe, expect, it } from 'vitest';
import { createArbiterMockSnapshot, isArbiterMockMode } from './arbiterMock';

const observedAt = Date.parse('2026-08-24T12:00:00Z');

describe('Arbiter mock snapshots', () => {
  it('creates a live auction preview with existing billboard control', () => {
    const snapshot = createArbiterMockSnapshot('bidding', observedAt);

    expect(snapshot.phase).toBe('bidding');
    expect(snapshot.round?.status).toBe('bidding');
    expect(snapshot.round?.fundedTrancheCount).toBe(17);
    expect(snapshot.round?.result).toBeNull();
    expect(snapshot.controller?.address).toMatch(/^0x/);
    expect(snapshot.billboard?.thumbnailUrl).toMatch(/^data:image\/svg\+xml/);
    expect(Date.parse(snapshot.round!.biddingDeadline) - observedAt).toBe(
      6_139_000
    );
  });

  it('creates a claimed winner preview', () => {
    const snapshot = createArbiterMockSnapshot('winner', observedAt);

    expect(snapshot.phase).toBe('settled');
    expect(snapshot.round?.result?.hasWinner).toBe(true);
    expect(snapshot.round?.result?.clearingPrice).toBe('37100000000000000000');
    expect(snapshot.controller).not.toBeNull();
  });

  it('accepts only supported query modes', () => {
    expect(isArbiterMockMode('bidding')).toBe(true);
    expect(isArbiterMockMode('winner')).toBe(true);
    expect(isArbiterMockMode('live')).toBe(false);
    expect(isArbiterMockMode(null)).toBe(false);
  });
});
