import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSignTypedData } from '@starknetfoundation/starknet-start-react';
import { useSectors } from '../../contexts/SectorContext';
import { useSectorImages } from '../../contexts/SectorImageContext';
import { useWallet } from '../../contexts/WalletContext';
import { api, type PreparedSectorImage } from '../../services/api';
import {
  clipboardImageFile,
  prepareSectorImage,
} from '../../utils/sectorImage';

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
        beginPlacement(nextPreviewUrl);
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

  useEffect(() => {
    if (!active || !isImageUploadMode) return;

    const handlePaste = (event: ClipboardEvent) => {
      if (
        event.defaultPrevented ||
        isUploading ||
        imageUploadSectorIds.length === 0
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, [contenteditable]:not([contenteditable="false"])'
        )
      ) {
        return;
      }

      const file = clipboardImageFile(event.clipboardData);
      if (!file) return;

      event.preventDefault();
      void chooseFile(file);
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [
    active,
    chooseFile,
    imageUploadSectorIds.length,
    isImageUploadMode,
    isUploading,
  ]);

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

  const exitImageUpload = () => {
    if (isUploading) return;
    discardPreparedImage();
    endImageUpload();
  };

  return (
    <aside className="activity-scrollbar pointer-events-auto absolute bottom-20 left-3 right-3 top-20 overflow-y-auto border border-neutral-600 bg-black/90 font-mono text-xs text-fg shadow-[8px_8px_0_rgba(255,255,255,0.06)] backdrop-blur-sm sm:bottom-auto sm:left-auto sm:right-4 sm:max-h-[calc(100vh-7rem)] sm:w-[24rem]">
      <header className="flex items-center justify-between gap-4 border-b border-neutral-600 px-4 py-3">
        <div>
          <div className="text-[9px] tracking-[0.24em] text-amber-300">
            IMAGE UPLOAD
          </div>
          <div className="mt-1 text-base tracking-[0.12em]">
            ASSIGN SECTOR ART
          </div>
        </div>
        <button
          type="button"
          onClick={exitImageUpload}
          disabled={isUploading}
          className="border border-grid px-2 py-1 text-[9px] tracking-[0.16em] text-dim transition-colors hover:border-neutral-500 hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-50"
        >
          RETURN TO CORE
        </button>
      </header>

      <div className="px-4 py-3">
        <p className="leading-relaxed text-neutral-400">
          The selected surface is isolated on the Core. Choose one image, then
          position it from your current view.
        </p>

        <div className="mt-4">
          <div className="mb-2 flex justify-between text-[9px] tracking-[0.2em] text-dim">
            <span>UPLOAD TARGETS</span>
            {replacementCount > 0 ? (
              <span className="text-neutral-500">
                {replacementCount} REPLACEMENT
                {replacementCount === 1 ? '' : 'S'}
              </span>
            ) : null}
          </div>
          <div className="flex h-[54px] items-center justify-between border border-neutral-800 px-3">
            <div className="flex items-center gap-2" aria-live="polite">
              <span className="font-display text-2xl tabular-nums text-white">
                {imageUploadSectorIds.length}
              </span>
              <span className="text-[9px] tracking-[0.18em] text-neutral-500">
                SECTOR{imageUploadSectorIds.length === 1 ? '' : 'S'} ISOLATED
              </span>
            </div>
            <span className="h-2 w-2 bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.65)]" />
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
          className="mt-4 grid w-full grid-cols-[74px_1fr] items-center gap-4 border border-dashed border-neutral-600 bg-neutral-950 px-3 py-3 text-left transition-colors hover:border-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-60"
        >
          <span className="grid h-[64px] w-[64px] place-items-center bg-black">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Prepared Sector image preview"
                className="h-[58px] w-[58px] object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="block h-[48px] w-[48px] border border-neutral-700"
              />
            )}
          </span>
          <span>
            <span className="block text-[10px] tracking-[0.16em] text-neutral-300">
              {isPreparing
                ? 'PREPARING IMAGE…'
                : prepared
                  ? 'CHANGE IMAGE'
                  : 'CHOOSE, DROP, OR PASTE'}
            </span>
            <span className="mt-1 block break-all text-[9px] leading-relaxed tracking-[0.08em] text-neutral-600">
              {fileName || 'WEBP · JPEG · PNG · CTRL/⌘V'}
            </span>
            {prepared ? (
              <span className="mt-1 block text-[8px] tracking-[0.1em] text-neutral-500">
                512 PX · {formatMebibytes(prepared.detail.size)}
              </span>
            ) : null}
          </span>
        </button>

        {placementDraft ? (
          <button
            type="button"
            disabled={isUploading}
            onClick={discardPreparedImage}
            className="mt-3 text-[9px] tracking-[0.18em] text-neutral-500 hover:text-white disabled:opacity-50"
          >
            CANCEL PLACEMENT
          </button>
        ) : null}

        {imageServiceError ? (
          <div className="mt-3 border border-red-700/70 px-3 py-2 text-[9px] leading-relaxed tracking-[0.08em] text-red-400">
            IMAGE SERVICE · {imageServiceError}
          </div>
        ) : null}
        {!isImageServiceLoading && !uploadsEnabled && !imageServiceError ? (
          <div className="mt-3 border border-neutral-700 px-3 py-2 text-[9px] leading-relaxed tracking-[0.08em] text-neutral-500">
            UPLOADS OFFLINE · IMAGE STORAGE IS NOT CONFIGURED
          </div>
        ) : null}
        {uploadError ? (
          <div
            role="alert"
            className="mt-3 border border-red-700/70 px-3 py-2 text-[9px] leading-relaxed tracking-[0.08em] text-red-400"
          >
            UPLOAD FAILED · {uploadError}
          </div>
        ) : null}
        {uploadNotice ? (
          <div
            role="status"
            className="mt-3 border border-amber-400/50 px-3 py-2 text-[9px] leading-relaxed tracking-[0.08em] text-amber-300"
          >
            {uploadNotice.toUpperCase()}
          </div>
        ) : null}

        <button
          type="button"
          disabled={isUploadDisabled}
          onClick={() => void upload()}
          className="mt-4 w-full border border-white bg-white px-4 py-3 text-[10px] font-semibold tracking-[0.2em] text-black transition-colors hover:bg-neutral-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-600"
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
        </button>

        <div className="mt-4 border-t border-grid pt-3 text-[8px] leading-relaxed tracking-[0.11em] text-neutral-600">
          ONE IMAGE RUNS CONTINUOUSLY ACROSS THE SELECTED SURFACE. LOSING A
          SECTOR HIDES THAT PORTION OF THE ARTWORK.
        </div>
      </div>
    </aside>
  );
}
