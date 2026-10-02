import { DEATH_RESULTS_DELAY } from './deathCamera';
import { pointAt, vec3 } from './sphere';
import {
  applyOffer,
  chooseOffer,
  closeSupply,
  createRun,
  spawnEnemy,
  rerollOffers,
  runEvent,
  SIM_HZ,
  tick,
  type MoveInput,
  type Run,
} from './sim';

export const SURVIVE_PARAM = 'survive';

/** `/play?survive=1` turns the Core into a Core Survivors run. */
export function isSurviveMode(params: URLSearchParams) {
  const value = params.get(SURVIVE_PARAM);
  return value !== null && value !== '0' && value !== 'false';
}

const STEP = 1 / SIM_HZ;
/** The HUD re-renders at this rate; the scene reads the run every frame. */
const HUD_INTERVAL = 0.1;

/**
 * One run shared by the 3D scene, which advances it, and the HUD, which
 * subscribes to a throttled version counter.
 */
export class SurvivorsSession {
  run: Run | null = null;
  /** Held movement keys, as `KeyboardEvent.code`. */
  readonly keys = new Set<string>();
  /** Touch or mouse joystick, −1…1 on each axis (screen y points down). */
  readonly stick = { x: 0, y: 0 };
  private readonly input: MoveInput = { x: 0, y: 0 };
  paused = false;
  /** Fraction of a tick since the last one, for interpolation. */
  alpha = 0;
  private accumulator = 0;
  private sinceNotify = 0;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  start(groundRadius: number, seed = Math.floor(Math.random() * 2 ** 31)) {
    this.run = createRun(seed, groundRadius);
    const preview = import.meta.env.DEV
      ? new URLSearchParams(location.search).get('survivePreview')
      : null;
    if (
      preview === 'saber' ||
      preview === 'saber-range' ||
      preview === 'saber-gun'
    ) {
      const run = this.run;
      run.spawnCredit = -1e6;
      run.eventIndex = 1000;
      run.player.hp = run.player.maxHp = 10000;
      if (preview === 'saber-gun')
        applyOffer(run, { kind: 'weapon', id: 'bolts', isNew: true });
      // A stationary pair makes strike timing and range upgrades easy to compare.
      if (preview === 'saber-range') {
        run.weapons[0].level = 4;
        run.player.area = 1.5;
      }
      for (const side of [-1, 1]) {
        const direction = vec3(
          run.right.x * side,
          run.right.y * side,
          run.right.z * side
        );
        const enemy = spawnEnemy(
          run,
          'bulwark',
          pointAt(
            vec3(),
            run.player.n,
            direction,
            (preview === 'saber-range' ? 1.15 : 0.65) / groundRadius
          )
        );
        enemy.hp = enemy.maxHp = 1e6;
        enemy.speed = 0;
        enemy.cooldown = 1e6;
      }
      run.banner = {
        title:
          preview === 'saber-gun'
            ? 'Saber + Bolt Caster drill'
            : preview === 'saber'
              ? 'Single-saber drill'
              : 'Upgraded saber reach',
        detail:
          'Move to test running attacks. The cyan edge marks slash reach.',
        tone: 'good',
        age: 0,
      };
    }
    if (preview === 'seeker') {
      const run = this.run;
      run.weapons = [];
      run.spawnCredit = -1e6;
      run.eventIndex = 1000;
      run.player.hp = run.player.maxHp = 10000;
      const enemy = spawnEnemy(
        run,
        'seeker',
        pointAt(vec3(), run.player.n, run.player.forward, 2.8 / groundRadius)
      );
      enemy.cooldown = 2;
      run.banner = {
        title: 'Seeker charge drill',
        detail:
          'Dodge the marked lane. Watch the crouch, bounding charge, and recovery. Weapons are disabled.',
        tone: 'danger',
        age: 0,
      };
    }
    if (preview === 'saber-death') {
      const run = this.run;
      run.spawnCredit = -1e6;
      run.eventIndex = 1000;
      run.player.hp = 1;
      run.player.invulnerable = 1.2;
      run.weapons[0].cooldown = 10;
      const enemy = spawnEnemy(run, 'mite', { ...run.player.n });
      enemy.speed = 0;
      enemy.hp = enemy.maxHp = 1000;
      // A nearby spectator verifies that only the overlapping enemy fades.
      const spectator = spawnEnemy(
        run,
        'mite',
        pointAt(vec3(), run.player.n, run.right, 1.1 / groundRadius)
      );
      spectator.speed = 0;
      spectator.hp = spectator.maxHp = 1000;
    }
    // Local animation/combat drill; ordinary runs and production ignore this.
    if (
      import.meta.env.DEV &&
      new URLSearchParams(location.search).get('survivePreview') === 'bulwark'
    ) {
      this.run.weapons = [];
      this.run.spawnCredit = -1e6;
      this.run.eventIndex = 1000;
      const enemy = spawnEnemy(
        this.run,
        'bulwark',
        pointAt(
          vec3(),
          this.run.player.n,
          this.run.player.forward,
          0.8 / groundRadius
        )
      );
      enemy.cooldown = 4;
      this.run.banner = {
        title: 'Bulwark drill',
        detail:
          'Sidestep the orange lane. Weapons are disabled in this local preview.',
        tone: 'danger',
        age: 0,
      };
    }
    if (
      import.meta.env.DEV &&
      new URLSearchParams(location.search).get('survivePreview') === 'warden'
    ) {
      const run = this.run;
      run.weapons = [];
      run.spawnCredit = -1e6;
      run.eventIndex = 1000;
      const enemy = spawnEnemy(
        run,
        'warden',
        pointAt(vec3(), run.player.n, run.player.forward, 1.35 / groundRadius)
      );
      enemy.cooldown = 3;
      enemy.cooldown2 = 6;
      enemy.cooldown3 = 1e9;
      run.banner = {
        title: 'Warden drill',
        detail:
          'Dodge the marked staff slam and bolt rings. Move away to see him run. Weapons are disabled.',
        tone: 'danger',
        age: 0,
      };
    }
    if (
      import.meta.env.DEV &&
      [
        'mite-defeat',
        'lancer-defeat',
        'bulwark-defeat',
        'warden-defeat',
        'seeker-defeat',
      ].includes(
        new URLSearchParams(location.search).get('survivePreview') ?? ''
      )
    ) {
      const run = this.run;
      run.spawnCredit = -1e6;
      run.eventIndex = 1000;
      const preview = new URLSearchParams(location.search).get(
        'survivePreview'
      );
      const kind =
        preview === 'seeker-defeat'
          ? 'seeker'
          : preview === 'warden-defeat'
            ? 'warden'
            : preview === 'bulwark-defeat'
              ? 'bulwark'
              : preview === 'lancer-defeat'
                ? 'lancer'
                : 'mite';
      const spawn = () => {
        const enemy = spawnEnemy(
          run,
          kind,
          pointAt(vec3(), run.player.n, run.right, 0.6 / groundRadius)
        );
        enemy.hp = 1;
        enemy.cooldown = 1e9;
        enemy.speed = 0;
        run.weapons[0].cooldown = 0;
        // Keep the visual drill running without opening upgrade choices.
        run.timers.push({
          at: run.time + 0.1,
          run: () => {
            run.gems = [];
            run.items = [];
            run.player.xp = 0;
          },
        });
        run.timers.push({ at: run.time + 3, run: spawn });
      };
      run.timers.push({ at: 1, run: spawn });
      run.banner = {
        title: `${kind[0].toUpperCase() + kind.slice(1)} defeat preview`,
        detail:
          'The blade drops a unit every few seconds. You can walk through its remains.',
        tone: 'good',
        age: 0,
      };
    }
    this.paused = false;
    this.accumulator = 0;
    this.alpha = 0;
    this.notify();
  }

  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    this.notify();
  }

  /** Advance by a frame's worth of real time at the fixed rate. */
  advance(delta: number) {
    const run = this.run;
    if (!run) return;
    if (run.status === 'fallen') {
      const previous = run.deathAge;
      const elapsed = Math.min(Math.max(delta, 0), 0.25);
      run.deathAge = Math.min(DEATH_RESULTS_DELAY, previous + elapsed);
      run.shake = Math.max(0, run.shake - elapsed);
      run.hurtFlash = Math.max(0, run.hurtFlash - elapsed);
      for (const effect of run.effects) effect.age += elapsed;
      run.effects = run.effects.filter((effect) => effect.age < effect.life);
      for (const text of run.texts) text.age += elapsed;
      run.texts = run.texts.filter((text) => text.age < 0.7);
      this.alpha = 1;
      if (previous < DEATH_RESULTS_DELAY && run.deathAge >= DEATH_RESULTS_DELAY)
        this.notify();
      return;
    }
    if (this.paused || run.status !== 'playing') {
      this.alpha = 1;
      return;
    }
    this.readInput();
    this.accumulator += Math.min(Math.max(delta, 0), 0.25);
    let steps = 0;
    while (this.accumulator >= STEP && steps < 8) {
      tick(run, STEP, this.input);
      this.accumulator -= STEP;
      steps++;
      if (run.status !== 'playing') {
        this.accumulator = 0;
        this.notify();
        break;
      }
    }
    if (steps >= 8) this.accumulator = 0;
    this.alpha = Math.min(1, this.accumulator / STEP);
    this.sinceNotify += delta;
    if (this.sinceNotify >= HUD_INTERVAL) this.notify();
  }

  private readInput() {
    const held = (...codes: string[]) =>
      codes.some((code) => this.keys.has(code));
    let x = 0;
    let y = 0;
    if (held('KeyA', 'ArrowLeft')) x -= 1;
    if (held('KeyD', 'ArrowRight')) x += 1;
    if (held('KeyW', 'ArrowUp')) y += 1;
    if (held('KeyS', 'ArrowDown')) y -= 1;
    if (x === 0 && y === 0) {
      x = this.stick.x;
      y = -this.stick.y;
    }
    this.input.x = x;
    this.input.y = y;
  }

  choose(index: number) {
    if (!this.run) return;
    chooseOffer(this.run, index);
    this.notify();
  }

  reroll() {
    if (!this.run) return;
    rerollOffers(this.run);
    this.notify();
  }

  closeSupply() {
    if (!this.run) return;
    closeSupply(this.run);
    this.notify();
  }

  notify() {
    this.sinceNotify = 0;
    this.version++;
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = () => this.version;
}

export const survivorsSession = new SurvivorsSession();

// A handle for tuning runs from the console or a test driver; dev builds only.
if (import.meta.env.DEV)
  Object.assign(window, {
    __coreSurvivors: { session: survivorsSession, runEvent, applyOffer },
  });
