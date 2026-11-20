/**
 * The Vanguard on the action dashboard: its pose, the blade's path and what
 * its animation is doing, read from the game's own VanguardAnimation.
 */
import * as THREE from 'three';
import { colors } from '../../ui/tokens';
import { SIM_HZ, type Run } from '../survivors/sim';
import { sampleBlade } from '../survivors/bladeAfterimage';
import { chord } from '../survivors/sphere';
import { VANGUARD, type VanguardAnimation } from '../utils/vanguardAnimation';
import {
  CLIP_FPS,
  CLIP_SECONDS,
  SWING_CLIPS,
  swingClipRate,
  type ClipName,
} from './timeline';

const s = {
  base: new THREE.Vector3(),
  tip: new THREE.Vector3(),
};

const CAPACITY = 1024;

/**
 * The path the blade sweeps through one swing: a line along the tip and a
 * faint sheet from the base to the tip, drawn over everything.
 */
export class BladeTrail {
  readonly object = new THREE.Group();
  /** What the samples came from; a different owner starts a new path. */
  owner: unknown = null;
  private readonly times = new Float64Array(CAPACITY);
  private readonly tips: THREE.BufferAttribute;
  private readonly sheet: THREE.BufferAttribute;
  private readonly line: THREE.Line;
  private readonly mesh: THREE.Mesh;
  private count = 0;

  constructor() {
    this.tips = new THREE.BufferAttribute(new Float32Array(CAPACITY * 3), 3);
    this.sheet = new THREE.BufferAttribute(new Float32Array(CAPACITY * 6), 3);
    for (const attribute of [this.tips, this.sheet])
      attribute.setUsage(THREE.DynamicDrawUsage);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', this.tips);
    const sheetGeometry = new THREE.BufferGeometry();
    sheetGeometry.setAttribute('position', this.sheet);
    const index = new Uint16Array((CAPACITY - 1) * 6);
    for (let i = 0; i < CAPACITY - 1; i++)
      index.set(
        [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2],
        i * 6
      );
    sheetGeometry.setIndex(new THREE.BufferAttribute(index, 1));
    const overlay = {
      color: colors.accent.DEFAULT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    };
    this.line = new THREE.Line(
      lineGeometry,
      new THREE.LineBasicMaterial(overlay)
    );
    this.mesh = new THREE.Mesh(
      sheetGeometry,
      new THREE.MeshBasicMaterial({
        ...overlay,
        opacity: 0.18,
        side: THREE.DoubleSide,
      })
    );
    for (const part of [this.mesh, this.line]) {
      part.frustumCulled = false;
      part.renderOrder = 10;
      part.raycast = () => undefined;
      this.object.add(part);
    }
    this.object.visible = false;
  }

  clear(owner: unknown = this.owner) {
    this.owner = owner;
    this.count = 0;
  }

  /** Add the blade's position at `time` from its socket's world matrix. */
  sample(time: number, socket: THREE.Object3D) {
    if (this.count >= CAPACITY) return;
    if (this.count && time <= this.times[this.count - 1] + 1e-9) return;
    const { base, tip } = s;
    sampleBlade(socket, base, tip);
    const i = this.count++;
    this.times[i] = time;
    this.tips.setXYZ(i, tip.x, tip.y, tip.z);
    this.sheet.setXYZ(2 * i, base.x, base.y, base.z);
    this.sheet.setXYZ(2 * i + 1, tip.x, tip.y, tip.z);
  }

  /** Draw the samples up to `until`, if `shown`. */
  sync(until: number, shown: boolean) {
    let n = this.count;
    while (n > 0 && this.times[n - 1] > until + 1e-9) n--;
    this.line.geometry.setDrawRange(0, n);
    this.mesh.geometry.setDrawRange(0, Math.max(0, n - 1) * 6);
    this.tips.needsUpdate = true;
    this.sheet.needsUpdate = true;
    this.object.visible = shown && n > 1;
  }

  dispose() {
    for (const part of [this.line, this.mesh]) {
      part.geometry.dispose();
      (part.material as THREE.Material).dispose();
    }
  }
}

/** One clip as it plays: which, where in it and how fast. */
export interface ClipReading {
  clip: ClipName;
  /** Authored frame on screen, fractional. */
  frame: number;
  frames: number;
  /** Clip seconds played per second of the run; 1 is as authored. */
  rate: number;
  /** Blend weight, 0 to 1. */
  weight: number;
}

/** What the Vanguard's animation is doing at one moment. */
export interface Readout {
  /** The swing on the upper body, if one is playing. */
  upper: ClipReading | null;
  /** The clip with the most weight on the legs. */
  legs: ClipReading;
  /** The swing's turn of the chest toward its target, in degrees. */
  twist: number | null;
  /** World units a second. */
  speed: number;
}

const frames = (clip: ClipName) => Math.round(CLIP_SECONDS[clip] * CLIP_FPS);

/** Read the game's animation of the Vanguard at run time `time`. */
export function readGame(
  a: VanguardAnimation,
  run: Run,
  time: number,
  twist: number
): Readout {
  if (run.status === 'fallen' && a.canDie)
    return readAuthored(
      'Defeated',
      Math.min(run.deathAge, VANGUARD.deathDuration)
    );
  let upper: ClipReading | null = null;
  let blend = 0;
  for (const clip of SWING_CLIPS) {
    const action = a.actions.get(`${clip}:upper`);
    const weight = action?.getEffectiveWeight() ?? 0;
    blend += weight;
    if (!action || weight <= (upper?.weight ?? 0)) continue;
    const attack = run.player.saberAttack;
    upper = {
      clip,
      frame: action.time * CLIP_FPS,
      frames: frames(clip),
      rate: attack
        ? swingClipRate(
            time - attack.startedAt,
            attack.duration,
            CLIP_SECONDS[clip]
          )
        : 1,
      weight,
    };
  }
  if (upper) upper.weight = blend;
  const speed =
    chord(run.player.prev, run.player.n) * run.groundRadius * SIM_HZ;
  const weightOf = (clip: ClipName) =>
    a.actions.get(`${clip}:lower`)?.getEffectiveWeight() ?? 0;
  const walk = weightOf('Walk');
  const running = weightOf('Run');
  const legsClip: ClipName =
    weightOf('Idle') >= Math.max(walk, running)
      ? 'Idle'
      : walk >= running
        ? 'Walk'
        : 'Run';
  // The gait clips advance by ground covered over a stride blended between them.
  const stride =
    (VANGUARD.walkStride +
      (VANGUARD.runStride - VANGUARD.walkStride) *
        (running / (walk + running || 1))) *
    VANGUARD.scale;
  const legs: ClipReading = {
    clip: legsClip,
    frame: (a.actions.get(`${legsClip}:lower`)?.time ?? 0) * CLIP_FPS,
    frames: frames(legsClip),
    rate: legsClip === 'Idle' ? 1 : (speed / stride) * CLIP_SECONDS[legsClip],
    weight: weightOf(legsClip),
  };
  return {
    upper,
    legs,
    twist: upper ? (twist * 180) / Math.PI : null,
    speed,
  };
}

/** A clip played as authored, over the whole body. */
export function readAuthored(clip: ClipName, clipTime: number): Readout {
  const reading: ClipReading = {
    clip,
    frame: clipTime * CLIP_FPS,
    frames: frames(clip),
    rate: 1,
    weight: 1,
  };
  const swing = (SWING_CLIPS as string[]).includes(clip);
  return {
    upper: swing ? reading : null,
    legs: reading,
    twist: null,
    speed: 0,
  };
}
