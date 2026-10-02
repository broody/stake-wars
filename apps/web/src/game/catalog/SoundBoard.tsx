import { useState } from 'react';
import { Button, Panel, PanelSection, SectionHeading } from '../../ui';
import { survivorAudio } from '../survivors/audio';
import {
  SOUNDS,
  SOUND_IDS,
  soundFiles,
  type SoundId,
} from '../survivors/sounds';

/** Every Core Survivors sound, each with a play button and its mix. */
export function SoundBoard() {
  const [delay, setDelay] = useState<number | null>(null);
  const preview = async (id: SoundId, take?: number) => {
    await survivorAudio.preview(id, take);
    setDelay(survivorAudio.outputDelay());
  };
  return (
    <section className="mt-10">
      <SectionHeading
        eyebrow="Rendered by scripts/survivors-sfx.mjs; mixed in survivors/sounds.ts."
        title="SOUND EFFECTS"
      />
      <p className="mt-3 max-w-3xl text-caption text-fg-muted">
        {delay === null
          ? 'Play any sound to see this device’s audio output delay.'
          : `This device reports ${delay} ms of audio output delay. Timed sounds, like saber swings, start that much earlier to land on time.`}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SOUND_IDS.map((id) => {
          const sound = SOUNDS[id];
          const takes = soundFiles(id).length;
          return (
            <Panel key={id}>
              <PanelSection className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-label text-fg">{sound.name}</h3>
                  <p className="mt-2 text-caption text-fg-muted">
                    {sound.detail}
                  </p>
                  <p className="mt-2 text-tag text-fg-subtle">
                    {id} · volume {sound.volume} · {sound.voices}{' '}
                    {sound.voices === 1 ? 'voice' : 'voices'} · gap {sound.gap}s
                    {takes > 1 ? ` · ${takes} takes, one at random` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Play ${sound.name}`}
                    onClick={() => void preview(id)}
                  >
                    PLAY
                  </Button>
                  {takes > 1
                    ? Array.from({ length: takes }, (_, take) => (
                        <Button
                          key={take}
                          variant="ghost"
                          size="sm"
                          aria-label={`Play ${sound.name}, take ${take + 1}`}
                          onClick={() => void preview(id, take)}
                        >
                          TAKE {take + 1}
                        </Button>
                      ))
                    : null}
                </div>
              </PanelSection>
            </Panel>
          );
        })}
      </div>
    </section>
  );
}
