import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { BeaconSnapshot } from '../../services/api';
import { normalizeBeaconDestination } from '../../utils/beaconDestination';
import { BeaconConsole, BeaconSummaryCard } from './BeaconModal';

const biddingSnapshot: BeaconSnapshot = {
  network: 'SN_SEPOLIA',
  phase: 'bidding',
  observedAt: '2026-08-24T10:00:00Z',
  round: {
    id: 4,
    auctionAddress: '0xbeac0',
    paymentToken: '0x456',
    reservePrice: '1500000000000000000',
    minRaiseBps: 1000,
    biddingDurationSeconds: 259200,
    extensionSeconds: 300,
    startedAt: '2026-08-21T11:00:00Z',
    endsAt: '2026-08-24T11:00:00Z',
    leader: '0x0777aaaabbbbccccdddd',
    leadingBid: '2000000000000000000',
    minimumBid: '2200000000000000000',
    bidCount: 3,
  },
  controller: null,
  billboard: null,
};

const pendingSnapshot: BeaconSnapshot = {
  ...biddingSnapshot,
  phase: 'pending',
  observedAt: '2026-08-24T12:00:00Z',
  round: {
    ...biddingSnapshot.round!,
    biddingDurationSeconds: 300,
    startedAt: null,
    endsAt: null,
    leader: null,
    leadingBid: '0',
    minimumBid: '1500000000000000000',
    bidCount: 0,
  },
};

const controller = {
  address: '0x777',
  roundId: 3,
  claimedAt: '2026-08-24T11:00:00Z',
  hasPublished: false,
};

