import { useEffect, useState } from 'react';
import { World } from '../components/3d/World';
import { SelectionPanel } from '../components/ui/SelectionPanel';
import { CoreViewSwitch } from '../components/ui/CoreViewSwitch';
import { ImageUploadPanel } from '../components/ui/ImageUploadPanel';
import { SectorLegend } from '../components/ui/SectorLegend';

export function Home({ active = true }: { active?: boolean }) {
  const [isWalkMode, setWalkMode] = useState(false);

  useEffect(() => {
    if (!active) setWalkMode(false);
  }, [active]);

  return (
    <div className="relative w-full h-full">
      <World
        active={active}
        isWalkMode={isWalkMode}
        onWalkModeChange={setWalkMode}
      />
      {isWalkMode ? null : (
        <>
          <CoreViewSwitch />
          <SectorLegend />

          <SelectionPanel active={active} />
          <ImageUploadPanel active={active} />
        </>
      )}
    </div>
  );
}
