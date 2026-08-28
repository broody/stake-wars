import axios from 'axios';
import type { UseSignTypedDataArgs } from '@starknetfoundation/starknet-start-react';
import { config } from './config';
import type {
  ArtData,
  ArtworkPlacement,
  SectorArtwork,
  SectorArtworkTarget,
} from '../types';

export interface StakeWarsApiConfig {
  network: string;
  maxImageBytes: number;
  authEnabled: boolean;
  imageUploadsEnabled: boolean;
  supportedImageTypes: string[];
}

export type ArbiterPhase =
  | 'none'
  | 'pending'
  | 'bidding'
  | 'acceptance'
  | 'settling'
  | 'recovery'
  | 'settled'
  | 'aborted';

export interface ArbiterRoundResult {
  hasWinner: boolean;
  winnerCommitment: string;
  winningBid: string;
  secondHighestBid: string;
  clearingPrice: string;
  settledAt: string;
}

export interface ArbiterRound {
  id: number;
  whisperAddress: string;
  auctionId: number;
  paymentToken: string;
  winnerPayloadDomain: string;
  reservePrice: string;
  maxBids: number;
  vaultAddress: string;
  revealPublicKey: string;
  schedule: {
    kind: 'absolute' | 'start-on-bid';
    biddingDurationSeconds: number;
    acceptanceDurationSeconds: number;
    settlementDurationSeconds: number;
  };
  startedAt: string | null;
  biddingDeadline: string | null;
  forceRevealAfter: string | null;
  abortAfter: string | null;
  submissionCount: number;
  fundedTrancheCount: number;
  status: 'pending' | 'bidding' | 'settled' | 'aborted';
  result: ArbiterRoundResult | null;
}

export interface ArbiterSnapshot {
  network: string;
  phase: ArbiterPhase;
  observedAt: string;
  round: ArbiterRound | null;
  controller: {
    address: string;
    claimedAt: string;
    startsAt: string | null;
    expiresAt: string | null;
  } | null;
  billboard: {
    imageUrl: string;
    thumbnailUrl: string;
    updatedAt: string;
  } | null;
}

export interface ArbiterHistoryEntry {
  roundId: number;
  winnerAddress: string | null;
  bidCount: number;
  winningBid: string;
}

export interface ArbiterHistoryPage {
  entries: ArbiterHistoryEntry[];
  nextCursor: string | null;
}

export interface PreparedSectorImage {
  contentType: string;
  detail: Blob;
  thumbnail: Blob;
}

export type PreparedArbiterImage = PreparedSectorImage;

export interface ArbiterArtwork {
  id: string;
  network: string;
  controllerRoundId: number;
  ownerAddress: string;
  imageUrl: string;
  thumbnailUrl: string;
  contentHash: string;
  updatedAt: string;
}

interface ApiProblem {
  error?: { title?: string; detail?: string };
}

interface AuthSession {
  token: string;
  walletAddress: string;
  expiresAt: string;
}

interface UploadTarget {
  url: string;
  contentType: string;
  bytes: number;
  expiresAt: string;
}

interface ImageUploadAuthorization {
  uploadId: string;
  detail: UploadTarget;
  thumbnail: UploadTarget;
}

const imageSessions = new Map<string, AuthSession>();

