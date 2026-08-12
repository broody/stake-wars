import { World } from '../components/3d/World';
import { SelectionPanel } from '../components/ui/SelectionPanel';
import { OperatorStatusPanel } from '../components/ui/OperatorStatusPanel';
import { CoreModeSwitch } from '../components/ui/CoreModeSwitch';
import { ProjectionPanel } from '../components/ui/ProjectionPanel';
import { ControlPointLegend } from '../components/ui/ControlPointLegend';

export function Home() {
  return (
    <div className="relative w-full h-full">
      <World />
      <OperatorStatusPanel />
      <CoreModeSwitch />
      <ControlPointLegend />

      {/* Bottom-right Twitter link */}
      <div className="absolute bottom-4 right-4 text-dim font-mono text-sm">
        <a
          href="https://twitter.com/stakewars_gg"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-fg transition-colors"
        >
          @stakewars_gg
        </a>
      </div>

      <SelectionPanel />
      <ProjectionPanel />
    </div>
  );
}
