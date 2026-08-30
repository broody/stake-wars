import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import type { ArtworkPlacement, SectorArtwork } from '../types';
import { api } from '../services/api';
import { addressesMatch } from '../utils/format';
import { useSectors } from './SectorContext';

export interface PlacementDraft {
  previewUrl: string;
  placement: ArtworkPlacement | null;
}

interface SectorImageContextValue {
  artworks: SectorArtwork[];
  isLoading: boolean;
  isThumbnailAtlasLoading: boolean;
  error: string | null;
  uploadsEnabled: boolean;
  maximumImageBytes: number;
  featuredArtworkId: string | null;
  placementDraft: PlacementDraft | null;
  isPlacementLocked: boolean;
  beginPlacement: (previewUrl: string) => void;
  capturePlacement: (placement: ArtworkPlacement) => void;
  updatePlacement: (changes: Partial<ArtworkPlacement>) => void;
  lockPlacement: () => ArtworkPlacement | null;
  unlockPlacement: () => void;
  endPlacement: () => void;
  refreshImages: () => void;
  publishArtwork: (artwork: SectorArtwork) => void;
  setThumbnailAtlasLoading: (loading: boolean) => void;
}

const DEFAULT_MAXIMUM_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_REFRESH_INTERVAL_MS = 30_000;

const SectorImageContext = createContext<SectorImageContextValue | undefined>(
  undefined
);

export function SectorImageProvider({ children }: PropsWithChildren) {
  const { sectorOwnershipById } = useSectors();
  const [storedArtworks, setStoredArtworks] = useState<SectorArtwork[]>([]);
  const [placementDraft, setPlacementDraft] = useState<PlacementDraft | null>(
    null
  );
  const placementDraftRef = useRef<PlacementDraft | null>(null);
  const placementLockedRef = useRef(false);
  const [isPlacementLocked, setPlacementLockedState] = useState(false);
  const [featuredArtworkId, setFeaturedArtworkId] = useState<string | null>(
    null
  );
  const [uploadsEnabled, setUploadsEnabled] = useState(false);
  const [maximumImageBytes, setMaximumImageBytes] = useState(
    DEFAULT_MAXIMUM_IMAGE_BYTES
  );
  const [isLoading, setLoading] = useState(true);
  const [isThumbnailAtlasLoading, setThumbnailAtlasLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const refreshImages = useCallback(
    () => setRevision((current) => current + 1),
    []
  );
  const publishArtwork = useCallback((artwork: SectorArtwork) => {
    const targetIds = new Set(artwork.targets.map((target) => target.sectorId));
    setStoredArtworks((current) => [
      ...current
        .map((candidate) => ({
          ...candidate,
          targets: candidate.targets.filter(
            (target) => !targetIds.has(target.sectorId)
          ),
        }))
        .filter((candidate) => candidate.targets.length > 0),
      artwork,
    ]);
    setFeaturedArtworkId(artwork.id);
  }, []);
  const setPlacementLocked = useCallback((locked: boolean) => {
    placementLockedRef.current = locked;
    setPlacementLockedState(locked);
  }, []);
  const beginPlacement = useCallback(
    (previewUrl: string) => {
      setPlacementLocked(false);
      const next = { previewUrl, placement: null };
      placementDraftRef.current = next;
      setPlacementDraft(next);
    },
    [setPlacementLocked]
  );
  const capturePlacement = useCallback((placement: ArtworkPlacement) => {
    if (placementLockedRef.current) return;
    const current = placementDraftRef.current;
    if (!current) return;
    const next = { ...current, placement: current.placement ?? placement };
    placementDraftRef.current = next;
    setPlacementDraft(next);
  }, []);
  const updatePlacement = useCallback((changes: Partial<ArtworkPlacement>) => {
    if (placementLockedRef.current) return;
    const current = placementDraftRef.current;
    if (!current?.placement) return;
    const next = {
      ...current,
      placement: { ...current.placement, ...changes },
    };
    placementDraftRef.current = next;
    setPlacementDraft(next);
  }, []);
  const lockPlacement = useCallback(() => {
    const placement = placementDraftRef.current?.placement ?? null;
    if (placement) setPlacementLocked(true);
    return placement;
  }, [setPlacementLocked]);
  const unlockPlacement = useCallback(
    () => setPlacementLocked(false),
    [setPlacementLocked]
  );
  const endPlacement = useCallback(() => {
    setPlacementLocked(false);
    placementDraftRef.current = null;
    setPlacementDraft(null);
  }, [setPlacementLocked]);

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimer: number | undefined;
    if (revision === 0) setLoading(true);
    setError(null);
    Promise.all([
      api.getConfig(controller.signal),
      api.getSectorArtworks(controller.signal),
    ])
      .then(([configuration, artworks]) => {
        setUploadsEnabled(Boolean(configuration.imageUploadsEnabled));
        setMaximumImageBytes(
          Number.isFinite(configuration.maxImageBytes) &&
            configuration.maxImageBytes > 0
            ? configuration.maxImageBytes
            : DEFAULT_MAXIMUM_IMAGE_BYTES
        );
        setStoredArtworks(artworks);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setUploadsEnabled(false);
          setError(
            failure instanceof Error
              ? failure.message
              : 'Unable to load Sector artwork.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          refreshTimer = window.setTimeout(
            refreshImages,
            IMAGE_REFRESH_INTERVAL_MS
          );
        }
      });
    return () => {
      controller.abort();
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [refreshImages, revision]);

  const artworks = useMemo(
    () =>
      storedArtworks
        .map((artwork) => ({
          ...artwork,
          targets: artwork.targets.filter((target) => {
            const ownership = sectorOwnershipById.get(target.sectorId);
            return (
              ownership !== undefined &&
              Number.isSafeInteger(target.ownershipGeneration) &&
              addressesMatch(ownership.controller, artwork.ownerAddress) &&
              ownership.ownershipGeneration ===
                BigInt(target.ownershipGeneration)
            );
          }),
        }))
        .filter((artwork) => artwork.targets.length > 0),
    [sectorOwnershipById, storedArtworks]
  );

  const value = useMemo<SectorImageContextValue>(
    () => ({
      artworks,
      isLoading,
      isThumbnailAtlasLoading,
      error,
      uploadsEnabled,
      maximumImageBytes,
      featuredArtworkId,
      placementDraft,
      isPlacementLocked,
      beginPlacement,
      capturePlacement,
      updatePlacement,
      lockPlacement,
      unlockPlacement,
      endPlacement,
      refreshImages,
      publishArtwork,
      setThumbnailAtlasLoading,
    }),
    [
      artworks,
      beginPlacement,
      capturePlacement,
      endPlacement,
      error,
      featuredArtworkId,
      isLoading,
      isPlacementLocked,
      isThumbnailAtlasLoading,
      lockPlacement,
      maximumImageBytes,
      placementDraft,
      publishArtwork,
      refreshImages,
      unlockPlacement,
      updatePlacement,
      uploadsEnabled,
    ]
  );

  return (
    <SectorImageContext.Provider value={value}>
      {children}
    </SectorImageContext.Provider>
  );
}

export const useSectorImages = () => {
  const context = useContext(SectorImageContext);
  if (!context) {
    throw new Error('useSectorImages must be used within SectorImageProvider');
  }
  return context;
};
