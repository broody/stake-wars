import { useState } from 'react';
import {
  DEFAULT_HERO,
  HEROES,
  SYSTEMS,
  WEAPONS,
  type SystemId,
  type WeaponId,
} from '../../survivors/content';
import type { EarnedUpgrade } from '../../survivors/sim';
import { SurvivorUpgradeTile } from './SurvivorsIcon';

// Saved runs identify upgrades by the name they had when the player earned them.
type SkillIcon = WeaponId | SystemId;
const skillsByName = new Map<
  string,
  { icon: SkillIcon; evolvedLevel?: number }
>();
for (const id of Object.keys(WEAPONS) as WeaponId[]) {
  const weapon = WEAPONS[id];
  skillsByName.set(weapon.name, { icon: id });
  skillsByName.set(weapon.evolution, {
    icon: id,
    evolvedLevel: weapon.levels.length,
  });
}
for (const id of Object.keys(SYSTEMS) as SystemId[]) {
  skillsByName.set(SYSTEMS[id].name, { icon: id });
}

function finalSkills(upgrades: EarnedUpgrade[]) {
  const slots = new Map<string, EarnedUpgrade & { icon?: SkillIcon }>();
  // The starting weapon is equipped before the first upgrade is recorded.
  const starter = HEROES[DEFAULT_HERO].starter;
  slots.set(starter, {
    kind: 'weapon',
    name: WEAPONS[starter].name,
    icon: starter,
    level: 1,
  });
  for (const upgrade of upgrades) {
    if (upgrade.kind === 'repair' || upgrade.kind === 'sharpen') continue;
    const skill = skillsByName.get(upgrade.name);
    slots.set(skill?.icon ?? `${upgrade.kind}:${upgrade.name}`, {
      ...upgrade,
      icon: skill?.icon,
      level: upgrade.level ?? skill?.evolvedLevel,
    });
  }
  return slots;
}

type InspectedUpgrade = { tile: HTMLLIElement; label: string };

export function SurvivorFinalSkills({
  upgrades,
}: {
  upgrades: EarnedUpgrade[] | null;
}) {
  const [hovered, setHovered] = useState<InspectedUpgrade | null>(null);
  const [focused, setFocused] = useState<InspectedUpgrade | null>(null);
  const active = hovered ?? focused;
  if (!upgrades) return <>Final skills unrecorded.</>;

  return (
    <div className="relative">
      <ol aria-label="Final skills" className="flex flex-wrap gap-2 py-1">
        {Array.from(
          finalSkills(upgrades),
          ([slot, { kind, name, level, icon }]) => {
            const label = [
              name,
              level != null && `Lv ${level}`,
              kind === 'evolution' && 'Evolution',
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <li
                key={slot}
                onPointerEnter={(e) =>
                  setHovered({ tile: e.currentTarget, label })
                }
                onPointerLeave={() => setHovered(null)}
                onFocus={(e) => setFocused({ tile: e.currentTarget, label })}
                onBlur={() => setFocused(null)}
              >
                <span
                  className="block"
                  role="img"
                  aria-label={label}
                  tabIndex={0}
                >
                  <SurvivorUpgradeTile icon={icon} kind={kind} level={level} />
                </span>
              </li>
            );
          }
        )}
      </ol>
      {active && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-10 flex -translate-y-full pb-1"
          style={{ top: active.tile.offsetTop }}
        >
          <span style={{ width: active.tile.offsetLeft }} />
          <span className="shrink-0 border border-line-strong bg-surface-raised px-2 py-1 text-caption text-fg">
            {active.label}
          </span>
        </div>
      )}
    </div>
  );
}
