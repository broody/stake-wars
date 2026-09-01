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

export type BeaconPhase =
  | 'none'
  | 'pending'
  | 'bidding'
  | 'acceptance'
  | 'settling'
  | 'recovery'
  | 'settled'
  | 'aborted';

export interface BeaconRoundResult {
  hasWinner: boolean;
  winnerCommitment: string;
  winningBid: string;
  secondHighestBid: string;
  clearingPrice: string;
  settledAt: string;
}

export interface BeaconRound {
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
  result: BeaconRoundResult | null;
}

export interface BeaconSnapshot {
  network: string;
  phase: BeaconPhase;
  observedAt: string;
  round: BeaconRound | null;
  controller: {
    address: string;
    claimedAt: string;
    startsAt: string | null;
    expiresAt: string | null;
  } | null;
  billboard: {
    imageUrl: string;
    thumbnailUrl: string;
    description: string;
    destinationUrl: string;
    updatedAt: string;
  } | null;
}

export interface BeaconHistoryEntry {
  roundId: number;
  winnerAddress: string | null;
  bidCount: number;
  winningBid: string;
}

export interface BeaconHistoryPage {
  entries: BeaconHistoryEntry[];
  nextCursor: string | null;
}

export interface PreparedSectorImage {
  contentType: string;
  detail: Blob;
  thumbnail: Blob;
}

export type PreparedBeaconImage = PreparedSectorImage;

export interface BeaconArtwork {
  id: string;
  network: string;
  controllerRoundId: number;
  ownerAddress: string;
  description: string;
  destinationUrl: string;
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
  signTypedData: (typedData: UseSignTypedDataArgs) => Promise<string[]>,
  onSigningComplete?: () => void
): Promise<AuthSession> {
  const key = walletAddress.toLowerCase();
  const cached = imageSessions.get(key);
  if (cached && new Date(cached.expiresAt).getTime() > Date.now() + 15_000) {
    onSigningComplete?.();
    return cached;
  }

  const challenge = await requestJSON<{
    challengeId: string;
    walletAddress: string;
    typedData: UseSignTypedDataArgs;
  }>('/v1/auth/challenges', jsonRequest({ walletAddress }));
  const signature = await signTypedData(challenge.typedData);
  onSigningComplete?.();
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

  getBeacon(signal?: AbortSignal): Promise<BeaconSnapshot> {
    return requestJSON('/v1/beacon', { signal, cache: 'no-store' });
  },

  getBeaconHistory(signal?: AbortSignal): Promise<BeaconHistoryPage> {
    return requestJSON('/v1/beacon/history?limit=100', { signal });
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
    onSigningComplete,
  }: {
    walletAddress: string;
    targets: Array<{ sectorId: number; ownershipGeneration: bigint }>;
    placement: ArtworkPlacement;
    prepared: PreparedSectorImage;
    signTypedData: (typedData: UseSignTypedDataArgs) => Promise<string[]>;
    onSigningComplete?: () => ArtworkPlacement | null | void;
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
    let committedPlacement = placement;
    const session = await imageSession(walletAddress, signTypedData, () => {
      committedPlacement = onSigningComplete?.() ?? committedPlacement;
    });
    const authorization = await requestJSON<ImageUploadAuthorization>(
      '/v1/sector-artworks/uploads',
      jsonRequest(
        {
          targets: numericTargets,
          placement: committedPlacement,
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

  async uploadBeaconArtwork({
    walletAddress,
    description,
    destinationUrl,
    prepared,
    signTypedData,
  }: {
    walletAddress: string;
    description: string;
    destinationUrl: string;
    prepared: PreparedBeaconImage;
    signTypedData: (typedData: UseSignTypedDataArgs) => Promise<string[]>;
  }): Promise<BeaconArtwork> {
    const session = await imageSession(walletAddress, signTypedData);
    const authorization = await requestJSON<ImageUploadAuthorization>(
      '/v1/beacon/artwork/uploads',
      jsonRequest(
        {
          description,
          destinationUrl,
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
    return requestJSON<BeaconArtwork>(
      `/v1/beacon/artwork/uploads/${encodeURIComponent(
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
