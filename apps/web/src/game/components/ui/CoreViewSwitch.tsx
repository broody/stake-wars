import { useSectors } from '../../contexts/SectorContext';

export function CoreViewSwitch() {
  const { isProjectionVisible, setProjectionVisible, isImageUploadMode } =
    useSectors();

  if (isImageUploadMode) return null;

  return (
    <label className="pointer-events-auto absolute bottom-5 left-4 flex w-48 cursor-pointer items-center gap-2 border-l border-neutral-700 bg-black/25 py-2.5 pl-3 font-mono text-[10px] tracking-[0.16em] text-neutral-500 backdrop-blur-[2px] transition-colors hover:text-white">
      <input
        type="checkbox"
        checked={isProjectionVisible}
        onChange={(event) => setProjectionVisible(event.target.checked)}
        className="peer sr-only"
      />
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
      <span>SHOW PROJECTION</span>
    </label>
  );
}
