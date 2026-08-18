import { World } from '../components/3d/World';
import { SelectionPanel } from '../components/ui/SelectionPanel';
import { OperatorStatusPanel } from '../components/ui/OperatorStatusPanel';
import { CoreModeSwitch } from '../components/ui/CoreModeSwitch';
import { ProjectionPanel } from '../components/ui/ProjectionPanel';
import { SectorLegend } from '../components/ui/SectorLegend';

export function Home() {
  return (
    <div className="relative w-full h-full">
      <World />
      <OperatorStatusPanel />
      <CoreModeSwitch />
      <SectorLegend />

      <SelectionPanel />
      <ProjectionPanel />
    </div>
  );
}