describe('BeaconConsole', () => {
  it('shows the public lead, bid count, and exact next minimum', () => {
    const markup = renderToStaticMarkup(
      <BeaconConsole
        isOpen
        snapshot={biddingSnapshot}
        isLoading={false}
        error={null}
        onClose={() => undefined}
        onRefresh={() => undefined}
        onPlaceBid={async () => undefined}
        viewerAddress="0x999"
      />
    );

    expect(markup).toContain('BIDDING OPEN');
    expect(markup).toContain('BIDDING CLOSES IN');
    expect(markup).toContain('1H 00M');
    expect(markup).toContain('LEADING BID');
    expect(markup).toContain('2 STRK');
    expect(markup).toContain('NEXT MINIMUM');
    expect(markup).toContain('2.2 STRK');
    expect(markup).toContain('>3</div>');
    expect(markup).toContain('LEADER');
    expect(markup).toContain('0x0777aa…ccdddd');
    expect(markup).toContain('value="2.2"');
    expect(markup).toContain('(+10%)');
    expect(markup).toContain('refunded in the same transaction');
    expect(markup).toContain('final 5 minutes extends the deadline');
    expect(markup).toContain('PLACE BID');
    expect(markup).toContain('PUBLIC BID // STRK');
    expect(markup).not.toContain(' disabled=""');
    expect(markup).not.toContain('SEALED');
    expect(markup).not.toContain('SETTLE ROUND');
  });

  it('marks the connected leader and blocks raising its own bid', () => {
    const markup = renderToStaticMarkup(
      <BeaconConsole
        isOpen
        snapshot={biddingSnapshot}
        isLoading={false}
        error={null}
        onClose={() => undefined}
        onRefresh={() => undefined}
        onPlaceBid={async () => undefined}
        viewerAddress="0x777aaaabbbbccccdddd"
      />
    );

    expect(markup).toContain('>YOU</span>');
    expect(markup).toContain('YOU HOLD THE LEAD');
    expect(markup).toContain(' disabled=""');
  });

  it('explains that the first bid starts the pending auction', () => {
    const markup = renderToStaticMarkup(
      <BeaconConsole
        isOpen
        snapshot={pendingSnapshot}
        isLoading={false}
        error={null}
        onClose={() => undefined}
        onRefresh={() => undefined}
      />
    );

    expect(markup).toContain('WAITING FOR FIRST BID');
    expect(markup).toContain('STARTS ON BID');
    expect(markup).toContain(
      'first bid at or above the reserve opens a 5-minute auction'
    );
    expect(markup).toContain('RESERVE');
    expect(markup).toContain('1.5 STRK');
    expect(markup).toContain('MIN RAISE');
    expect(markup).toContain('10%');
    expect(markup).toContain('WALLET REQUIRED');
    expect(markup).not.toContain('LEADER');
    expect(markup).not.toContain('CURRENT CONTROLLER');
  });

  it('offers permissionless settlement once bidding closes', () => {
    const snapshot: BeaconSnapshot = {
      ...biddingSnapshot,
      phase: 'settling',
      observedAt: '2026-08-24T11:00:01Z',
    };
    const markup = renderToStaticMarkup(
      <BeaconConsole
        isOpen
        snapshot={snapshot}
        isLoading={false}
        error={null}
        onClose={() => undefined}
        onRefresh={() => undefined}
        onSettle={async () => undefined}
      />
    );

    expect(markup).toContain('Bidding closed');
    expect(markup).toContain('FINAL');
    expect(markup).toContain('WINNER');
    expect(markup).toContain('WINNING BID');
    expect(markup).not.toContain('NEXT MINIMUM');
    expect(markup).toContain('SETTLE ROUND');
    expect(markup).toContain('Anyone can finalize the round');
    expect(markup).not.toContain('PLACE BID');
    expect(markup).not.toContain(' disabled=""');
  });

  it('shows verified live state on the auction page', () => {
    const markup = renderToStaticMarkup(
      <BeaconConsole
        isOpen
        snapshot={biddingSnapshot}
        isLoading={false}
        error={null}
        presentation="page"
        onClose={() => undefined}
        onRefresh={() => undefined}
      />
    );

    expect(markup).toContain('CURRENT ROUND');
    expect(markup).toContain('aria-label="Round 4"');
    expect(markup).toContain('>0004</span>');
    expect(markup).toContain('VERIFIED ONCHAIN');
    expect(markup).toContain('OPEN ASCENDING AUCTION');
    expect(markup).not.toContain('VICKREY');
  });

  it('shows winner, bid count, and winning bid in history', () => {
    const markup = renderToStaticMarkup(
      <BeaconConsole
        isOpen
        snapshot={biddingSnapshot}
        isLoading={false}
        error={null}
        view="history"
        history={[
          {
            roundId: 8,
            winnerAddress: '0x071a45e03bcb8ba82cf693acd5a2409f',
            bidCount: 22,
            winningBid: '41750000000000000000',
          },
        ]}
        onClose={() => undefined}
        onRefresh={() => undefined}
      />
    );

    expect(markup).toContain('Winner history');
    expect(markup).toContain('WINNER');
    expect(markup).toContain('0x071a45…a2409f');
    expect(markup).toContain('BIDS');
    expect(markup).not.toContain('BIDDERS');
    expect(markup).toContain('WINNING BID');
    expect(markup).toContain('22');
    expect(markup).toContain('41.75 STRK');
    expect(markup).not.toContain('VERIFYING');
  });
});

