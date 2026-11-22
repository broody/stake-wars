import type { EarnedUpgrade } from '../survivors/sim';
import { readClip, type DeathClip } from '../survivors/clip';
import axios from 'axios';
import type { UseSignTypedDataArgs } from '@starknetfoundation/starknet-start-react';
import { config } from './config';
import type {
  ArtData,
  ArtworkPlacement,
  SectorArtwork,
  SectorArtworkTarget,
} from '../types';
import type { StakingHistory, StakingSnapshot } from '../types/staking';

export interface StakeWarsApiConfig {
  network: string;
  maxImageBytes: number;
  authEnabled: boolean;
  imageUploadsEnabled: boolean;
  supportedImageTypes: string[];
}

export type BeaconPhase = 'none' | 'pending' | 'bidding' | 'settling';

export interface BeaconRound {
  id: number;
  auctionAddress: string;
  paymentToken: string;
  reservePrice: string;
  minRaiseBps: number;
  biddingDurationSeconds: number;
  extensionSeconds: number;
  startedAt: string | null;
  endsAt: string | null;
  leader: string | null;
  leadingBid: string;
  minimumBid: string;
  bidCount: number;
}

export interface BeaconSnapshot {
  network: string;
  phase: BeaconPhase;
  observedAt: string;
  round: BeaconRound | null;
  controller: {
    address: string;
    roundId: number;
    claimedAt: string;
    hasPublished: boolean;
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
  winnerAddress: string;
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
  imageAspect: number;
}

export interface PreparedBeaconImage {
  contentType: string;
  detail: Blob;
  thumbnail: Blob;
}

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

const walletSessions = new Map<string, AuthSession>();

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

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
    throw new ApiError(detail, response.status);
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

function cachedSession(scope: 'artwork' | 'survivor', wallet: string) {
  const cached = walletSessions.get(scope + ':' + wallet.toLowerCase());
  return cached && Date.parse(cached.expiresAt) > Date.now() + 15_000
    ? cached
    : undefined;
}

async function walletSession(
  scope: 'artwork' | 'survivor',
  walletAddress: string,
  signTypedData: (typedData: UseSignTypedDataArgs) => Promise<string[]>,
  onSigningComplete?: () => void
): Promise<AuthSession> {
  const key = `${scope}:${walletAddress.toLowerCase()}`;
  const cached = cachedSession(scope, walletAddress);
  if (cached) {
    onSigningComplete?.();
    return cached;
  }

  const challenge = await requestJSON<{
    challengeId: string;
    walletAddress: string;
    typedData: UseSignTypedDataArgs;
  }>(
    '/v1/auth/challenges',
    jsonRequest(
      scope === 'artwork' ? { walletAddress } : { walletAddress, scope }
    )
  );
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
  walletSessions.set(key, session);
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

export interface SurvivorEntry {
  walletKind?: string;
  /** The run behind this score. With `clip`, its final moments can be watched. */
  run?: number;
  clip?: boolean;
  durationSeconds: number | null;
  upgrades: EarnedUpgrade[] | null;
  wallet?: string;
  guest?: string;
  name?: string;
  destroyed: number;
}
export interface SurvivorBoard {
  network: string;
  payoutsEnabled: boolean;
  round: {
    id: number;
    deadline: string;
    closed: boolean;
    winner: SurvivorEntry | null;
    prizeAmount: string | null;
    paymentStatus?: string;
    transactionHash?: string;
    previousId?: number;
  } | null;
  entries: SurvivorEntry[];
}
export interface SurvivorFinish {
  destroyed: number;
  run: number;
  clip: boolean;
}
export interface SurvivorTicket {
  token: string;
  seed: number;
}

export const api = {
  getSurvivorBoard(
    signal?: AbortSignal,
    round?: string,
    allTime = false
  ): Promise<SurvivorBoard> {
    return requestJSON(
      '/v1/survivors/leaderboard' +
        (allTime
          ? '?scope=all'
          : round
            ? '?round=' + encodeURIComponent(round)
            : ''),
      {
        signal,
        cache: 'no-store',
      }
    );
  },
  startSurvivorRun(): Promise<SurvivorTicket> {
    return requestJSON('/v1/survivors/runs', jsonRequest({}));
  },
  /** A run's death clip, as the verifier saved it. */
  async getSurvivorClip(run: number): Promise<DeathClip> {
    const response = await fetch(
      `${config.domain}/v1/survivors/runs/${encodeURIComponent(run)}/clip`
    );
    if (!response.ok)
      throw new ApiError(
        response.status === 404
          ? 'This run has no death replay.'
          : `Request failed with HTTP ${response.status}`,
        response.status
      );
    return readClip(await response.arrayBuffer());
  },
  hasSurvivorSession(wallet: string) {
    return Boolean(cachedSession('survivor', wallet));
  },
  authorizeSurvivor(
    wallet: string,
    sign: (data: UseSignTypedDataArgs) => Promise<string[]>
  ) {
    return walletSession('survivor', wallet, sign);
  },
  async finishSurvivorRun(
    token: string,
    replay: string,
    wallet: string,
    walletId?: string | null
  ) {
    const session = cachedSession('survivor', wallet);
    if (!session)
      throw new ApiError('Sign in with your wallet to submit.', 401);
    try {
      return await requestJSON<SurvivorFinish>(
        '/v1/survivors/runs/finish',
        jsonRequest({ token, replay, walletId }, session.token)
      );
    } catch (error) {
      const key = 'survivor:' + wallet.toLowerCase();
      if (
        error instanceof ApiError &&
        error.status === 401 &&
        walletSessions.get(key) === session
      )
        walletSessions.delete(key);
      throw error;
    }
  },
  getWalletProfile(wallet: string) {
    return requestJSON<{ name: string }>(
      '/v1/survivors/profile?wallet=' + encodeURIComponent(wallet),
      { cache: 'no-store' }
    );
  },
  async walletProfile(
    wallet: string,
    sign: (data: UseSignTypedDataArgs) => Promise<string[]>,
    name: string
  ) {
    const path = '/v1/survivors/profile/wallet';
    const { typedData, revision } = await requestJSON<{
      typedData: UseSignTypedDataArgs;
      revision: number;
    }>(path, jsonRequest({ wallet, name }));
    const signature = await sign(typedData);
    return requestJSON<{ name: string }>(
      path,
      jsonRequest({ wallet, name, revision, signature })
    );
  },

  getConfig(signal?: AbortSignal): Promise<StakeWarsApiConfig> {
    return requestJSON('/v1/config', { signal });
  },

  getBeacon(signal?: AbortSignal): Promise<BeaconSnapshot> {
    return requestJSON('/v1/beacon', { signal, cache: 'no-store' });
  },

  getBeaconHistory(signal?: AbortSignal): Promise<BeaconHistoryPage> {
    return requestJSON('/v1/beacon/history?limit=100', { signal });
  },

  getStaking(signal?: AbortSignal): Promise<StakingSnapshot> {
    return requestJSON('/v1/staking', { signal });
  },

  getStakingHistory(signal?: AbortSignal): Promise<StakingHistory> {
    return requestJSON('/v1/staking/history', { signal });
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
    const session = await walletSession(
      'artwork',
      walletAddress,
      signTypedData,
      () => {
        committedPlacement = onSigningComplete?.() ?? committedPlacement;
      }
    );
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
    const session = await walletSession(
      'artwork',
      walletAddress,
      signTypedData
    );
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
