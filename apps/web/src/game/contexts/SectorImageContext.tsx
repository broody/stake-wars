import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  error: string | null;
  uploadsEnabled: boolean;
  maximumImageBytes: number;
  featuredArtworkId: string | null;
  placementDraft: PlacementDraft | null;
  beginPlacement: (previewUrl: string) => void;
  capturePlacement: (placement: ArtworkPlacement) => void;
  updatePlacement: (changes: Partial<ArtworkPlacement>) => void;
  endPlacement: () => void;
  refreshImages: () => void;
  publishArtwork: (artwork: SectorArtwork) => void;
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
  const [featuredArtworkId, setFeaturedArtworkId] = useState<string | null>(
    null
  );
  const [uploadsEnabled, setUploadsEnabled] = useState(false);
  const [maximumImageBytes, setMaximumImageBytes] = useState(
    DEFAULT_MAXIMUM_IMAGE_BYTES
  );
  const [isLoading, setLoading] = useState(true);
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
  const beginPlacement = useCallback((previewUrl: string) => {
    setPlacementDraft({ previewUrl, placement: null });
  }, []);
  const capturePlacement = useCallback((placement: ArtworkPlacement) => {
    setPlacementDraft((current) =>
      current
        ? { ...current, placement: current.placement ?? placement }
        : current
    );
  }, []);
  const updatePlacement = useCallback((changes: Partial<ArtworkPlacement>) => {
    setPlacementDraft((current) =>
      current?.placement
        ? { ...current, placement: { ...current.placement, ...changes } }
        : current
    );
  }, []);
  const endPlacement = useCallback(() => setPlacementDraft(null), []);

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
      error,
      uploadsEnabled,
      maximumImageBytes,
      featuredArtworkId,
      placementDraft,
      beginPlacement,
      capturePlacement,
      updatePlacement,
      endPlacement,
      refreshImages,
      publishArtwork,
    }),
    [
      artworks,
      beginPlacement,
      capturePlacement,
      endPlacement,
      error,
      featuredArtworkId,
      isLoading,
      maximumImageBytes,
      placementDraft,
      publishArtwork,
      refreshImages,
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
