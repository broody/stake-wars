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
      />
    );

    expect(markup).toContain('SEALED BIDDING');
    expect(markup).toContain('BIDDING CLOSES // CHAIN TIME');
    expect(markup).toContain('01:00:00');
    expect(markup).toContain('FUNDED TRANCHES');
    expect(markup).toContain('2 / 16');
    expect(markup).toContain('SUBMISSIONS');
    expect(markup).toContain('vault operator can inspect accepted deposits');
    expect(markup).not.toContain('WINNING BID');
    expect(markup).not.toContain('CURRENT CONTROLLER');
  });

  it('reveals the public settlement result without inventing a winner address', () => {
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

    expect(markup).toContain('WINNER VERIFIED // CLAIM PENDING');
    expect(markup).toContain('CLEARING PRICE');
    expect(markup).toContain('2 [STRK]');
    expect(markup).toContain('COMMITMENT');
    expect(markup).not.toContain('CURRENT CONTROLLER');
  });

  it('shows the development scenario controls with current control and bidding', () => {
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
    expect(markup).toContain('AUCTION');
    expect(markup).toContain('MOCK');
    expect(markup).toContain('CURRENT BILLBOARD CONTROL');
    expect(markup).toContain('CURRENT WINNER');
    expect(markup).toContain('17 / 64');
    expect(markup).toContain('LOCAL PREVIEW // NO TRANSACTIONS');
  });
});

describe('ArbiterSummaryCard', () => {
  it('keeps the in-world surface light and links to the full auction UI', () => {
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

    expect(markup).toContain('GLOBAL CONTROL');
    expect(markup).toContain('CURRENT CONTROLLER');
    expect(markup).toContain('OPEN FULL AUCTION UI');
    expect(markup).toContain(
      '/arbiter?arbiterMock=bidding&amp;tracking=arbiter'
    );
    expect(markup).not.toContain('PUBLIC SIGNAL POLICY');
    expect(markup).not.toContain('CANONICAL ROUND DETAILS');
    expect(markup).not.toContain('ACTIVE TRANSMISSION');
  });

  it('shows the future upload affordance only to the current controller', () => {
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
    expect(markup).toContain('UPLOAD IMAGE // COMING NEXT');
    expect(markup).toContain('disabled');
  });
});
