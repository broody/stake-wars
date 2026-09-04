import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type PreparedSectorImage } from './api';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('image upload authorization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('commits the placement immediately after the wallet signature resolves', async () => {
    const events: string[] = [];
    const detail = new Blob(['detail'], { type: 'image/webp' });
    const thumbnail = new Blob(['thumb'], { type: 'image/webp' });
    const prepared: PreparedSectorImage = {
      contentType: 'image/webp',
      detail,
      thumbnail,
      imageAspect: 1.5,
    };
    let requestIndex = 0;
    const responses = [
      jsonResponse({
        challengeId: 'challenge-1',
        walletAddress: '0xapi-test-wallet',
        typedData: {},
      }),
      jsonResponse({
        token: 'session-token',
        walletAddress: '0xapi-test-wallet',
        expiresAt: '2099-01-01T00:00:00Z',
      }),
      jsonResponse({
        uploadId: 'upload-1',
        detail: {
          url: 'https://uploads.example/detail',
          contentType: 'image/webp',
          bytes: detail.size,
          expiresAt: '2099-01-01T00:00:00Z',
        },
        thumbnail: {
          url: 'https://uploads.example/thumbnail',
          contentType: 'image/webp',
          bytes: thumbnail.size,
          expiresAt: '2099-01-01T00:00:00Z',
        },
      }),
      new Response(null, { status: 200 }),
      new Response(null, { status: 200 }),
      jsonResponse({
        id: 'artwork-1',
        network: 'SN_MAIN',
        ownerAddress: '0xapi-test-wallet',
        targets: [{ sectorId: 7, ownershipGeneration: 1 }],
        placement: {
          projectorMatrix: Array(16).fill(0),
          centerX: 0,
          centerY: 0,
          scale: 0.5,
          rotation: 0,
          viewportAspect: 1,
          imageAspect: 1.5,
        },
        imageUrl: 'https://images.example/detail',
        thumbnailUrl: 'https://images.example/thumbnail',
        contentHash: 'hash',
        updatedAt: '2026-08-31T00:00:00Z',
      }),
    ];
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ input, init });
        requestIndex += 1;
        if (requestIndex === 2) events.push('session-requested');
        const response = responses.shift();
        if (!response) throw new Error('Unexpected fetch request');
        return response;
      }
    );
    vi.stubGlobal('fetch', fetchMock);
    const committedPlacement = {
      projectorMatrix: Array(16).fill(1),
      centerX: 0.25,
      centerY: -0.25,
      scale: 0.75,
      rotation: 0.1,
      viewportAspect: 1.5,
      imageAspect: 1.5,
    };

    await api.uploadSectorArtwork({
      walletAddress: '0xapi-test-wallet',
      targets: [{ sectorId: 7, ownershipGeneration: 1n }],
      placement: {
        projectorMatrix: Array(16).fill(0),
        centerX: 0,
        centerY: 0,
        scale: 0.5,
        rotation: 0,
        viewportAspect: 1,
        imageAspect: 1.5,
      },
      prepared,
      signTypedData: async () => {
        events.push('signature-resolved');
        return ['0x1'];
      },
      onSigningComplete: () => {
        events.push('placement-locked');
        return committedPlacement;
      },
    });

    expect(events).toEqual([
      'signature-resolved',
      'placement-locked',
      'session-requested',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(JSON.parse(String(requests[2]?.init?.body))).toMatchObject({
      placement: committedPlacement,
    });
  });
});
