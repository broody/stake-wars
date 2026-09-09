import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { artworkAtlasSourcesFromKey } from '../utils/sectorArtworkProjection';

const ATLAS_CELL_SIZE = 256;
const IMAGE_LOAD_CONCURRENCY = 16;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${url}`));
    image.src = url;
  });
}

export function useArtworkAtlas(
  sourceKey: string,
  columns: number,
  rows: number,
  pageId: string,
  onLoadingChange?: (pageId: string, loading: boolean) => void
) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const hasPublishedTexture = useRef(false);
  useEffect(() => () => texture?.dispose(), [texture]);
  useEffect(() => {
    const sources = artworkAtlasSourcesFromKey(sourceKey);
    if (sources.length === 0) {
      hasPublishedTexture.current = false;
      setTexture(null);
      onLoadingChange?.(pageId, false);
      return;
    }
    onLoadingChange?.(pageId, true);
    let active = true;
    const canvas = document.createElement('canvas');
    canvas.width = columns * ATLAS_CELL_SIZE;
    canvas.height = rows * ATLAS_CELL_SIZE;
    const context = canvas.getContext('2d');
    if (!context) {
      onLoadingChange?.(pageId, false);
      return;
    }
    const atlas = new THREE.CanvasTexture(canvas);
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.generateMipmaps = false;
    atlas.minFilter = THREE.LinearFilter;
    atlas.magFilter = THREE.LinearFilter;
    let next = 0;
    let published = false;
    // Show the first atlas as its images arrive. Rebuilds remain atomic so a
    // partially loaded replacement never blanks artwork already on screen.
    const progressive = !hasPublishedTexture.current;
    const publish = () => {
      atlas.needsUpdate = true;
      if (!published) {
        published = true;
        hasPublishedTexture.current = true;
        setTexture(atlas);
      }
    };
    const worker = async () => {
      while (active && next < sources.length) {
        const sourceDefinition = sources[next++];
        try {
          const source = await loadImage(sourceDefinition.thumbnailUrl);
          if (!active) return;
          context.drawImage(
            source,
            sourceDefinition.column * ATLAS_CELL_SIZE,
            sourceDefinition.row * ATLAS_CELL_SIZE,
            ATLAS_CELL_SIZE,
            ATLAS_CELL_SIZE
          );
          if (progressive) publish();
        } catch {
          // Keep the ownership color visible when an object cannot be loaded.
        }
      }
    };
    void Promise.all(
      Array.from(
        { length: Math.min(IMAGE_LOAD_CONCURRENCY, sources.length) },
        worker
      )
    ).finally(() => {
      if (!active) return;
      publish();
      onLoadingChange?.(pageId, false);
    });
    return () => {
      active = false;
      onLoadingChange?.(pageId, false);
      if (!published) atlas.dispose();
    };
  }, [columns, onLoadingChange, pageId, rows, sourceKey]);
  return texture;
}
