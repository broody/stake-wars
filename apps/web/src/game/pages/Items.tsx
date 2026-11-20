import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Button,
  Eyebrow,
  PageTitle,
  Panel,
  PanelSection,
  SectionHeading,
  SegmentedControl,
  buttonStyles,
  fieldStyles,
} from '../../ui';
import { CatalogStage } from '../catalog/CatalogStage';
import { disposeCatalogGround } from '../catalog/ground';
import { FULL_FIELD, ITEM_ENTRIES } from '../catalog/itemPreview';

const groups = [...new Set(ITEM_ENTRIES.map((item) => item.group))];
const views = [
  { value: 'inspect', label: 'INSPECT' },
  { value: 'field', label: 'FULL FIELD' },
] as const;

export function Items() {
  const [params, setParams] = useSearchParams();
  const selected =
    ITEM_ENTRIES.find((item) => item.id === params.get('item')) ??
    ITEM_ENTRIES[0];
  const view = params.get('view') === 'field' ? 'field' : 'inspect';
  const entry = view === 'field' ? FULL_FIELD : selected;
  useEffect(() => disposeCatalogGround, []);
  const choose = (id: string) => setParams({ item: id }, { replace: true });
  return (
    <div className="h-full overflow-y-auto bg-surface font-mono">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-20 sm:px-6 sm:pt-24">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
          <div>
            <Eyebrow>CORE SURVIVORS</Eyebrow>
            <PageTitle className="mt-2">ITEM PREVIEW</PageTitle>
          </div>
          <Link
            className={buttonStyles({ variant: 'link', size: 'sm' })}
            to="/objects?tab=pickups"
          >
            OBJECT CATALOG
          </Link>
        </header>
        <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_17rem]">
          <Panel className="min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-line p-3 sm:px-5">
              <span className="hidden text-label text-fg-muted md:block">
                {view === 'field'
                  ? 'DENSITY PREVIEW'
                  : selected.group.toUpperCase()}
              </span>
              <select
                className={fieldStyles({
                  size: 'sm',
                  className: 'min-w-0 max-w-full md:hidden',
                })}
                aria-label="Choose a pickup"
                value={view === 'field' ? '' : selected.id}
                onChange={(event) => choose(event.target.value)}
              >
                {view === 'field' && (
                  <option value="" disabled>
                    Choose a pickup
                  </option>
                )}
                {groups.map((group) => (
                  <optgroup key={group} label={group}>
                    {ITEM_ENTRIES.filter((item) => item.group === group).map(
                      (item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      )
                    )}
                  </optgroup>
                ))}
              </select>
              <SegmentedControl
                label="Preview mode"
                options={views}
                value={view}
                onChange={(next) =>
                  setParams(
                    next === 'field'
                      ? { item: selected.id, view: 'field' }
                      : { item: selected.id },
                    { replace: true }
                  )
                }
              />
            </div>
            <div
              className="aspect-[4/3] w-full sm:aspect-[16/10]"
              role="img"
              aria-label={entry.name + ' on the Core'}
            >
              <Canvas dpr={[1, 1.5]}>
                <CatalogStage entry={entry} />
              </Canvas>
            </div>
            <PanelSection className="border-t border-line" divided={false}>
              <h2 className="text-title text-fg">{entry.name}</h2>
              <p className="mt-2 text-body text-fg-secondary">{entry.detail}</p>
            </PanelSection>
          </Panel>
          <Panel
            as="aside"
            aria-label="Choose a pickup"
            className="hidden md:block"
          >
            {groups.map((group) => (
              <PanelSection key={group} className="p-4 sm:p-4">
                <SectionHeading title={group.toUpperCase()} />
                <div className="mt-2 grid gap-1">
                  {ITEM_ENTRIES.filter((item) => item.group === group).map(
                    (item) => {
                      const active =
                        view === 'inspect' && selected.id === item.id;
                      return (
                        <Button
                          key={item.id}
                          size="sm"
                          variant={active ? 'outline' : 'ghost'}
                          tone={active ? 'accent' : 'neutral'}
                          className="justify-start"
                          aria-pressed={active}
                          onClick={() => choose(item.id)}
                        >
                          {item.name}
                        </Button>
                      );
                    }
                  )}
                </div>
              </PanelSection>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
