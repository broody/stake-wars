import { useEffect, useMemo, useRef, useState } from 'react';
import { useSignTypedData } from '@starknet-start/react';
import { useControlPoints } from '../../contexts/ControlPointContext';
import { useControlPointImages } from '../../contexts/ControlPointImageContext';
import { useWallet } from '../../contexts/WalletContext';
import { api, type PreparedControlPointImage } from '../../services/api';
import { prepareControlPointImage } from '../../utils/controlPointImage';

function controlPointLabel(controlPointId: number): string {
  return `CP-${controlPointId.toString().padStart(4, '0')}`;
}

function formatMebibytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function ProjectionPanel() {
  const { address } = useWallet();
  const { signTypedDataAsync } = useSignTypedData({});
  const {
    mode,
    projectionControlPointIds,
    projectionLoadingId,
    projectionError,
    controlPointOwnershipById,
    toggleProjectionControlPoint,
    clearProjectionSelection,
  } = useControlPoints();
  const {
    artworks,
    isLoading: isImageServiceLoading,
    error: imageServiceError,
    uploadsEnabled,
    maximumImageBytes,
    placementDraft,
    beginPlacement,
    updatePlacement,
    endPlacement,
    publishArtwork,
  } = useControlPointImages();
  const inputRef = useRef<HTMLInputElement>(null);
  const [prepared, setPrepared] = useState<PreparedControlPointImage | null>(
    null
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPreparing, setPreparing] = useState(false);
  const [isUploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const selectedOwnerships = useMemo(
    () =>
      projectionControlPointIds.map((controlPointId) => ({
        controlPointId,
        ownership: controlPointOwnershipById.get(controlPointId),
      })),
    [controlPointOwnershipById, projectionControlPointIds]
  );
  const imagedControlPointIds = useMemo(
    () =>
      new Set(
        artworks.flatMap((artwork) =>
          artwork.targets.map((target) => target.controlPointId)
        )
      ),
    [artworks]
  );
  const replacementCount = projectionControlPointIds.filter((controlPointId) =>
    imagedControlPointIds.has(controlPointId)
  ).length;

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  useEffect(() => {
    if (mode !== 'projection' && placementDraft) endPlacement();
  }, [endPlacement, mode, placementDraft]);

  if (mode !== 'projection') return null;

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    setUploadError(null);
    setUploadNotice(null);
    try {
      const next = await prepareControlPointImage(file, maximumImageBytes);
      endPlacement();
      setPrepared(next);
      setFileName(file.name);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(next.detail);
      });
    } catch (failure) {
      setPrepared(null);
      setFileName(null);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setUploadError(
        failure instanceof Error
          ? failure.message
          : 'Unable to prepare this image.'
      );
    } finally {
      setPreparing(false);
    }
  };

  const upload = async () => {
    if (
      !address ||
      !prepared ||
      !placementDraft?.placement ||
      selectedOwnerships.length === 0
    )
      return;
    if (selectedOwnerships.some(({ ownership }) => !ownership)) {
      setUploadError('Refresh ownership before projecting this image.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadNotice(null);
    try {
      const published = await api.uploadControlPointArtwork({
        walletAddress: address,
        targets: selectedOwnerships.map(({ controlPointId, ownership }) => ({
          controlPointId,
          ownershipGeneration: ownership!.ownershipGeneration,
        })),
        placement: placementDraft.placement,
        prepared,
        signTypedData: signTypedDataAsync,
      });
      publishArtwork(published);
      setUploadNotice(
        `Image projected to ${selectedOwnerships.length} Control Point${
          selectedOwnerships.length === 1 ? '' : 's'
        }.`
      );
      endPlacement();
      clearProjectionSelection();
    } catch (failure) {
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
    projectionControlPointIds.length === 0;

  return (
    <aside className="activity-scrollbar pointer-events-auto absolute bottom-20 left-3 right-3 top-20 overflow-y-auto border border-neutral-600 bg-black/90 font-mono text-xs text-fg shadow-[8px_8px_0_rgba(255,255,255,0.06)] backdrop-blur-sm sm:bottom-auto sm:left-auto sm:right-4 sm:max-h-[calc(100vh-7rem)] sm:w-[24rem]">
      <header className="border-b border-neutral-600 px-4 py-3">
        <div className="text-[9px] tracking-[0.24em] text-dim">
          IMAGE PROJECTION
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-4">
          <span className="text-base tracking-[0.12em]">
            ASSIGN CONTROL POINT ART
          </span>
          <span className="text-[10px] tracking-wider text-neutral-500">
            {projectionControlPointIds.length} VERIFIED
          </span>
        </div>
      </header>

      <div className="px-4 py-3">
        <p className="leading-relaxed text-neutral-400">
          Select the surface you own, choose one image, then position its
          projection from your current view of the Core.
        </p>

        {projectionLoadingId !== null ? (
          <div className="mt-3 flex items-center gap-3 border-t border-grid pt-3 text-dim">
            <span className="h-2 w-2 animate-pulse bg-amber-400" />
            VERIFYING {controlPointLabel(projectionLoadingId)}…
          </div>
        ) : null}

        {projectionError ? (
          <div className="mt-3 border border-amber-500/50 px-3 py-2 leading-relaxed text-amber-400">
            {projectionError}
          </div>
        ) : null}

        {projectionControlPointIds.length === 0 ? (
          <div className="mt-4 border border-dashed border-neutral-800 px-3 py-5 text-center text-[10px] tracking-[0.16em] text-neutral-600">
            SELECT YOUR CONTROL POINTS ON THE CORE
          </div>
        ) : (
          <div className="mt-4">
            <div className="mb-2 flex justify-between text-[9px] tracking-[0.2em] text-dim">
              <span>PROJECTION TARGETS</span>
              {replacementCount > 0 ? (
                <span className="text-neutral-500">
                  {replacementCount} REPLACEMENT
                  {replacementCount === 1 ? '' : 'S'}
                </span>
              ) : null}
            </div>
            <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
              {projectionControlPointIds.map((controlPointId) => (
                <button
                  key={controlPointId}
                  type="button"
                  disabled={isUploading || placementDraft !== null}
                  onClick={() =>
                    void toggleProjectionControlPoint(controlPointId)
                  }
                  className="border border-neutral-600 px-2 py-1.5 text-[10px] tracking-wider text-neutral-300 transition-colors hover:border-white hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-50"
                  aria-label={`Remove Control Point ${controlPointId} from projection`}
                >
                  {controlPointLabel(controlPointId)} ×
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={isUploading || placementDraft !== null}
              onClick={clearProjectionSelection}
              className="mt-3 text-[9px] tracking-[0.2em] text-neutral-500 transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-50"
            >
              CLEAR TARGETS
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/webp,image/jpeg,image/png"
          className="sr-only"
          onChange={(event) => void chooseFile(event.target.files?.[0])}
        />
        <button
          type="button"
          disabled={isPreparing || isUploading || placementDraft !== null}
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
                alt="Prepared Control Point image preview"
                className="h-[58px] w-[58px] object-cover"
                style={{ clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }}
              />
            ) : (
              <span
                aria-hidden="true"
                className="block h-[48px] w-[48px] border border-neutral-700"
                style={{ clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }}
              />
            )}
          </span>
          <span>
            <span className="block text-[10px] tracking-[0.16em] text-neutral-300">
              {isPreparing
                ? 'PREPARING IMAGE…'
                : prepared
                  ? 'CHANGE IMAGE'
                  : 'CHOOSE OR DROP IMAGE'}
            </span>
            <span className="mt-1 block break-all text-[9px] leading-relaxed tracking-[0.08em] text-neutral-600">
              {fileName || 'WEBP · JPEG · PNG'}
            </span>
            {prepared ? (
              <span className="mt-1 block text-[8px] tracking-[0.1em] text-neutral-500">
                512 PX · {formatMebibytes(prepared.detail.size)}
              </span>
            ) : null}
          </span>
        </button>

        {placementDraft ? (
          <div className="mt-4 border border-neutral-700 bg-neutral-950 px-3 py-3">
            <div className="flex items-center justify-between gap-3 text-[9px] tracking-[0.18em]">
              <span className="text-neutral-300">POSITION ON CORE</span>
              <span className="text-amber-300">
                {placementDraft.placement ? 'LIVE VIEW' : 'STARTING VIEW…'}
              </span>
            </div>
            <p className="mt-2 leading-relaxed text-neutral-500">
              Drag the square to move the image. Drag any corner or scroll over
              it to resize while preserving its proportions. Outside the square,
              orbit, pan, or zoom the Core to choose the projection angle. The
              live surface preview is the published result.
            </p>
            {placementDraft.placement ? (
              <label className="mt-3 block">
                <span className="mb-2 flex justify-between text-[9px] tracking-[0.16em] text-neutral-500">
                  <span>ROTATION</span>
                  <span>
                    {Math.round(
                      (placementDraft.placement.rotation * 180) / Math.PI
                    )}
                    °
                  </span>
                </span>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={(placementDraft.placement.rotation * 180) / Math.PI}
                  onChange={(event) =>
                    updatePlacement({
                      rotation: (Number(event.target.value) * Math.PI) / 180,
                    })
                  }
                  className="w-full accent-amber-300"
                />
              </label>
            ) : null}
            <button
              type="button"
              disabled={isUploading}
              onClick={endPlacement}
              className="mt-3 text-[9px] tracking-[0.18em] text-neutral-500 hover:text-white disabled:opacity-50"
            >
              CANCEL PLACEMENT
            </button>
          </div>
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
          disabled={
            placementDraft
              ? isUploadDisabled
              : isPreparing ||
                isUploading ||
                !uploadsEnabled ||
                !prepared ||
                projectionControlPointIds.length === 0
          }
          onClick={() => {
            if (!placementDraft && previewUrl) beginPlacement(previewUrl);
            else void upload();
          }}
          className="mt-4 w-full border border-white bg-white px-4 py-3 text-[10px] font-semibold tracking-[0.2em] text-black transition-colors hover:bg-neutral-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-600"
        >
          {isImageServiceLoading
            ? 'CHECKING IMAGE SERVICE…'
            : isUploading
              ? 'PUBLISHING PROJECTION…'
              : projectionControlPointIds.length === 0
                ? 'SELECT CONTROL POINTS'
                : placementDraft
                  ? placementDraft.placement
                    ? `PUBLISH ACROSS ${projectionControlPointIds.length} CONTROL POINT${projectionControlPointIds.length === 1 ? '' : 'S'}`
                    : 'LOCKING CAMERA…'
                  : 'POSITION ON CORE'}
        </button>

        <div className="mt-4 border-t border-grid pt-3 text-[8px] leading-relaxed tracking-[0.11em] text-neutral-600">
          ONE ARTWORK IS PROJECTED CONTINUOUSLY ACROSS THE SELECTED SURFACE.
          LOSING A CONTROL POINT HIDES THAT PORTION OF THE ARTWORK.
        </div>
      </div>
    </aside>
  );
}
