import type { ArbiterSnapshot } from './api';
import { config } from './config';

export type ArbiterMockMode = 'pending' | 'bidding' | 'resolving' | 'winner';
export type ArbiterPreviewMode = 'live' | ArbiterMockMode;

const WHISPER_ADDRESS =
  '0x03db9a75d8f90384e300b32bc4f08e3ac273325fbd18d0ef037a31795cfbb586';
const MOCK_CONTROLLER =
  '0x04cafe9817db154e2a7bb6e2cf4083d6293a324c2199b91f8c921f7f4180beef';
const MOCK_WINNER_COMMITMENT =
  '0x0616e7302d85bb2ac0a5f8fcd19214a9a5ce533f0b2538c47652186f8c33aa21';
const FALLBACK_STRK_ADDRESS =
  '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const THREE_DAYS_SECONDS = 3 * 24 * 60 * 60;

export function isArbiterMockMode(
  value: string | null
): value is ArbiterMockMode {
  return (
    value === 'pending' ||
    value === 'bidding' ||
    value === 'resolving' ||
    value === 'winner'
  );
}

export function createArbiterMockSnapshot(
  mode: ArbiterMockMode,
  observedAt = Date.now()
): ArbiterSnapshot {
  const controller = {
    address: MOCK_CONTROLLER,
    claimedAt: iso(observedAt - 8 * 24 * 60 * 60_000),
    startsAt: iso(observedAt - 8 * 24 * 60 * 60_000),
    expiresAt: null,
  };
  const billboard = {
    imageUrl: mockTransmissionURL(),
    thumbnailUrl: mockTransmissionURL(),
    updatedAt: iso(observedAt - 30 * 60_000),
  };
  const sharedRound = {
    whisperAddress: WHISPER_ADDRESS,
    paymentToken: config.strkTokenAddress || FALLBACK_STRK_ADDRESS,
    reservePrice: '10000000000000000000',
    maxBids: 64,
    schedule: {
      kind: 'start-on-bid' as const,
      biddingDurationSeconds: THREE_DAYS_SECONDS,
      acceptanceDurationSeconds: 10 * 60,
      settlementDurationSeconds: 30 * 60,
    },
  };

  if (mode === 'pending') {
    return {
      network: 'SN_SEPOLIA',
      phase: 'pending',
      observedAt: iso(observedAt),
      round: {
        ...sharedRound,
        id: 9,
        auctionId: 44,
        startedAt: null,
        biddingDeadline: null,
        forceRevealAfter: null,
        abortAfter: null,
        submissionCount: 0,
        fundedTrancheCount: 0,
        status: 'pending',
        result: null,
      },
      controller,
      billboard,
    };
  }

  if (mode === 'bidding') {
    const startedAt = observedAt - 22 * 60 * 60_000;
    const biddingDeadline = startedAt + THREE_DAYS_SECONDS * 1000;
    return {
      network: 'SN_SEPOLIA',
      phase: 'bidding',
      observedAt: iso(observedAt),
      round: {
        ...sharedRound,
        id: 9,
        auctionId: 44,
        startedAt: iso(startedAt),
        biddingDeadline: iso(biddingDeadline),
        forceRevealAfter: iso(biddingDeadline + 10 * 60_000),
        abortAfter: iso(biddingDeadline + 40 * 60_000),
        submissionCount: 23,
        fundedTrancheCount: 17,
        status: 'bidding',
        result: null,
      },
      controller,
      billboard,
    };
  }

  if (mode === 'resolving') {
    return {
      network: 'SN_SEPOLIA',
      phase: 'settling',
      observedAt: iso(observedAt),
      round: {
        ...sharedRound,
        id: 9,
        auctionId: 44,
        startedAt: iso(observedAt - THREE_DAYS_SECONDS * 1000 - 12 * 60_000),
        biddingDeadline: iso(observedAt - 12 * 60_000),
        forceRevealAfter: iso(observedAt - 2 * 60_000),
        abortAfter: iso(observedAt + 28 * 60_000),
        submissionCount: 28,
        fundedTrancheCount: 22,
        status: 'bidding',
        result: null,
      },
      controller,
      billboard,
    };
  }

  return {
    network: 'SN_SEPOLIA',
    phase: 'settled',
    observedAt: iso(observedAt),
    round: {
      ...sharedRound,
      id: 8,
      auctionId: 43,
      startedAt: iso(observedAt - THREE_DAYS_SECONDS * 1000 - 60 * 60_000),
      biddingDeadline: iso(observedAt - 60 * 60_000),
      forceRevealAfter: iso(observedAt - 50 * 60_000),
      abortAfter: iso(observedAt - 20 * 60_000),
      submissionCount: 28,
      fundedTrancheCount: 22,
      status: 'settled',
      result: {
        hasWinner: true,
        winnerCommitment: MOCK_WINNER_COMMITMENT,
        winningBid: '41750000000000000000',
        secondHighestBid: '37100000000000000000',
        clearingPrice: '37100000000000000000',
        settledAt: iso(observedAt - 45 * 60_000),
      },
    },
    controller,
    billboard,
  };
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function mockTransmissionURL(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
    <defs><radialGradient id="g"><stop stop-color="#1a1a1a"/><stop offset="1" stop-color="#000000"/></radialGradient></defs>
    <rect width="640" height="360" fill="url(#g)"/>
    <g fill="none" stroke="#ffffff" opacity=".18"><circle cx="320" cy="180" r="118"/><circle cx="320" cy="180" r="158"/><path d="M0 180h640M320 0v360"/></g>
    <path d="M320 80 406 230 320 266 234 230 320 80Z" fill="none" stroke="#ffffff" stroke-width="3"/>
    <text x="320" y="320" fill="#ffffff" font-family="monospace" font-size="13" letter-spacing="4" text-anchor="middle">CURRENT ARBITER SIGNAL</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
