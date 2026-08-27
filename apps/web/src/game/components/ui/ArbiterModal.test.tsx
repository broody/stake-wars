import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ArbiterSnapshot } from '../../services/api';
import { createArbiterMockSnapshot } from '../../services/arbiterMock';
import { ArbiterConsole, ArbiterSummaryCard } from './ArbiterModal';

const biddingSnapshot: ArbiterSnapshot = {
  network: 'SN_SEPOLIA',
  phase: 'bidding',
  observedAt: '2026-08-24T10:00:00Z',
  round: {
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
    startedAt: '2026-08-21T11:00:00Z',
    biddingDeadline: '2026-08-24T11:00:00Z',
    forceRevealAfter: '2026-08-24T11:10:00Z',
    abortAfter: '2026-08-24T11:20:00Z',
    submissionCount: 3,
    fundedTrancheCount: 2,
    status: 'bidding',
    result: null,
  },
  controller: null,
  billboard: null,
};

describe('ArbiterConsole', () => {
  it('shows only safe public counters during sealed bidding', () => {
    const markup = renderToStaticMarkup(
      <ArbiterConsole
        isOpen
        snapshot={biddingSnapshot}
        isLoading={false}
        error={null}
        onClose={() => undefined}
        onRefresh={() => undefined}
        onPlaceBid={() => undefined}
        previewMode="bidding"
      />
    );

    expect(markup).toContain('BIDDING OPEN');
    expect(markup).toContain('BIDDING CLOSES IN');
    expect(markup).toContain('1H 00M');
    expect(markup).toContain('BIDS');
    expect(markup).not.toContain('FUNDED BIDS');
    expect(markup).not.toContain('ACCEPTED BIDS');
    expect(markup).toContain('PLACE SEALED BID');
    expect(markup).toContain('MOCK WALLET // CONNECTED');
    expect(markup).not.toContain(' disabled=""');
    expect(markup).not.toContain('WINNING BID');
  });

  it('explains that the first bid starts the pending auction', () => {
    const markup = renderToStaticMarkup(
      <ArbiterConsole
        isOpen
        snapshot={createArbiterMockSnapshot(
          'pending',
          Date.parse('2026-08-24T12:00:00Z')
        )}
        isLoading={false}
        error={null}
        onClose={() => undefined}
        onRefresh={() => undefined}
      />
    );

    expect(markup).toContain('WAITING FOR FIRST BID');
    expect(markup).toContain('STARTS ON BID');
    expect(markup).toContain('first sealed bid opens a three-day auction');
    expect(markup).not.toContain('CURRENT WINNER');
    expect(markup).not.toContain('CURRENT CONTROLLER');
    expect(markup).not.toContain('UNCLAIMED');
  });

  it('keeps the settled round summary compact', () => {
    const snapshot: ArbiterSnapshot = {
      ...biddingSnapshot,
      phase: 'settled',
      round: {
        ...biddingSnapshot.round!,
        status: 'settled',
        result: {
          hasWinner: true,
          winnerCommitment: '0xabcdef1234567890',
          winningBid: '2500000000000000000',
          secondHighestBid: '2000000000000000000',
          clearingPrice: '2000000000000000000',
          settledAt: '2026-08-24T11:05:00Z',
        },
      },
    };
    const markup = renderToStaticMarkup(
      <ArbiterConsole
        isOpen
        snapshot={snapshot}
        isLoading={false}
        error={null}
        onClose={() => undefined}
        onRefresh={() => undefined}
      />
    );

    expect(markup).toContain('Winner confirmed');
    expect(markup).toContain('BIDS');
    expect(markup).not.toContain('CLEARING PRICE');
    expect(markup).not.toContain('WINNER COMMITMENT');
  });

  it('shows the development scenario controls with current Influence and bidding', () => {
    const markup = renderToStaticMarkup(
      <ArbiterConsole
        isOpen
        snapshot={createArbiterMockSnapshot(
          'bidding',
          Date.parse('2026-08-24T12:00:00Z')
        )}
        isLoading={false}
        error={null}
        previewMode="bidding"
        onClose={() => undefined}
        onRefresh={() => undefined}
        onPreviewModeChange={() => undefined}
      />
    );

    expect(markup).toContain('LOCAL SIGNAL');
    expect(markup).toContain('BIDDING');
    expect(markup).not.toContain('CURRENT WINNER');
    expect(markup).not.toContain('CURRENT CONTROLLER');
    expect(markup).not.toContain('UNCLAIMED');
    expect(markup).toContain('BIDS');
    expect(markup).toContain('>17</div>');
    expect(markup).not.toContain('17 / 64');
    expect(markup).toContain('LOCAL PREVIEW');
  });

  it('shows only winner, bidder count, and winning bid in history', () => {
    const markup = renderToStaticMarkup(
      <ArbiterConsole
        isOpen
        snapshot={biddingSnapshot}
        isLoading={false}
        error={null}
        view="history"
        history={[
          {
            roundId: 8,
            winnerAddress: '0x071a45e03bcb8ba82cf693acd5a2409f',
            bidderCount: 22,
            winningBid: '41750000000000000000',
          },
        ]}
        previewMode="bidding"
        onClose={() => undefined}
        onRefresh={() => undefined}
      />
    );

    expect(markup).toContain('Winner history');
    expect(markup).toContain('WINNER');
    expect(markup).toContain('BIDDERS');
    expect(markup).toContain('WINNING BID');
    expect(markup).toContain('22');
    expect(markup).toContain('41.75 [STRK]');
    expect(markup).not.toContain('AUCTION DETAILS');
  });
});

describe('ArbiterSummaryCard', () => {
  it('keeps the in-world surface light and links to the auction page', () => {
    const snapshot = createArbiterMockSnapshot(
      'bidding',
      Date.parse('2026-08-24T12:00:00Z')
    );
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ArbiterSummaryCard
          isOpen
          snapshot={snapshot}
          isLoading={false}
          error={null}
          previewMode="bidding"
          onClose={() => undefined}
          onRefresh={() => undefined}
        />
      </MemoryRouter>
    );

    expect(markup).toContain('BIDDING OPEN');
    expect(markup).not.toContain('CURRENT CONTROLLER');
    expect(markup).toContain('VIEW AUCTION');
    expect(markup).toContain(
      '/arbiter?arbiterMock=bidding&amp;tracking=arbiter'
    );
    expect(markup).not.toContain('AUCTION DETAILS');
  });

  it('shows the future projection affordance only to the favored Operator', () => {
    const snapshot = createArbiterMockSnapshot(
      'winner',
      Date.parse('2026-08-24T12:00:00Z')
    );
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ArbiterSummaryCard
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
    expect(markup).toContain('SET SIGNAL // SOON');
    expect(markup).toContain('disabled');
  });
});
