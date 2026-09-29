import type { ReactNode } from 'react';
import { useSectors } from '../../contexts/SectorContext';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';

function ViewToggle({
  label,
  pressed,
  activeBorderClassName,
  icon,
  onToggle,
}: {
  label: string;
  pressed: boolean;
  activeBorderClassName: string;
  icon: ReactNode;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={`pointer-events-auto flex w-40 select-none items-center justify-center gap-2 border bg-surface/25 px-3 py-2.5 font-mono text-label backdrop-blur-[2px] transition-colors hover:text-fg ${
        pressed
          ? `${activeBorderClassName} text-fg`
          : 'border-transparent text-fg-subtle'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function CoreViewSwitch() {
  const {
    controlView,
    changeControlView,
    ownedSectorIds,
    isOwnedSectorsView,
    setOwnedSectorsView,
    isImageUploadMode,
  } = useSectors();

  if (isImageUploadMode) return null;

  const isStakedView = controlView === 'staked';

  return (
    <div
      data-preserve-core-tracking
      className="pointer-events-none absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2"
    >
      <ViewToggle
        label="STAKED VIEW"
        pressed={isStakedView}
        activeBorderClassName="border-fg/50"
        onToggle={() => changeControlView(isStakedView ? 'flat' : 'staked')}
        icon={
          <span aria-hidden="true" className="flex h-2.5 items-end gap-px">
            {[40, 70, 100].map((height) => (
              <span
                key={height}
                className={`w-[3px] transition-colors ${
                  isStakedView ? 'bg-fg' : 'bg-line-strong'
                }`}
                style={{ height: `${height}%` }}
              />
            ))}
          </span>
        }
      />
      {ownedSectorIds.length > 0 ? (
        <ViewToggle
          label="YOUR SECTORS"
          pressed={isOwnedSectorsView}
          activeBorderClassName="border-owned/60"
          onToggle={() => setOwnedSectorsView(!isOwnedSectorsView)}
          icon={
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
          }
        />
      ) : null}
    </div>
  );
}
