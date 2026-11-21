import { useSignTypedData } from '@starknetfoundation/starknet-start-react';
import { SurvivorName } from './SurvivorName';
import { WalletButton } from './WalletButton';
import { api } from '../../services/api';
import { useWallet } from '../../contexts/WalletContext';
import {
  addressesMatch,
  formatSurvivalTime,
  shortAddress,
} from '../../utils/format';
import { DEATH_RESULTS_DELAY } from '../../survivors/deathCamera';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Dialog,
  DialogHeader,
  Panel,
  SegmentedControl,
  Stat,
  StatGrid,
  cn,
} from '../../../ui';
import { VOLUME_LEVELS, survivorAudio } from '../../survivors/audio';
import { survivorsSession } from '../../survivors/session';
import {
  ENEMIES,
  offerName,
  SYSTEMS,
  WEAPONS,
  type Offer,
  type Run,
  type SystemId,
  type WeaponId,
} from '../../survivors/sim';
import { pairedWeapons } from '../../survivors/content';
import type { Aegis } from '../../survivors/aegis';
import { SurvivorsIcon, SurvivorUpgradeTile } from './SurvivorsIcon';
import { SurvivorControls } from './SurvivorControls';
import { StrikeLevelSelect } from './StrikeLevelSelect';
import { ENEMY_TELEGRAPHS } from '../../survivors/renderFrame';

const MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT');

