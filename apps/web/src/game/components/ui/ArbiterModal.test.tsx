import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ArbiterSnapshot } from '../../services/api';
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
    winnerPayloadDomain: '0x789',
    reservePrice: '1500000000000000000',
    maxBids: 16,
    vaultAddress: '0xabc',
    revealPublicKey: '0xdef',
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

const pendingSnapshot: ArbiterSnapshot = {
  ...biddingSnapshot,
  phase: 'pending',
  observedAt: '2026-08-24T12:00:00Z',
  round: {
    ...biddingSnapshot.round!,
    schedule: {
      ...biddingSnapshot.round!.schedule,
      biddingDurationSeconds: 300,
    },
    startedAt: null,
    biddingDeadline: null,
    forceRevealAfter: null,
    abortAfter: null,
    submissionCount: 0,
    fundedTrancheCount: 0,
    status: 'pending',
  },
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
        onPlaceBid={async () => ({
          amount: '2000000000000000000',
          transactionHash: '0x123',
          confirmedBy: 'wallet',
          groupHandle: '0x456',
          bidHandle: '0x789',
        })}
      />
    );

    expect(markup).toContain('BIDDING OPEN');
    expect(markup).toContain('BIDDING CLOSES IN');
    expect(markup).toContain('1H 00M');
    expect(markup).toContain('BIDS');
    expect(markup).not.toContain('FUNDED BIDS');
    expect(markup).not.toContain('ACCEPTED BIDS');
    expect(markup).toContain('PLACE SEALED BID');
    expect(markup).toContain('READY WALLET // PRIVATE');
    expect(markup).not.toContain(' disabled=""');
    expect(markup).not.toContain('WINNING BID');
  });

  it('shows the connected wallet bids restored for the current round', () => {
    const markup = renderToStaticMarkup(
      <ArbiterConsole
        isOpen
        snapshot={biddingSnapshot}
        isLoading={false}
        error={null}
        onClose={() => undefined}
        onRefresh={() => undefined}
        ownBids={[
          {
            version: 1,
            network: 'SN_SEPOLIA',
            walletAddress: '0x999',
            roundId: 4,
            auctionId: 7,
            whisperAddress: '0x123',
            amount: '2250000000000000000',
            groupHandle: '0x456',
            bidHandle: '0x789',
            transactionHash: null,
            confirmedBy: 'bid-count',
            submittedAt: '2026-08-27T22:00:00.000Z',
          },
        ]}
      />
    );

    expect(markup).toContain('YOUR SEALED BID');
    expect(markup).toContain('2.25 [STRK]');
    expect(markup).toContain('SAVED ON THIS DEVICE');
  });

  it('explains that the first bid starts the pending auction', () => {
    const markup = renderToStaticMarkup(
      <ArbiterConsole
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
    expect(markup).toContain('first sealed bid opens a 5-minute auction');
    expect(markup).not.toContain('CURRENT WINNER');
    expect(markup).not.toContain('CURRENT CONTROLLER');
    expect(markup).not.toContain('UNCLAIMED');
  });

  it('counts down the acceptance window before settlement begins', () => {
    const snapshot: ArbiterSnapshot = {
      ...biddingSnapshot,
      phase: 'acceptance',
      observedAt: '2026-08-24T11:08:11Z',
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

    expect(markup).toContain('Finalizing bids');
    expect(markup).toContain('SETTLEMENT STARTS IN');
    expect(markup).toContain('00:01:49');
    expect(markup).not.toContain('>SEALED</div>');
  });

  it('shows proof generation after the settlement window opens', () => {
    const snapshot: ArbiterSnapshot = {
      ...biddingSnapshot,
      phase: 'settling',
      observedAt: '2026-08-24T11:10:01Z',
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

    expect(markup).toContain('Choosing the winner');
    expect(markup).toContain('SETTLEMENT');
    expect(markup).toContain('PROVING');
    expect(markup).toContain('generated and confirmed onchain');
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

  it('shows verified live state without development scenario controls', () => {
    const markup = renderToStaticMarkup(
      <ArbiterConsole
        isOpen
        snapshot={biddingSnapshot}
        isLoading={false}
        error={null}
        presentation="page"
        onClose={() => undefined}
        onRefresh={() => undefined}
      />
    );

    expect(markup).not.toContain('LOCAL SIGNAL');
    expect(markup).toContain('BIDDING');
    expect(markup).not.toContain('CURRENT WINNER');
    expect(markup).not.toContain('CURRENT CONTROLLER');
    expect(markup).not.toContain('UNCLAIMED');
    expect(markup).toContain('CURRENT ROUND');
    expect(markup).toContain('aria-label="Round 4"');
    expect(markup).toContain('>0004</span>');
    expect(markup).toContain('BIDS');
    expect(markup).toContain('>3</div>');
    expect(markup).not.toContain('>2</div>');
    expect(markup).not.toContain('2 / 16');
    expect(markup).toContain('VERIFIED ONCHAIN');
    expect(markup).not.toContain('LOCAL PREVIEW');
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
    expect(markup).toContain('BIDS');
    expect(markup).not.toContain('BIDDERS');
    expect(markup).toContain('WINNING BID');
    expect(markup).toContain('22');
    expect(markup).toContain('41.75 [STRK]');
    expect(markup).not.toContain('AUCTION DETAILS');
  });

  it('shows a verification label instead of a winner commitment', () => {
    const markup = renderToStaticMarkup(
      <ArbiterConsole
        isOpen
        snapshot={biddingSnapshot}
        isLoading={false}
        error={null}
        view="history"
        history={[
          {
            roundId: 9,
            winnerAddress: null,
            bidCount: 1,
            winningBid: '100000000000000000',
          },
        ]}
        onClose={() => undefined}
        onRefresh={() => undefined}
      />
    );

    expect(markup).toContain('VERIFYING');
    expect(markup).toContain('The winning wallet is being verified');
    expect(markup).not.toContain('WINNER COMMITMENT');
  });
});

describe('ArbiterSummaryCard', () => {
  it('keeps the in-world surface light and links to the auction page', () => {
    const snapshot = biddingSnapshot;
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ArbiterSummaryCard
          isOpen
          snapshot={snapshot}
          isLoading={false}
          error={null}
          onClose={() => undefined}
          onRefresh={() => undefined}
        />
      </MemoryRouter>
    );

    expect(markup).toContain('BIDDING OPEN');
    expect(markup).not.toContain('CURRENT CONTROLLER');
    expect(markup).toContain('VIEW AUCTION');
    expect(markup).toContain('/arbiter?tracking=arbiter');
    expect(markup).not.toContain('AUCTION DETAILS');
  });

  it('shows the future projection affordance only to the favored Operator', () => {
    const snapshot: ArbiterSnapshot = {
      ...biddingSnapshot,
      phase: 'settled',
      controller: {
        address: '0x777',
        claimedAt: '2026-08-24T11:00:00Z',
        startsAt: '2026-08-24T11:00:00Z',
        expiresAt: null,
      },
      round: {
        ...biddingSnapshot.round!,
        status: 'settled',
        result: {
          hasWinner: true,
          winnerCommitment: '0x999',
          winningBid: '2000000000000000000',
          secondHighestBid: '1000000000000000000',
          clearingPrice: '1000000000000000000',
          settledAt: '2026-08-24T11:00:00Z',
        },
      },
    };
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
