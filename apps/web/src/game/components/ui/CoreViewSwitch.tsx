import { useSectors } from '../../contexts/SectorContext';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';

export function CoreViewSwitch() {
  const {
    ownedSectorIds,
    isOwnedSectorsView,
    setOwnedSectorsView,
    isImageUploadMode,
  } = useSectors();

  if (isImageUploadMode || ownedSectorIds.length === 0) return null;

  return (
    <button
      type="button"
      data-preserve-core-tracking
      aria-pressed={isOwnedSectorsView}
      onClick={() => setOwnedSectorsView(!isOwnedSectorsView)}
      className={`pointer-events-auto absolute bottom-5 left-1/2 flex w-48 -translate-x-1/2 select-none items-center justify-center gap-2 border bg-black/25 px-3 py-2.5 font-mono text-[10px] tracking-[0.16em] backdrop-blur-[2px] transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white ${
        isOwnedSectorsView
          ? 'border-[#ffb82e]/60 text-white'
          : 'border-transparent text-neutral-500'
      }`}
    >
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 rotate-45 border transition-colors"
        style={{
          borderColor: SECTOR_COLORS.owned,
          backgroundColor: isOwnedSectorsView
            ? SECTOR_COLORS.owned
            : 'transparent',
        }}
      />
      <span>YOUR SECTORS</span>
    </button>
  );
}
