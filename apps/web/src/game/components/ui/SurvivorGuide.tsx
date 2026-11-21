import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dialog, DialogHeader } from '../../../ui';
import { SurvivorUpgradeTile } from './SurvivorsIcon';
import xpShard from './xp-shard.webp';
import supplyDrop from './supply-drop.webp';

const tips = [
  {
    title: 'Collect shards',
    detail: 'Move near shards from fallen enemies to gain XP.',
    visual: <img src={xpShard} alt="" className="size-12" />,
  },
  {
    title: 'Choose upgrades',
    detail: 'Each time you level up, pick a new skill or improve one you have.',
    visual: <SurvivorUpgradeTile kind="weapon" icon="blade" level={2} />,
  },
  {
    title: 'Grab Supply Drops',
    detail: 'A Captain’s drop gives one upgrade. A Warden’s gives three.',
    visual: <img src={supplyDrop} alt="" className="size-12" />,
  },
];

export function SurvivorGuide({
  onClose,
  onStart,
  starting,
  error,
}: {
  onClose: () => void;
  onStart: () => void;
  starting: boolean;
  error: string;
}) {
  const startRef = useRef<HTMLButtonElement>(null);
  return createPortal(
    <Dialog
      open
      size="sm"
      labelledBy="survivor-guide-title"
      describedBy="survivor-guide-controls"
      initialFocus={startRef}
      onClose={onClose}
      canClose={!starting}
    >
      <DialogHeader
        title="How to play"
        titleId="survivor-guide-title"
        onClose={onClose}
        canClose={!starting}
      />
      <div className="px-5 py-4">
        <p id="survivor-guide-controls" className="text-body text-fg-secondary">
          Drag to move, or use WASD or the arrow keys. Your weapons fire
          automatically.
        </p>
        <ul className="mt-4 divide-y divide-line">
          {tips.map(({ title, detail, visual }) => (
            <li key={title} className="flex items-center gap-3 py-2">
              <span
                aria-hidden="true"
                className="grid size-12 shrink-0 place-items-center"
              >
                {visual}
              </span>
              <div>
                <p className="text-body font-bold text-fg">{title}</p>
                <p className="text-caption text-fg-muted">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="mt-2 text-caption text-warning">
            {error}
          </p>
        )}
        <Button
          ref={startRef}
          fullWidth
          variant="solid"
          tone="accent"
          className="mt-4"
          busy={starting}
          onClick={onStart}
        >
          Start run
        </Button>
      </div>
    </Dialog>,
    document.body
  );
}
