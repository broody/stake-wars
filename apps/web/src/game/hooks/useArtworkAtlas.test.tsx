// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { useArtworkAtlas } from './useArtworkAtlas';

class ControlledImage {
  src = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    images.push(this);
  }
}

let images: ControlledImage[];
let root: Root;
let container: HTMLDivElement;
let texture: THREE.CanvasTexture | null;
const drawImage = vi.fn();
const onLoadingChange = vi.fn();

function Harness({ urls }: { urls: string[] }) {
  texture = useArtworkAtlas(
    JSON.stringify(
      urls.map((thumbnailUrl, column) => ({ thumbnailUrl, column, row: 0 }))
    ),
    urls.length,
    1,
    'page',
    onLoadingChange
  );
  return null;
}

function render(urls: string[]) {
  act(() => {
    root.render(
      <StrictMode>
        <Harness urls={urls} />
      </StrictMode>
    );
  });
}

async function settle(url: string, failed = false) {
  await act(async () => {
    for (const image of images.filter((image) => image.src === url)) {
      if (failed) image.onerror?.();
      else image.onload?.();
    }
  });
}

beforeEach(() => {
  images = [];
  texture = null;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Image', ControlledImage);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
  drawImage.mockClear();
  onLoadingChange.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('artwork atlas loading', () => {
  it('shows ready thumbnails while a slower thumbnail is still pending', async () => {
    render(['fast', 'slow']);
    expect(texture).toBeNull();

    await settle('fast');
    expect(texture).toBeInstanceOf(THREE.CanvasTexture);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(onLoadingChange).toHaveBeenLastCalledWith('page', true);
    const firstTexture = texture!;
    const firstVersion = firstTexture.version;

    await settle('slow');
    expect(texture).toBe(firstTexture);
    expect(firstTexture.version).toBeGreaterThan(firstVersion);
    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(onLoadingChange).toHaveBeenLastCalledWith('page', false);
  });

  it('keeps the existing texture until every replacement thumbnail settles', async () => {
    render(['original']);
    await settle('original');
    const original = texture!;
    const dispose = vi.spyOn(original, 'dispose');
    const originalVersion = original.version;

    render(['replacement', 'slow']);
    await settle('replacement');
    expect(texture).toBe(original);
    expect(original.version).toBe(originalVersion);
    expect(dispose).not.toHaveBeenCalled();

    await settle('slow');
    expect(texture).not.toBe(original);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(onLoadingChange).toHaveBeenLastCalledWith('page', false);
  });

  it('keeps successful thumbnails visible when another image fails', async () => {
    render(['ready', 'broken']);
    await settle('ready');
    const readyTexture = texture;

    await settle('broken', true);
    expect(texture).toBe(readyTexture);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(onLoadingChange).toHaveBeenLastCalledWith('page', false);
  });

  it('ignores cancelled loads and releases the published texture when cleared', async () => {
    render(['obsolete']);
    render(['current']);
    await settle('obsolete');
    expect(texture).toBeNull();
    expect(drawImage).not.toHaveBeenCalled();

    await settle('current');
    const dispose = vi.spyOn(texture!, 'dispose');
    render([]);
    expect(texture).toBeNull();
    expect(dispose).toHaveBeenCalledTimes(1);

    render(['next', 'pending']);
    await settle('next');
    expect(texture).toBeInstanceOf(THREE.CanvasTexture);
    expect(onLoadingChange).toHaveBeenLastCalledWith('page', true);
  });
});