async function requestJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.domain}${path}`, init);
  if (!response.ok) {
    let detail = `Request failed with HTTP ${response.status}`;
    try {
      const problem = (await response.json()) as ApiProblem;
      detail = problem.error?.detail || problem.error?.title || detail;
    } catch {
      // Keep the status-based fallback when the response is not JSON.
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

function jsonRequest(body: unknown, token?: string): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  };
}

async function imageSession(
  walletAddress: string,
  signTypedData: (typedData: UseSignTypedDataArgs) => Promise<string[]>
): Promise<AuthSession> {
  const key = walletAddress.toLowerCase();
  const cached = imageSessions.get(key);
  if (cached && new Date(cached.expiresAt).getTime() > Date.now() + 15_000) {
    return cached;
  }

  const challenge = await requestJSON<{
    challengeId: string;
    walletAddress: string;
    typedData: UseSignTypedDataArgs;
  }>('/v1/auth/challenges', jsonRequest({ walletAddress }));
  const signature = await signTypedData(challenge.typedData);
  const session = await requestJSON<AuthSession>(
    '/v1/auth/sessions',
    jsonRequest({
      challengeId: challenge.challengeId,
      walletAddress: challenge.walletAddress,
      signature,
    })
  );
  imageSessions.set(key, session);
  return session;
}

async function putObject(target: UploadTarget, body: Blob): Promise<void> {
  if (body.size !== target.bytes) {
    throw new Error('Prepared image size changed before upload.');
  }
  const response = await fetch(target.url, {
    method: 'PUT',
    headers: { 'Content-Type': target.contentType },
    body,
  });
  if (!response.ok) {
    throw new Error(`Object storage rejected the upload (${response.status}).`);
  }
}

export const api = {
  getConfig(signal?: AbortSignal): Promise<StakeWarsApiConfig> {
    return requestJSON('/v1/config', { signal });
  },

  getArbiter(signal?: AbortSignal): Promise<ArbiterSnapshot> {
    return requestJSON('/v1/arbiter', { signal });
  },

  getArbiterHistory(signal?: AbortSignal): Promise<ArbiterHistoryPage> {
    return requestJSON('/v1/arbiter/history?limit=100', { signal });
  },

  async getSectorArtworks(signal?: AbortSignal): Promise<SectorArtwork[]> {
    const response = await requestJSON<{ artworks: SectorArtwork[] }>(
      '/v1/sector-artworks',
      { signal }
    );
    return response.artworks;
  },

  async uploadSectorArtwork({
    walletAddress,
    targets,
    placement,
    prepared,
    signTypedData,
  }: {
    walletAddress: string;
    targets: Array<{ sectorId: number; ownershipGeneration: bigint }>;
    placement: ArtworkPlacement;
    prepared: PreparedSectorImage;
    signTypedData: (typedData: UseSignTypedDataArgs) => Promise<string[]>;
  }): Promise<SectorArtwork> {
    const numericTargets: SectorArtworkTarget[] = targets.map((target) => {
      const ownershipGeneration = Number(target.ownershipGeneration);
      if (
        !Number.isSafeInteger(ownershipGeneration) ||
        ownershipGeneration < 1
      ) {
        throw new Error('Sector ownership generation is invalid.');
      }
      return { sectorId: target.sectorId, ownershipGeneration };
    });
    const session = await imageSession(walletAddress, signTypedData);
    const authorization = await requestJSON<ImageUploadAuthorization>(
      '/v1/sector-artworks/uploads',
      jsonRequest(
        {
          targets: numericTargets,
          placement,
          contentType: prepared.contentType,
          detailSize: prepared.detail.size,
          thumbnailSize: prepared.thumbnail.size,
        },
        session.token
      )
    );
    await Promise.all([
      putObject(authorization.detail, prepared.detail),
      putObject(authorization.thumbnail, prepared.thumbnail),
    ]);
    return requestJSON<SectorArtwork>(
      `/v1/sector-artworks/uploads/${encodeURIComponent(
        authorization.uploadId
      )}/complete`,
      jsonRequest({}, session.token)
    );
  },

  async uploadArbiterArtwork({
    walletAddress,
    prepared,
    signTypedData,
  }: {
    walletAddress: string;
    prepared: PreparedArbiterImage;
    signTypedData: (typedData: UseSignTypedDataArgs) => Promise<string[]>;
  }): Promise<ArbiterArtwork> {
    const session = await imageSession(walletAddress, signTypedData);
    const authorization = await requestJSON<ImageUploadAuthorization>(
      '/v1/arbiter/artwork/uploads',
      jsonRequest(
        {
          contentType: prepared.contentType,
          detailSize: prepared.detail.size,
          thumbnailSize: prepared.thumbnail.size,
        },
        session.token
      )
    );
    await Promise.all([
      putObject(authorization.detail, prepared.detail),
      putObject(authorization.thumbnail, prepared.thumbnail),
    ]);
    return requestJSON<ArbiterArtwork>(
      `/v1/arbiter/artwork/uploads/${encodeURIComponent(
        authorization.uploadId
      )}/complete`,
      jsonRequest({}, session.token)
    );
  },

  async getArt(): Promise<ArtData[]> {
    try {
      const response = await axios.get(`${config.domain}/api/getart/`);
      return response.data.arts;
    } catch (error) {
      console.error('Error fetching art:', error);
      return [];
    }
  },
};
