import { useSectors } from '../../contexts/SectorContext';
import { useSectorImages } from '../../contexts/SectorImageContext';

export function CoreViewSwitch() {
  const {
    isProjectionVisible,
    setProjectionVisible,
    setCoreWaveFlipped,
    isImageUploadMode,
    isSectorIndexLoading,
  } = useSectors();
  const { isLoading, isThumbnailAtlasLoading } = useSectorImages();
  const isProjectionLoading =
    isLoading || isSectorIndexLoading || isThumbnailAtlasLoading;

  if (isImageUploadMode) return null;

  return (
    <label
      data-preserve-core-tracking
      aria-busy={isProjectionLoading}
      className={`pointer-events-auto absolute bottom-5 left-1/2 flex w-48 -translate-x-1/2 select-none items-center justify-center gap-2 bg-black/25 px-3 py-2.5 font-mono text-[10px] tracking-[0.16em] text-neutral-500 backdrop-blur-[2px] transition-colors ${
        isProjectionLoading ? 'cursor-wait' : 'cursor-pointer hover:text-white'
      }`}
    >
      <input
        type="checkbox"
        checked={isProjectionVisible}
        disabled={isProjectionLoading}
        onChange={(event) => {
          const visible = event.target.checked;
          setProjectionVisible(visible);
          setCoreWaveFlipped(visible);
        }}
        className="peer sr-only"
      />
      {isProjectionLoading ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border border-neutral-700 border-t-neutral-300 motion-reduce:animate-none"
        />
      ) : (
        <span
          aria-hidden="true"
          className={`grid h-3.5 w-3.5 place-items-center border transition-colors peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white ${
            isProjectionVisible
              ? 'border-white bg-white text-black'
              : 'border-neutral-600 bg-black'
          }`}
        >
          {isProjectionVisible ? '×' : ''}
        </span>
      )}
      <span>SHOW PROJECTION</span>
      {isProjectionLoading ? (
        <span className="sr-only">Loading projection thumbnails</span>
      ) : null}
    </label>
  );
}
