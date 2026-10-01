import { useSearchParams } from 'react-router-dom';
import { World } from '../components/3d/World';
import { SelectionPanel } from '../components/ui/SelectionPanel';
import { CoreViewSwitch } from '../components/ui/CoreViewSwitch';
import { ImageUploadPanel } from '../components/ui/ImageUploadPanel';
import { SectorLegend } from '../components/ui/SectorLegend';
import { CoreSurvivorsHud } from '../components/ui/CoreSurvivorsHud';
import { isSurviveMode } from '../survivors/session';

export function Home({ active = true }: { active?: boolean }) {
  const [searchParams] = useSearchParams();
  const isSurviving = isSurviveMode(searchParams);

  return (
    <div className="relative w-full h-full">
      <World active={active} />
      {isSurviving ? (
        active ? (
          <CoreSurvivorsHud />
        ) : null
      ) : (
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