describe('BeaconSummaryCard', () => {
  it('shows controller state without duplicating auction status in Core', () => {
    const snapshot: BeaconSnapshot = {
      ...biddingSnapshot,
      controller,
    };
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <BeaconSummaryCard
          isOpen
          snapshot={snapshot}
          isLoading={false}
          error={null}
          onClose={() => undefined}
          onRefresh={() => undefined}
        />
      </MemoryRouter>
    );

    expect(markup).toContain('THE BEACON');
    expect(markup).toContain('CURRENT CONTROLLER');
    expect(markup).toContain('0x777');
    expect(markup).not.toContain('BIDDING OPEN');
    expect(markup).not.toContain('WAITING FOR');
    expect(markup).not.toContain('NEXT CONTROL');
    expect(markup).not.toContain('CURRENT PROJECTION');
    expect(markup).toContain('BID FOR BEACON CONTROL');
    expect(markup).not.toContain('UNTIL NEXT WINNER');
    expect(markup).toContain('/beacon?projection=1&amp;tracking=beacon');
  });

  it('shows the projection action only to the current controller', () => {
    const snapshot: BeaconSnapshot = { ...pendingSnapshot, controller };
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <BeaconSummaryCard
          isOpen
          snapshot={snapshot}
          isLoading={false}
          error={null}
          viewerAddress={snapshot.controller!.address}
          onClose={() => undefined}
          onRefresh={() => undefined}
        />
      </MemoryRouter>
    );

    expect(markup).toContain('YOU');
    expect(markup).toContain('CONTROLLER ACTIONS');
    expect(markup).toContain('BUILD TRANSMISSION');
    expect(markup).toContain('OR PASTE AN IMAGE');
    expect(markup).toContain('01 AVAILABLE');
    expect(markup).not.toContain('16:9');
    expect(markup).not.toContain('SET SIGNAL // SOON');
  });

  it('preserves projection mode when opening the Beacon page', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/?projection=1']}>
        <BeaconSummaryCard
          isOpen
          snapshot={biddingSnapshot}
          isLoading={false}
          error={null}
          onClose={() => undefined}
          onRefresh={() => undefined}
        />
      </MemoryRouter>
    );

    expect(markup).toContain('projection=1');
    expect(markup).toContain('tracking=beacon');
  });

  it('shows the transmission and locks further publication', () => {
    const snapshot: BeaconSnapshot = {
      ...biddingSnapshot,
      controller: { ...controller, hasPublished: true },
      billboard: {
        imageUrl: 'https://images.example/beacon.webp',
        thumbnailUrl: 'https://images.example/beacon-thumbnail.webp',
        description: 'Fund the next expedition beyond the Core.',
        destinationUrl: 'https://example.com/expedition',
        updatedAt: '2026-08-24T11:05:00Z',
      },
    };
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <BeaconSummaryCard
          isOpen
          snapshot={snapshot}
          isLoading={false}
          error={null}
          viewerAddress={snapshot.controller!.address}
          onClose={() => undefined}
          onRefresh={() => undefined}
        />
      </MemoryRouter>
    );

    expect(markup).toContain('TRANSMISSION');
    expect(markup).not.toContain('PAID TRANSMISSION');
    expect(markup).toContain('Fund the next expedition beyond the Core.');
    expect(markup).toContain('https://example.com/expedition');
    expect(markup).toContain('example.com');
    expect(markup).not.toContain('TRANSMISSION STATUS');
    expect(markup).not.toContain('LOCKED');
    expect(markup).not.toContain('BUILD TRANSMISSION');
    expect(markup).not.toContain('16:9');
  });

  it('keeps the prior transmission while the new winner can replace it', () => {
    const snapshot: BeaconSnapshot = {
      ...biddingSnapshot,
      controller: {
        ...controller,
        address: '0x888',
        roundId: 4,
        claimedAt: '2026-08-25T11:00:00Z',
      },
      billboard: {
        imageUrl: 'https://images.example/previous.webp',
        thumbnailUrl: 'https://images.example/previous-thumbnail.webp',
        description: 'The previous winner remains on the air.',
        destinationUrl: 'https://example.com/previous',
        updatedAt: '2026-08-24T11:05:00Z',
      },
    };
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <BeaconSummaryCard
          isOpen
          snapshot={snapshot}
          isLoading={false}
          error={null}
          viewerAddress={snapshot.controller!.address}
          onClose={() => undefined}
          onRefresh={() => undefined}
        />
      </MemoryRouter>
    );

    expect(markup).toContain('The previous winner remains on the air.');
    expect(markup).toContain('BUILD TRANSMISSION');
    expect(markup).toContain('01 AVAILABLE');
  });
});

describe('normalizeBeaconDestination', () => {
  it('adds HTTPS when the destination has no scheme', () => {
    expect(normalizeBeaconDestination(' starknet.io ')).toBe(
      'https://starknet.io'
    );
  });

  it('preserves an explicit HTTP or HTTPS scheme', () => {
    expect(normalizeBeaconDestination('https://starknet.io/')).toBe(
      'https://starknet.io/'
    );
    expect(normalizeBeaconDestination('http://example.com')).toBe(
      'http://example.com'
    );
  });
});
