import { createRun, SIM_HZ, tick, type Run } from '../survivors/sim';
import { copy, vec3 } from '../survivors/sphere';
import { ENEMY_GROUND_RADIUS } from '../utils/enemySwarm';
import {
  ACTION_SEED,
  actionScript,
  type ActionScript,
  type ActionSpec,
  type SwingOptions,
} from './actions';

export const STEP = 1 / SIM_HZ;
/** Samples a replay takes per tick, so a stateful pose integrates finely. */
const SUBSTEPS = 4;

const fallen = (run: Run) => run.status === 'fallen';

/**
 * Plays one action's scripted run at any moment of its loop. The run only
 * moves forward, as in the game; showing an earlier moment rebuilds it and
 * replays from the start, which is deterministic for the fixed seed.
 */
export class ActionDriver {
  readonly script: ActionScript;
  run!: Run;
  /** Counts rebuilds, so caches built from one run know to clear. */
  generation = 0;
  /** Where the Vanguard starts, for anything that stands in place. */
  readonly origin = { n: vec3(), heading: vec3(), forward: vec3() };
  private shown = -Infinity;
  private fallenAt: number | null = null;

  constructor(
    readonly spec: ActionSpec,
    readonly options: SwingOptions | undefined,
    /** Sees every tick before its sound cues are dropped. */
    private readonly onTick?: (run: Run) => void
  ) {
    this.script = actionScript(spec, options);
    this.reset();
  }

  get loop() {
    return this.script.loop;
  }

  /** Run time at `loopTime` seconds into the loop. */
  runTime(loopTime: number) {
    return this.script.preroll + loopTime;
  }

  reset() {
    this.run = createRun(ACTION_SEED, ENEMY_GROUND_RADIUS, 'vanguard');
    this.script.setup(this.run);
    copy(this.origin.n, this.run.player.n);
    copy(this.origin.heading, this.run.player.heading);
    copy(this.origin.forward, this.run.player.forward);
    this.shown = -Infinity;
    this.fallenAt = null;
    this.generation++;
  }

  /**
   * Bring the run to run time `time` and return the interpolation alpha that
   * shows it. `sample` sees each quarter tick on the way, with its alpha and
   * whether a fresh run is catching up, so a pose that integrates over time,
   * like the gait, arrives where continuous play would have left it.
   */
  show(
    time: number,
    sample?: (time: number, alpha: number, replay: boolean) => void
  ) {
    if (time < this.shown - 1e-9) this.reset();
    const replay = this.shown === -Infinity;
    const run = this.run;
    while (run.status === 'playing' && run.time < time - 1e-9) {
      const { input } = this.script;
      tick(run, STEP, typeof input === 'function' ? input(run) : input);
      this.script.after?.(run);
      this.onTick?.(run);
      run.cues.length = 0;
      // A tick can end the run, which the loop's own check can't see coming.
      if (fallen(run)) this.fallenAt = run.time;
      if (!sample) continue;
      for (let i = 1; i <= SUBSTEPS; i++) {
        const at = run.time - STEP + (i * STEP) / SUBSTEPS;
        if (at >= time - 1e-9) break;
        sample(at, i / SUBSTEPS, replay);
      }
    }
    this.shown = time;
    if (run.status === 'fallen') {
      run.deathAge = Math.max(0, time - (this.fallenAt ?? time));
      return 1;
    }
    return Math.min(1, Math.max(0, 1 - (run.time - time) / STEP));
  }
}
