import axios from 'axios';
import type { UseSignTypedDataArgs } from '@starknet-start/react';
import { config } from './config';
import type {
  ArtData,
  ArtworkPlacement,
  ControlPointArtwork,
  ControlPointArtworkTarget,
} from '../types';

export interface StakeWarsApiConfig {
  network: string;
  maxImageBytes: number;
  authEnabled: boolean;
  imageUploadsEnabled: boolean;
  supportedImageTypes: string[];
}

export interface PreparedControlPointImage {
  contentType: string;
  detail: Blob;
  thumbnail: Blob;
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

  async getControlPointArtworks(
    signal?: AbortSignal
  ): Promise<ControlPointArtwork[]> {
    const response = await requestJSON<{ artworks: ControlPointArtwork[] }>(
      '/v1/control-point-artworks',
      { signal }
    );
    return response.artworks;
  },

  async uploadControlPointArtwork({
    walletAddress,
    targets,
    placement,
    prepared,
    signTypedData,
  }: {
    walletAddress: string;
    targets: Array<{ controlPointId: number; ownershipGeneration: bigint }>;
    placement: ArtworkPlacement;
    prepared: PreparedControlPointImage;
    signTypedData: (typedData: UseSignTypedDataArgs) => Promise<string[]>;
  }): Promise<ControlPointArtwork> {
    const numericTargets: ControlPointArtworkTarget[] = targets.map(
      (target) => {
        const ownershipGeneration = Number(target.ownershipGeneration);
        if (
          !Number.isSafeInteger(ownershipGeneration) ||
          ownershipGeneration < 1
        ) {
          throw new Error('Control Point ownership generation is invalid.');
        }
        return { controlPointId: target.controlPointId, ownershipGeneration };
      }
    );
    const session = await imageSession(walletAddress, signTypedData);
    const authorization = await requestJSON<ImageUploadAuthorization>(
      '/v1/control-point-artworks/uploads',
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
    return requestJSON<ControlPointArtwork>(
      `/v1/control-point-artworks/uploads/${encodeURIComponent(
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
