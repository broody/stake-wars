import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadArtworkThumbnail,
  preloadArtworkThumbnails,
} from './artworkThumbnails';

class ControlledImage {
  src = '';
  crossOrigin: string | null = null;
  decoding = 'auto';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    images.push(this);
  }
}

let images: ControlledImage[];

function requested(url: string) {
  return images.filter((image) => image.src === url);
}

function finish(url: string, failed = false) {
  requested(url).forEach((image) =>
    failed ? image.onerror?.() : image.onload?.()
  );
}

beforeEach(() => {
  images = [];
  vi.stubGlobal('Image', ControlledImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('artwork thumbnail preloading', () => {
  it('lets the atlas reuse a thumbnail requested during initialization', async () => {
    preloadArtworkThumbnails(['early']);
    expect(requested('early')).toHaveLength(1);
    expect(requested('early')[0].crossOrigin).toBe('anonymous');

    const loading = loadArtworkThumbnail('early');
    finish('early');

    expect(await loading).toBe(requested('early')[0]);
    expect(requested('early')).toHaveLength(1);
  });

  it('releases a preloaded thumbnail once the atlas has taken it', async () => {
    preloadArtworkThumbnails(['taken']);
    finish('taken');
    await loadArtworkThumbnail('taken');

    const reloading = loadArtworkThumbnail('taken');
    expect(requested('taken')).toHaveLength(2);
    finish('taken');
    await reloading;
  });

  it('requests a thumbnail again when its preload failed', async () => {
    preloadArtworkThumbnails(['flaky']);
    const loading = loadArtworkThumbnail('flaky');
    finish('flaky', true);
    await Promise.resolve();
    await Promise.resolve();

    expect(requested('flaky')).toHaveLength(2);
    requested('flaky')[1].onload?.();
    expect(await loading).toBe(requested('flaky')[1]);
  });

  it('preloads at most one atlas page', () => {
    const urls = Array.from({ length: 300 }, (_, index) => `page-${index}`);
    preloadArtworkThumbnails(urls);

    expect(images).toHaveLength(256);
    urls.slice(0, 256).forEach((url) => void loadArtworkThumbnail(url));
  });
});
