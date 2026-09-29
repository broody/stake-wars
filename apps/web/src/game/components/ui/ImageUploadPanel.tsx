import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSignTypedData } from '@starknetfoundation/starknet-start-react';
import { useSectors } from '../../contexts/SectorContext';
import { useSectorImages } from '../../contexts/SectorImageContext';
import { useWallet } from '../../contexts/WalletContext';
import { useClipboardImagePaste } from '../../hooks/useClipboardImagePaste';
import { api, type PreparedSectorImage } from '../../services/api';
import { prepareSectorImage } from '../../utils/sectorImage';
import { BusyLabel, Button, Callout, Eyebrow, panelStyles } from '../../../ui';

function formatMebibytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function ImageUploadPanel({ active = true }: { active?: boolean }) {
  const { address } = useWallet();
  const { signTypedDataAsync } = useSignTypedData({});
  const {
    isImageUploadMode,
    imageUploadSectorIds,
    sectorOwnershipById,
    endImageUpload,
  } = useSectors();
  const {
    artworks,
    isLoading: isImageServiceLoading,
    error: imageServiceError,
    uploadsEnabled,
    maximumImageBytes,
    placementDraft,
    lockPlacement,
    unlockPlacement,
    beginPlacement,
    endPlacement,
    publishArtwork,
  } = useSectorImages();
  const inputRef = useRef<HTMLInputElement>(null);
  const preparationVersionRef = useRef(0);
  const [prepared, setPrepared] = useState<PreparedSectorImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPreparing, setPreparing] = useState(false);
  const [isUploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const selectedOwnerships = useMemo(
    () =>
      imageUploadSectorIds.map((sectorId) => ({
        sectorId,
        ownership: sectorOwnershipById.get(sectorId),
      })),
    [imageUploadSectorIds, sectorOwnershipById]
  );
  const imagedSectorIds = useMemo(
    () =>
      new Set(
        artworks.flatMap((artwork) =>
          artwork.targets.map((target) => target.sectorId)
        )
      ),
    [artworks]
  );
  const replacementCount = imageUploadSectorIds.filter((sectorId) =>
    imagedSectorIds.has(sectorId)
  ).length;

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  useEffect(() => {
    if (!isImageUploadMode && placementDraft) endPlacement();
  }, [endPlacement, isImageUploadMode, placementDraft]);

  const discardPreparedImage = useCallback(() => {
    preparationVersionRef.current += 1;
    endPlacement();
    setPrepared(null);
    setFileName(null);
    setPreparing(false);
    setUploadError(null);
    setUploadNotice(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (inputRef.current) inputRef.current.value = '';
  }, [endPlacement]);

  const chooseFile = useCallback(
    async (file: File | undefined) => {
      if (!file || imageUploadSectorIds.length === 0) return;
      const preparationVersion = ++preparationVersionRef.current;
      setPreparing(true);
      setUploadError(null);
      setUploadNotice(null);
      try {
        const next = await prepareSectorImage(file, maximumImageBytes);
        if (preparationVersion !== preparationVersionRef.current) return;

        const nextPreviewUrl = URL.createObjectURL(next.detail);
        endPlacement();
        setPrepared(next);
        setFileName(file.name || 'PASTED IMAGE');
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextPreviewUrl;
        });
        beginPlacement(nextPreviewUrl, next.imageAspect);
      } catch (failure) {
        if (preparationVersion !== preparationVersionRef.current) return;
        setUploadError(
          failure instanceof Error
            ? failure.message
            : 'Unable to prepare this image.'
        );
      } finally {
        if (preparationVersion === preparationVersionRef.current) {
          setPreparing(false);
        }
      }
    },
    [
      beginPlacement,
      endPlacement,
      maximumImageBytes,
      imageUploadSectorIds.length,
    ]
  );

  useClipboardImagePaste(
    active &&
      isImageUploadMode &&
      !isUploading &&
      imageUploadSectorIds.length > 0,
    chooseFile
  );

  useEffect(() => {
    if (!active || !isImageUploadMode || isUploading) return;

    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (isPreparing || placementDraft) {
        discardPreparedImage();
      } else {
        endImageUpload();
      }
    };

    document.addEventListener('keydown', cancelOnEscape);
    return () => document.removeEventListener('keydown', cancelOnEscape);
  }, [
    active,
    discardPreparedImage,
    endImageUpload,
    isImageUploadMode,
    isPreparing,
    isUploading,
    placementDraft,
  ]);

  if (!isImageUploadMode) return null;

  const upload = async () => {
    if (
      !address ||
      !prepared ||
      !placementDraft?.placement ||
      selectedOwnerships.length === 0
    )
      return;
    if (selectedOwnerships.some(({ ownership }) => !ownership)) {
      setUploadError('Refresh ownership before uploading this image.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadNotice(null);
    try {
      const published = await api.uploadSectorArtwork({
        walletAddress: address,
        targets: selectedOwnerships.map(({ sectorId, ownership }) => ({
          sectorId,
          ownershipGeneration: ownership!.ownershipGeneration,
        })),
        placement: placementDraft.placement,
        prepared,
        signTypedData: signTypedDataAsync,
        onSigningComplete: lockPlacement,
      });
      publishArtwork(published);
      setUploadNotice(
        `Image published to ${selectedOwnerships.length} Sector${
          selectedOwnerships.length === 1 ? '' : 's'
        }.`
      );
      discardPreparedImage();
      endImageUpload();
    } catch (failure) {
      unlockPlacement();
      setUploadError(
        failure instanceof Error ? failure.message : 'Image upload failed.'
      );
    } finally {
      setUploading(false);
    }
  };

  const isUploadDisabled =
    isPreparing ||
    isUploading ||
    !uploadsEnabled ||
    !prepared ||
    !placementDraft?.placement ||
    imageUploadSectorIds.length === 0;
  const isUploadBusy =
    isImageServiceLoading ||
    isUploading ||
    (imageUploadSectorIds.length > 0 &&
      Boolean(prepared) &&
      !placementDraft?.placement);

  const exitImageUpload = () => {
    if (isUploading) return;
    discardPreparedImage();
    endImageUpload();
  };

  return (
    <aside
      className={panelStyles(
        'floating',
        'activity-scrollbar pointer-events-auto absolute bottom-20 left-3 right-3 top-20 overflow-y-auto font-mono text-caption text-fg sm:bottom-auto sm:left-auto sm:right-4 sm:max-h-[calc(100vh-7rem)] sm:w-[24rem]'
      )}
    >
      <header className="flex items-center justify-between gap-4 border-b border-line-strong px-4 py-3">
        <div className="min-w-0">
          <Eyebrow tone="warning">IMAGE UPLOAD</Eyebrow>
          <div className="mt-1 text-heading">ASSIGN SECTOR ART</div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exitImageUpload}
          disabled={isUploading}
          className="shrink-0"
        >
          RETURN TO CORE
        </Button>
      </header>

      <div className="px-4 py-3">
        <p className="text-fg-muted">
          Your selected Sectors are highlighted on the Core. Choose one image,
          then position it from your current view.
        </p>

        <div className="mt-4">
          <div className="mb-2 flex justify-between gap-3 text-label text-fg-subtle">
            <span>UPLOAD TARGETS</span>
            {replacementCount > 0 ? (
              <span className="text-fg-muted">
                {replacementCount} REPLACEMENT
                {replacementCount === 1 ? '' : 'S'}
              </span>
            ) : null}
          </div>
          <div className="flex h-[54px] items-center justify-between border border-line px-3">
            <div className="flex items-center gap-2" aria-live="polite">
              <span className="font-display text-figure tabular-nums text-fg">
                {imageUploadSectorIds.length}
              </span>
              <span className="text-label text-fg-subtle">
                SECTOR{imageUploadSectorIds.length === 1 ? '' : 'S'} TARGETED
              </span>
            </div>
            <span className="h-2 w-2 bg-warning-soft shadow-glow-warning" />
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/webp,image/jpeg,image/png"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void chooseFile(file);
          }}
        />
        <button
          type="button"
          disabled={isPreparing || isUploading}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void chooseFile(event.dataTransfer.files[0]);
          }}
          className="mt-4 grid w-full grid-cols-[74px_1fr] items-center gap-4 border border-dashed border-line-strong bg-surface-raised px-3 py-3 text-left transition-colors hover:border-fg disabled:cursor-wait disabled:opacity-60"
        >
          <span className="grid h-[64px] w-[64px] place-items-center bg-surface">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Prepared Sector image preview"
                className="max-h-[58px] max-w-[58px]"
              />
            ) : (
              <span
                aria-hidden="true"
                className="block h-[48px] w-[48px] border border-line-strong"
              />
            )}
          </span>
          <span>
            <span className="block text-label text-fg-secondary">
              <BusyLabel busy={isPreparing}>
                {isPreparing
                  ? 'PREPARING IMAGE…'
                  : prepared
                    ? 'CHANGE IMAGE'
                    : 'CHOOSE, DROP, OR PASTE'}
              </BusyLabel>
            </span>
            <span className="mt-1 block break-all text-label text-fg-subtle">
              {fileName || 'WEBP · JPEG · PNG · CTRL/⌘V'}
            </span>
            {prepared ? (
              <span className="mt-1 block text-tag text-fg-subtle">
                MAX 512 PX · {formatMebibytes(prepared.detail.size)}
              </span>
            ) : null}
          </span>
        </button>

        {placementDraft ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={isUploading}
            onClick={discardPreparedImage}
            className="mt-3 px-0"
          >
            CANCEL PLACEMENT
          </Button>
        ) : null}

        {imageServiceError ? (
          <Callout tone="danger" className="mt-3">
            IMAGE SERVICE · {imageServiceError}
          </Callout>
        ) : null}
        {!isImageServiceLoading && !uploadsEnabled && !imageServiceError ? (
          <Callout className="mt-3">
            UPLOADS UNAVAILABLE · IMAGE STORAGE IS NOT CONFIGURED
          </Callout>
        ) : null}
        {uploadError ? (
          <Callout role="alert" tone="danger" className="mt-3">
            UPLOAD FAILED · {uploadError}
          </Callout>
        ) : null}
        {uploadNotice ? (
          <Callout role="status" tone="warning" className="mt-3">
            {uploadNotice.toUpperCase()}
          </Callout>
        ) : null}

        <Button
          variant="solid"
          fullWidth
          disabled={isUploadDisabled}
          busy={isUploadBusy}
          onClick={() => void upload()}
          className="mt-4"
        >
          {isImageServiceLoading
            ? 'CHECKING IMAGE SERVICE…'
            : isUploading
              ? 'PUBLISHING IMAGE…'
              : imageUploadSectorIds.length === 0
                ? 'SELECT SECTORS'
                : !prepared
                  ? 'CHOOSE IMAGE'
                  : placementDraft?.placement
                    ? `PUBLISH ACROSS ${imageUploadSectorIds.length} SECTOR${imageUploadSectorIds.length === 1 ? '' : 'S'}`
                    : 'LOCKING CAMERA…'}
        </Button>

        <div className="mt-4 border-t border-line pt-3 text-tag text-fg-subtle">
          ONE IMAGE RUNS CONTINUOUSLY ACROSS THE SELECTED SURFACE. LOSING A
          SECTOR HIDES THAT PORTION OF THE ARTWORK.
        </div>
      </div>
    </aside>
  );
}
