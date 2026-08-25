import { World } from '../components/3d/World';
import { SelectionPanel } from '../components/ui/SelectionPanel';
import { CoreViewSwitch } from '../components/ui/CoreViewSwitch';
import { ImageUploadPanel } from '../components/ui/ImageUploadPanel';
import { SectorLegend } from '../components/ui/SectorLegend';

export function Home() {
  return (
    <div className="relative w-full h-full">
      <World />
      <CoreViewSwitch />
      <SectorLegend />

      <SelectionPanel />
      <ImageUploadPanel />
    </div>
  );
}
