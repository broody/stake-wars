import type { ArbiterSnapshot } from './api';
import { config } from './config';

export type ArbiterMockMode = 'bidding' | 'winner';
export type ArbiterPreviewMode = 'live' | ArbiterMockMode;

const WHISPER_ADDRESS =
  '0x03db9a75d8f90384e300b32bc4f08e3ac273325fbd18d0ef037a31795cfbb586';
const MOCK_CONTROLLER =
  '0x04cafe9817db154e2a7bb6e2cf4083d6293a324c2199b91f8c921f7f4180beef';
const MOCK_WINNER_COMMITMENT =
  '0x0616e7302d85bb2ac0a5f8fcd19214a9a5ce533f0b2538c47652186f8c33aa21';
const FALLBACK_STRK_ADDRESS =
  '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

export function isArbiterMockMode(
  value: string | null
): value is ArbiterMockMode {
  return value === 'bidding' || value === 'winner';
}

export function createArbiterMockSnapshot(
  mode: ArbiterMockMode,
  observedAt = Date.now()
): ArbiterSnapshot {
  const activeControl = {
    address: MOCK_CONTROLLER,
    claimedAt: iso(observedAt - 45 * 60_000),
    startsAt: iso(observedAt - 60 * 60_000),
    expiresAt: iso(observedAt + 23 * 60 * 60_000),
  };
  const billboard = {
    imageUrl: mockTransmissionURL(),
    thumbnailUrl: mockTransmissionURL(),
    updatedAt: iso(observedAt - 30 * 60_000),
  };
  const sharedRound = {
    whisperAddress: WHISPER_ADDRESS,
    paymentToken: config.strkTokenAddress || FALLBACK_STRK_ADDRESS,
    maxBids: 64,
    submissionCount: 23,
    fundedTrancheCount: 17,
  } as const;

  if (mode === 'bidding') {
    return {
      network: 'SN_SEPOLIA',
      phase: 'bidding',
      observedAt: iso(observedAt),
      round: {
        ...sharedRound,
        id: 8,
        auctionId: 43,
        reservePrice: '10000000000000000000',
        biddingDeadline: iso(observedAt + 102 * 60_000 + 19_000),
        forceRevealAfter: iso(observedAt + 2 * 60 * 60_000),
        abortAfter: iso(observedAt + 2.5 * 60 * 60_000),
        status: 'bidding',
        result: null,
      },
      controller: activeControl,
      billboard,
    };
  }

  return {
    network: 'SN_SEPOLIA',
    phase: 'settled',
    observedAt: iso(observedAt),
    round: {
      ...sharedRound,
      id: 7,
      auctionId: 42,
      reservePrice: '10000000000000000000',
      biddingDeadline: iso(observedAt - 90 * 60_000),
      forceRevealAfter: iso(observedAt - 75 * 60_000),
      abortAfter: iso(observedAt - 65 * 60_000),
      status: 'settled',
      result: {
        hasWinner: true,
        winnerCommitment: MOCK_WINNER_COMMITMENT,
        winningBid: '41750000000000000000',
        secondHighestBid: '37100000000000000000',
        clearingPrice: '37100000000000000000',
        settledAt: iso(observedAt - 60 * 60_000),
      },
    },
    controller: activeControl,
    billboard,
  };
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function mockTransmissionURL(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
    <rect width="640" height="360" fill="#050505"/>
    <g fill="none" stroke="#333" stroke-width="1">
      <path d="M0 60h640M0 120h640M0 180h640M0 240h640M0 300h640"/>
      <path d="M80 0v360M160 0v360M240 0v360M320 0v360M400 0v360M480 0v360M560 0v360"/>
    </g>
    <path d="M28 88V28h60M552 28h60v60M612 272v60h-60M88 332H28v-60" fill="none" stroke="#f5f5f5" stroke-width="4"/>
    <text x="320" y="170" fill="#f5f5f5" font-family="monospace" font-size="31" font-weight="700" text-anchor="middle">CURRENT TRANSMISSION</text>
    <text x="320" y="211" fill="#8a8a8a" font-family="monospace" font-size="17" text-anchor="middle">ROUND 0007 // PERIOD OF INFLUENCE</text>
    <text x="44" y="58" fill="#8a8a8a" font-family="monospace" font-size="14">ARBITER MOCK</text>
    <text x="596" y="314" fill="#8a8a8a" font-family="monospace" font-size="14" text-anchor="end">16:9</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
