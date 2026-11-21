import { fieldStyles } from '../../../ui';
import { WEAPONS } from '../../survivors/content';

export function StrikeLevelSelect({
  level,
  onChange,
}: {
  level: number;
  onChange: (level: number) => void;
}) {
  return (
    <label className="flex flex-wrap items-center gap-3">
      <span className="text-label text-fg-secondary">Orbital Strike level</span>
      <select
        className={fieldStyles({ size: 'sm', className: 'w-auto' })}
        value={level}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      >
        {WEAPONS.strike.levels.map((_, i) => (
          <option key={i} value={i + 1}>
            Level {i + 1}
          </option>
        ))}
      </select>
    </label>
  );
}
