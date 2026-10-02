import { useEffect, useRef, type RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { View } from '@react-three/drei';
import {
  Eyebrow,
  PageTitle,
  Panel,
  PanelSection,
  SectionHeading,
  SegmentedControl,
} from '../../ui';
import {
  CATEGORIES,
  ENTRIES,
  type CatalogEntry,
  type Category,
} from '../catalog/entries';
import { CatalogStage } from '../catalog/CatalogStage';
import { disposeCatalogGround } from '../catalog/ground';
import { SoundBoard } from '../catalog/SoundBoard';

/** Object tabs come from the catalog; sounds have a board of their own. */
type Tab = Category | 'sounds';
const TABS: { value: Tab; label: string }[] = [
  ...CATEGORIES.map(({ id, label }) => ({ value: id, label })),
  { value: 'sounds', label: 'SOUNDS' },
];
const isTab = (value: string | null): value is Tab =>
  TABS.some((tab) => tab.value === value);

/**
 * Unlisted catalog of every Core Survivors object, for reviewing how each one
 * reads on the Core. Every card draws into one shared canvas.
 */
export function Catalog() {
  const container = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab = isTab(requested) ? requested : TABS[0].value;
  useEffect(() => disposeCatalogGround, []);

  const groups = new Map<string, CatalogEntry[]>();
  for (const entry of ENTRIES) {
    if (entry.category !== tab) continue;
    groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
  }

  return (
    <div
      ref={container}
      className="relative h-full w-full overflow-y-auto bg-surface font-mono"
    >
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-20 sm:px-6 sm:pt-24">
        <header className="border-b border-line pb-6">
          <Eyebrow>CORE SURVIVORS · UNLISTED</Eyebrow>
          <PageTitle className="mt-3">IN-GAME OBJECTS</PageTitle>
          <p className="mt-4 max-w-3xl text-body text-fg-muted">
            Everything that appears in a run, on a patch of the Core, drawn by
            the same renderers the game uses, so this page always matches, and
            every sound it makes.
          </p>
          <SegmentedControl
            className="mt-5"
            label="Object category"
            options={TABS}
            value={tab}
            onChange={(next) => setParams({ tab: next }, { replace: true })}
          />
        </header>
        {tab === 'sounds' ? <SoundBoard /> : null}
        {[...groups].map(([group, entries]) => (
          <section key={group} className="mt-10">
            <SectionHeading title={group.toUpperCase()} />
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {entries.map((entry) => (
                <Panel key={entry.id} className="overflow-hidden">
                  <View className="h-44 w-full">
                    <CatalogStage entry={entry} />
                  </View>
                  <PanelSection className="border-t border-line">
                    <h3 className="text-label text-fg">{entry.name}</h3>
                    <p className="mt-2 text-caption text-fg-muted">
                      {entry.detail}
                    </p>
                  </PanelSection>
                </Panel>
              ))}
            </div>
          </section>
        ))}
      </div>
      <Canvas
        eventSource={container as RefObject<HTMLElement>}
        style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}
      >
        <View.Port />
      </Canvas>
    </div>
  );
}
