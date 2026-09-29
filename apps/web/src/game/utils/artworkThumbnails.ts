// One atlas page. Thumbnails beyond it load when the atlas builds them.
const MAX_PRELOADED_THUMBNAILS = 256;

// Thumbnails requested while the Core is still initializing, keyed by URL.
// The atlas takes each one as it builds, so none is held after it is drawn.
const preloadedThumbnails = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${url}`));
    image.src = url;
  });
}

/** Starts downloading artwork thumbnails before the atlas asks for them. */
export function preloadArtworkThumbnails(urls: readonly string[]): void {
  urls.slice(0, MAX_PRELOADED_THUMBNAILS).forEach((url) => {
    if (preloadedThumbnails.has(url)) return;
    const pending = loadImage(url);
    preloadedThumbnails.set(url, pending);
    // A failed preload is dropped so the atlas retries it.
    pending.catch(() => {
      if (preloadedThumbnails.get(url) === pending) {
        preloadedThumbnails.delete(url);
      }
    });
  });
}

/** Loads a thumbnail, reusing the preloaded request when there is one. */
export function loadArtworkThumbnail(url: string): Promise<HTMLImageElement> {
  const preloaded = preloadedThumbnails.get(url);
  if (!preloaded) return loadImage(url);
  preloadedThumbnails.delete(url);
  return preloaded.catch(() => loadImage(url));
}