function Meter({
  label,
  value,
  max,
  fill,
  detail,
}: {
  label: string;
  value: number;
  max: number;
  fill: string;
  detail: string;
}) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-label text-fg-subtle">
        <span>{label}</span>
        <span className="tabular-nums text-fg-secondary">{detail}</span>
      </div>
      <div
        className="mt-1.5 h-1.5 bg-line"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(value)}
      >
        <div className={cn('h-full', fill)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** The Aegis gauge: a cell per segment, the one refilling drawn part-full. */
function AegisMeter({ aegis }: { aegis: Aegis }) {
  const whole = Math.floor(aegis.segments);
  const broken = whole < 1 && Number.isFinite(aegis.brokeAt);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-label text-fg-subtle">
        <span>AEGIS</span>
        <span
          className={cn(
            'tabular-nums',
            broken ? 'text-warning' : 'text-fg-secondary'
          )}
        >
          {broken ? 'BROKEN' : `${whole}/${aegis.max}`}
        </span>
      </div>
      <div
        className="mt-1.5 flex gap-0.5"
        role="meter"
        aria-label="AEGIS"
        aria-valuemin={0}
        aria-valuemax={aegis.max}
        aria-valuenow={whole}
      >
        {Array.from({ length: aegis.max }, (_, i) => {
          const fill = Math.max(0, Math.min(1, aegis.segments - i));
          return (
            <div key={i} className="h-1.5 flex-1 bg-line">
              <div
                className={cn('h-full', fill >= 1 ? 'bg-fg' : 'bg-fg-subtle')}
                style={{ width: `${fill * 100}%` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Loadout({ run }: { run: Run }) {
  const systems = Object.entries(run.systems) as [SystemId, number][];
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {run.weapons.map((weapon) => (
          <SurvivorUpgradeTile
            key={weapon.id}
            icon={weapon.id}
            kind={weapon.evolved ? 'evolution' : 'weapon'}
            level={weapon.evolved ? undefined : weapon.level}
            title={
              weapon.evolved
                ? WEAPONS[weapon.id].evolution
                : `${WEAPONS[weapon.id].name} ${weapon.level}`
            }
          />
        ))}
      </div>
      {systems.length ? (
        <div className="flex flex-wrap gap-1.5">
          {systems.map(([id, level]) => (
            <SurvivorUpgradeTile
              key={id}
              icon={id}
              kind="system"
              level={level}
              title={`${SYSTEMS[id].name} ${level}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface OfferText {
  icon: WeaponId | SystemId | 'repair' | 'sharpen';
  name: string;
  chip: string;
  chipTone: 'neutral' | 'success' | 'gold';
  detail: string;
  note?: string;
}

function describeOffer(run: Run, offer: Offer): OfferText {
  switch (offer.kind) {
    case 'evolution': {
      const spec = WEAPONS[offer.id];
      return {
        icon: offer.id,
        name: offerName(offer),
        chip: 'EVOLUTION',
        chipTone: 'gold',
        detail: spec.evolutionDetail,
        note: `${spec.name} + ${SYSTEMS[spec.pair].name}`,
      };
    }
    case 'weapon': {
      const spec = WEAPONS[offer.id];
      const level = run.weapons.find((w) => w.id === offer.id)?.level ?? 0;
      return {
        icon: offer.id,
        name: offerName(offer),
        chip: level ? `LV ${level} → ${level + 1}` : 'NEW WEAPON',
        chipTone: level ? 'neutral' : 'success',
        detail: spec.levels[level],
        note: `Evolves with ${SYSTEMS[spec.pair].name}`,
      };
    }
    case 'system': {
      const spec = SYSTEMS[offer.id];
      const level = run.systems[offer.id] ?? 0;
      // Name the owned weapon it would evolve, or every one it could.
      const paired = pairedWeapons(offer.id, run.hero);
      const owned = paired.filter((id) =>
        run.weapons.some((w) => w.id === id && !w.evolved)
      );
      const named = (owned.length ? owned : paired).map(
        (id) => WEAPONS[id].name
      );
      return {
        icon: offer.id,
        name: offerName(offer),
        chip: level ? `LV ${level} → ${level + 1}` : 'NEW SYSTEM',
        chipTone: level ? 'neutral' : 'success',
        detail: spec.levels?.[level] ?? spec.detail,
        note: named.length ? `Evolves ${named.join(' or ')}` : undefined,
      };
    }
    case 'repair':
      return {
        icon: 'repair',
        name: offerName(offer),
        chip: 'REPAIR',
        chipTone: 'neutral',
        detail: 'Restore 40 integrity.',
      };
    case 'sharpen':
      return {
        icon: 'sharpen',
        name: offerName(offer),
        chip: 'BONUS',
        chipTone: 'neutral',
        detail: '+4% damage for the rest of the run.',
      };
  }
}

function OfferCard({
  run,
  offer,
  index,
}: {
  run: Run;
  offer: Offer;
  index: number;
}) {
  const text = describeOffer(run, offer);
  const evolution = offer.kind === 'evolution';
  return (
    <button
      type="button"
      onClick={() => survivorsSession.choose(index)}
      className={cn(
        'grid content-start gap-3 border p-4 text-left transition-colors',
        evolution
          ? 'border-gold bg-surface-raised hover-enabled:bg-surface-hover'
          : 'border-line-strong bg-surface-raised hover-enabled:border-fg-muted hover-enabled:bg-surface-hover'
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'grid h-10 w-10 place-items-center border',
            evolution ? 'border-gold text-gold' : 'border-line-strong text-fg'
          )}
        >
          <SurvivorsIcon id={text.icon} className="h-6 w-6" />
        </span>
        <span className="text-tag text-fg-subtle">{index + 1}</span>
      </span>
      <span className="grid gap-1.5">
        <span className="text-heading text-fg">{text.name}</span>
        <span>
          <Badge tone={text.chipTone}>{text.chip}</Badge>
        </span>
      </span>
      <span className="text-body text-fg-secondary">{text.detail}</span>
      {text.note ? (
        <span className="text-caption text-fg-subtle">{text.note}</span>
      ) : null}
    </button>
  );
}

function DamageTable({ run }: { run: Run }) {
  const rows = run.weapons
    .map((weapon) => ({
      id: weapon.id,
      name: weapon.evolved
        ? WEAPONS[weapon.id].evolution
        : WEAPONS[weapon.id].name,
      value: run.damageBy[weapon.id] ?? 0,
    }))
    .sort((a, b) => b.value - a.value);
  const top = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="grid gap-2 px-5 py-4">
      <div className="text-label text-fg-subtle">DAMAGE BY WEAPON</div>
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid grid-cols-[1.25rem_minmax(0,9rem)_minmax(0,1fr)_4.5rem] items-center gap-3 text-caption text-fg-secondary"
        >
          <SurvivorsIcon id={row.id} className="h-4 w-4 text-fg-muted" />
          <span className="truncate">{row.name}</span>
          <span className="h-1.5 bg-line">
            <span
              className="block h-full bg-accent"
              style={{ width: `${(row.value / top) * 100}%` }}
            />
          </span>
          <span className="text-right tabular-nums">
            {row.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CoreSurvivorsHud() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const { signTypedDataAsync } = useSignTypedData({});
  useSyncExternalStore(survivorsSession.subscribe, survivorsSession.getVersion);
  const volume = useSyncExternalStore(
    survivorAudio.subscribe,
    survivorAudio.getLevel
  );
  const run = survivorsSession.run;
  const retryRef = useRef<HTMLButtonElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const supplyRef = useRef<HTMLButtonElement>(null);

  const leave = () => navigate('/survivors', { replace: true });
  const restart = () => {
    if (survivorsSession.replay) return leave();
    if (run) survivorsSession.start(run.groundRadius);
  };

  useEffect(() => {
    const keys = survivorsSession.keys;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.code === 'KeyM' && !event.repeat) {
        survivorAudio.toggleMute();
        return;
      }
      const status = survivorsSession.run?.status;
      if (status === 'choosing') {
        if (event.key >= '1' && event.key <= '3')
          survivorsSession.choose(Number(event.key) - 1);
        else if (event.code === 'KeyR') survivorsSession.reroll();
        return;
      }
      if (
        event.code === 'KeyP' ||
        (event.code === 'Escape' && !survivorsSession.paused)
      ) {
        if (status !== 'playing') return;
        event.preventDefault();
        survivorsSession.setPaused(!survivorsSession.paused);
        return;
      }
      if (!MOVE_KEYS.has(event.code)) return;
      event.preventDefault();
      keys.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const onBlur = () => {
      keys.clear();
      if (survivorsSession.run?.status === 'playing')
        survivorsSession.setPaused(true);
    };
    const onVisibility = () => {
      if (document.hidden) onBlur();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      keys.clear();
    };
  }, []);

  const recorded = Boolean(
    survivorsSession.scoreResult && 'destroyed' in survivorsSession.scoreResult
  );
  const ticket = survivorsSession.ticket;
  const scoreResult = survivorsSession.scoreResult;
  useEffect(() => {
    if (
      !ticket ||
      !scoreResult ||
      !('error' in scoreResult) ||
      !scoreResult.retryable
    )
      return;
    const retry = () => void survivorsSession.recordScore();
    const timer = window.setTimeout(retry, 5000);
    window.addEventListener('online', retry);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', retry);
    };
  }, [ticket, scoreResult]);
  const autoLinked = useRef<string | null>(null);
  useEffect(() => {
    if (!ticket || !recorded || !address || !api.hasSurvivorSession(address))
      return;
    const key = ticket.token + address;
    if (autoLinked.current === key) return;
    autoLinked.current = key;
    void survivorsSession.attachWallet(address, signTypedDataAsync);
  }, [ticket, recorded, address, signTypedDataAsync]);

  if (!run) return null;
  const player = run.player;
  const fallen =
    survivorsSession.atRankedLimit ||
    (run.status === 'fallen' && run.deathAge >= DEATH_RESULTS_DELAY);
  const paused = survivorsSession.paused && run.status === 'playing';
  if (survivorsSession.opening && !paused) {
    return (
      <div className="absolute inset-0 z-[5] font-mono">
        <SurvivorControls />
        <Button
          variant="outline"
          size="sm"
          className="absolute bottom-6 right-4"
          onClick={() => survivorsSession.skipOpening()}
        >
          SKIP INTRO
        </Button>
      </div>
    );
  }
  const killer = run.lastHitBy
    ? ENEMIES[run.lastHitBy].label
    : 'the Hollow Legion';
  const boss = run.bosses[0];
  const emp = run.effects.some((effect) => effect.kind === 'emp');

  return (
    <div className="absolute inset-0 z-[5] font-mono">
      {run.status === 'playing' && !paused ? <SurvivorControls /> : null}
      {run.hurtFlash > 0 ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-danger"
          style={{ opacity: run.hurtFlash * 0.5 }}
        />
      ) : null}
      {emp ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-fg/40"
        />
      ) : null}

      <div className="pointer-events-none absolute left-4 right-4 top-20 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-4">
        <div className="grid w-full max-w-xs gap-3">
          <Panel tone="floating" className="grid gap-3 px-4 py-3">
            <Meter
              label={`LEVEL ${player.level}`}
              value={player.xp}
              max={player.xpNext}
              fill="bg-accent"
              detail={`${player.xp}/${player.xpNext} XP`}
            />
            <Meter
              label="INTEGRITY"
              value={player.hp}
              max={player.maxHp}
              fill={
                player.hp / player.maxHp > 0.35 ? 'bg-success' : 'bg-danger'
              }
              detail={`${Math.ceil(player.hp)}/${player.maxHp}`}
            />
            {player.aegis ? <AegisMeter aegis={player.aegis} /> : null}
          </Panel>
          <Loadout run={run} />
        </div>
        <div className="grid justify-items-center gap-3 text-center">
          <div>
            <div className="text-label text-fg-subtle">DESTROYED</div>
            <div className="text-figure tabular-nums text-fg">
              {run.kills.toLocaleString()}
            </div>
          </div>
          {boss ? (
            <div className="w-72 max-w-full">
              <Meter
                label={boss.spec.label.toUpperCase()}
                value={boss.hp}
                max={boss.maxHp}
                fill="bg-danger"
                detail={`${Math.ceil((boss.hp / boss.maxHp) * 100)}%`}
              />
            </div>
          ) : null}
        </div>
        <div className="flex items-start justify-end gap-3">
          <Panel tone="floating" className="px-4 py-3 text-right">
            <div className="text-label text-fg-subtle">SURVIVED</div>
            <div className="text-figure-sm tabular-nums text-fg">
              {formatSurvivalTime(run.time)}
            </div>
          </Panel>
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto"
            aria-pressed={volume === 'off'}
            title="Toggle sound (M)"
            onClick={() => survivorAudio.toggleMute()}
          >
            {volume === 'off' ? 'SOUND OFF' : 'SOUND ON'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto"
            onClick={() => survivorsSession.setPaused(true)}
            disabled={run.status !== 'playing'}
          >
            PAUSE
          </Button>
        </div>
      </div>

      {run.banner && run.status === 'playing' ? (
        <div
          aria-live="polite"
          className="pointer-events-none absolute left-4 right-4 top-1/3 grid justify-items-center gap-1 text-center"
        >
          <div
            className={cn(
              'text-title',
              run.banner.tone === 'boss'
                ? 'text-danger'
                : run.banner.tone === 'good'
                  ? 'text-gold'
                  : 'text-warning'
            )}
          >
            {run.banner.title}
          </div>
          <div className="text-caption text-fg-secondary">
            {run.banner.detail}
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-4 bottom-4 flex flex-col items-end gap-2 sm:flex-row sm:items-end">
        {survivorsSession.orbitalStrikePreview &&
        run.status === 'playing' &&
        !paused ? (
          <Panel tone="floating" className="pointer-events-auto px-4 py-2">
            <StrikeLevelSelect
              level={run.weapons[0].level}
              onChange={(level) =>
                survivorsSession.setPreviewStrikeLevel(level)
              }
            />
          </Panel>
        ) : run.time < 7 && run.status === 'playing' ? (
          <Panel
            tone="floating"
            className="max-w-md px-4 py-3 text-caption text-fg-secondary"
          >
            Move with WASD, the arrow keys, or a one-finger or left-button drag.{' '}
            {run.weapons.length
              ? 'Your weapons fire on their own.'
              : run.bosses.some((boss) => boss.kind === 'warden')
                ? 'Move your feet outside the red sector before the staff lands.'
                : run.enemies.some((enemy) => enemy.kind === 'volt')
                  ? ENEMY_TELEGRAPHS
                    ? 'Step out of the red arrow path before the Mite lunges.'
                    : 'Sidestep when the Mite coils to lunge.'
                  : ENEMY_TELEGRAPHS
                    ? 'Sidestep the orange lane to dodge the shield thrust.'
                    : "Sidestep the Bulwark's shield thrust."}
          </Panel>
        ) : null}

        {run.status === 'playing' && !paused ? (
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto ml-auto shrink-0"
            title="Restore the default camera angle and zoom"
            onClick={() => survivorsSession.cameraOrbit.reset()}
          >
            RESET CAMERA
          </Button>
        ) : null}
      </div>

      <Dialog
        open={run.status === 'choosing'}
        onClose={() => undefined}
        canClose={false}
        labelledBy="survivors-level-title"
        size="lg"
      >
        <DialogHeader
          eyebrow={`LEVEL ${player.level - run.pendingLevels}`}
          title="Choose an upgrade"
          titleId="survivors-level-title"
          canClose={false}
        />
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
          {run.offers.map((offer, index) => (
            <OfferCard
              key={`${offer.kind}-${'id' in offer ? offer.id : index}`}
              run={run}
              offer={offer}
              index={index}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => survivorsSession.reroll()}
            disabled={run.rerolls <= 0}
          >
            REROLL ({run.rerolls})
          </Button>
          <span className="text-caption text-fg-subtle">
            Press 1, 2 or 3 to choose, R to reroll.
          </span>
        </div>
      </Dialog>

      <Dialog
        open={run.status === 'supply'}
        onClose={() => survivorsSession.closeSupply()}
        labelledBy="survivors-supply-title"
        initialFocus={supplyRef}
        size="sm"
      >
        <DialogHeader
          eyebrow="SUPPLY DROP"
          title={
            run.supply.length > 1
              ? 'A large Supply Drop'
              : 'Supply Drop recovered'
          }
          titleId="survivors-supply-title"
          canClose={false}
        />
        <div className="grid gap-2 px-5 py-4">
          {run.supply.map((offer, index) => {
            const text = describeOffer(run, offer);
            return (
              <div
                key={index}
                className="flex items-center gap-3 border border-line px-3 py-2"
              >
                <span
                  className={cn(
                    'grid h-9 w-9 place-items-center border',
                    offer.kind === 'evolution'
                      ? 'border-gold text-gold'
                      : 'border-line-strong text-fg'
                  )}
                >
                  <SurvivorsIcon id={text.icon} className="h-5 w-5" />
                </span>
                <span className="grid min-w-0">
                  <span className="text-body text-fg">{text.name}</span>
                  <span className="text-caption text-fg-subtle">
                    {offer.kind === 'evolution'
                      ? 'Weapon evolved'
                      : text.detail}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="border-t border-line px-5 py-4">
          <Button
            ref={supplyRef}
            tone="gold"
            onClick={() => survivorsSession.closeSupply()}
          >
            CONTINUE
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={paused}
        onClose={() => survivorsSession.setPaused(false)}
        labelledBy="survivors-paused-title"
        initialFocus={resumeRef}
        size="sm"
      >
        <DialogHeader
          eyebrow="CORE SURVIVORS"
          title="Paused"
          titleId="survivors-paused-title"
          onClose={() => survivorsSession.setPaused(false)}
          closeLabel="Resume"
        />
        <div className="border-b border-line px-5 py-4">
          <Loadout run={run} />
          <p className="mt-3 text-caption text-fg-secondary">
            Scroll to zoom and right-drag to orbit your character. On
            touchscreens, pinch to zoom and drag with two fingers to orbit.
          </p>
        </div>
        <div className="border-b border-line px-5 py-4">
          <div className="text-label text-fg-subtle">SOUND</div>
          <SegmentedControl
            className="mt-2"
            label="Sound volume"
            options={VOLUME_LEVELS}
            value={volume}
            onChange={(level) => survivorAudio.setLevel(level)}
          />
        </div>
        <div className="flex flex-wrap gap-3 px-5 py-4">
          <Button
            ref={resumeRef}
            tone="accent"
            onClick={() => survivorsSession.setPaused(false)}
          >
            RESUME
          </Button>
          <Button variant="outline" onClick={restart}>
            {survivorsSession.replay ? 'BACK TO LOBBY' : 'RESTART'}
          </Button>
          {!survivorsSession.replay && (
            <Button variant="ghost" onClick={leave}>
              LEADERBOARD
            </Button>
          )}
        </div>
      </Dialog>

      <Dialog
        open={fallen}
        onClose={leave}
        canClose={false}
        labelledBy="survivors-fallen-title"
        initialFocus={retryRef}
      >
        <DialogHeader
          eyebrow={
            survivorsSession.atRankedLimit
              ? 'TIME LIMIT'
              : `OVERRUN BY ${killer.toUpperCase()}`
          }
          title={`${run.kills.toLocaleString()} destroyed`}
          titleId="survivors-fallen-title"
          canClose={false}
        />
        <StatGrid className="grid-cols-3">
          <Stat label="DESTROYED" value={run.kills.toLocaleString()} emphasis />
          <Stat label="SURVIVED" value={formatSurvivalTime(run.time)} />
          <Stat label="LEVEL" value={player.level} />
        </StatGrid>
        <DamageTable run={run} />
        {fallen && survivorsSession.replay && (
          <div
            role="status"
            className="border-t border-line px-5 py-3 text-caption text-fg-secondary"
          >
            {recorded ? (
              <div className="space-y-2">
                <p>
                  {survivorsSession.attachedWallet
                    ? `Score recorded for ${shortAddress(survivorsSession.attachedWallet)}`
                    : 'Score recorded on the leaderboard.'}
                </p>
                {!survivorsSession.attaching &&
                  (!survivorsSession.attachedWallet ||
                    (address &&
                      addressesMatch(
                        address,
                        survivorsSession.attachedWallet
                      ))) && (
                    <SurvivorName
                      key={survivorsSession.attachedWallet ?? 'guest'}
                      address={survivorsSession.attachedWallet}
                    />
                  )}
                {!survivorsSession.attachedWallet &&
                  (address ? (
                    <Button
                      variant="outline"
                      busy={survivorsSession.attaching}
                      onClick={() =>
                        void survivorsSession.attachWallet(
                          address,
                          signTypedDataAsync
                        )
                      }
                    >
                      Link score to {shortAddress(address)}
                    </Button>
                  ) : (
                    <WalletButton
                      variant="block"
                      label="Connect to link this score"
                    />
                  ))}
                {survivorsSession.walletError && (
                  <p role="alert">{survivorsSession.walletError}</p>
                )}
              </div>
            ) : survivorsSession.scoreResult &&
              'error' in survivorsSession.scoreResult ? (
              <div>
                <p role="alert">{survivorsSession.scoreResult.error}</p>
                <Button
                  variant="outline"
                  busy={survivorsSession.submitting}
                  onClick={() => void survivorsSession.recordScore()}
                >
                  Retry saving
                </Button>
              </div>
            ) : (
              'Saving score…'
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-3 border-t border-line px-5 py-4">
          <Button ref={retryRef} tone="accent" onClick={restart}>
            {survivorsSession.replay ? 'LEADERBOARD' : 'TRY AGAIN'}
          </Button>
          {!survivorsSession.replay && (
            <Button variant="ghost" onClick={leave}>
              LEADERBOARD
            </Button>
          )}
        </div>
      </Dialog>
    </div>
  );
}
