import * as THREE from 'three';
import { BoltCasterAnimation } from './boltCasterAnimation';
import { VanguardOffhand } from './vanguardOffhand';
import { VanguardFootwork } from './vanguardFootwork';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { saberClipTime, type SaberAttack } from '../survivors/saberAttack';
import type { Player } from '../survivors/sim';

/**
 * The Vanguard's authored model and how the game plays it. Speeds and the
 * strike frame come from the model's locomotion and sword metadata in
 * docs/concepts/core-survivors/vanguard.
 */
export const VANGUARD = {
  url: '/models/vanguard/vanguard.glb',
  /** Matches the Sector Trooper's height on screen (2.13 m tall as authored). */
  scale: 0.227,
  /** Authored travel per second and per stride, at scale 1. */
  walkSpeed: 0.81,
  walkStride: 1.08,
  runSpeed: 2.88,
  runStride: 2.4,
  /** Ground speeds, in world units a second, between which Walk gives way to Run. */
  runFrom: 0.2,
  runBy: 0.45,
  /** The sword clips' cut lands at frame 8. */
  impact: 8 / 24,
  /** Seconds of the Defeated clip, played once and held. */
  deathDuration: 3,
  recoilDuration: 0.36,
} as const;

/** Bones the sword clips drive over the gait, from the model's metadata. */
const UPPER_BONES = new Set(
  [
    'spine',
    'chest',
    'neck',
    'head',
    ...['L', 'R'].flatMap((side) => [
      `clavicle.${side}`,
      `upper_arm.${side}`,
      `forearm.${side}`,
      `hand.${side}`,
      `pauldron.${side}`,
      `thumb.01.${side}`,
      `thumb.02.${side}`,
      ...[1, 2, 3, 4].flatMap((finger) =>
        ['01', '02', '03'].map((joint) => `finger${finger}.${joint}.${side}`)
      ),
    ]),
    'weapon',
    'cape.00',
    'cape.01',
    'cape.02',
    'cape.03',
  ].map((name) => THREE.PropertyBinding.sanitizeNodeName(name))
);

export function vanguardUpperTrack(track: THREE.KeyframeTrack) {
  return UPPER_BONES.has(track.name.slice(0, track.name.lastIndexOf('.')));
}

const LOCOMOTION = ['Idle', 'Walk', 'Run'] as const;
/** Forehands end on the character's left; backhands on its right. */
const SWINGS = ['Attack', 'AttackBackhand', 'RunAttack', 'RunAttackBackhand'];
const DEATH = 'Defeated';
const signedYaw = (radians: number) =>
  Math.atan2(Math.sin(radians), Math.cos(radians));

interface BonePose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

export class VanguardAnimation {
  readonly root: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly actions = new Map<string, THREE.AnimationAction>();
  /** Fraction of a stride, shared by Walk and Run so they blend in step. */
  gaitPhase = 0;
  readonly canDie: boolean;
  readonly boltCaster?: BoltCasterAnimation;
  private readonly footwork: VanguardFootwork;
  private readonly offhand: VanguardOffhand;
  private lastTime?: number;
  private moving = 0;
  private running = 0;
  private chest?: THREE.Object3D;
  private chestPose = new THREE.Quaternion();
  private chestForward = new THREE.Vector3(0, 0, 1);
  private aimAxis = new THREE.Vector3();
  private rootRotation = new THREE.Quaternion();
  private parentRotation = new THREE.Quaternion();
  private twist = new THREE.Quaternion();
  private dying = false;
  private deathMixer?: THREE.AnimationMixer;
  private deathAction?: THREE.AnimationAction;
  private readonly deathClip?: THREE.AnimationClip;
  private deathPoses: {
    bone: THREE.Object3D;
    start: BonePose;
    sampled: BonePose;
  }[] = [];
  private skeletons = new Set<THREE.Skeleton>();
  private materials = new Set<THREE.Material>();

  constructor(
    source: THREE.Object3D,
    clips: THREE.AnimationClip[],
    gun?: THREE.Object3D
  ) {
    this.root = clone(source);
    this.offhand = new VanguardOffhand(this.root);
    this.footwork = new VanguardFootwork(this.root);
    this.chest = this.root.getObjectByName('chest');
    if (this.chest) {
      this.chestPose.copy(this.chest.quaternion);
      this.chestForward
        .applyQuaternion(this.root.getWorldQuaternion(this.rootRotation))
        .applyQuaternion(
          this.chest.getWorldQuaternion(this.parentRotation).invert()
        );
    }
    const pose = (o: THREE.Object3D): BonePose => ({
      position: o.position.clone(),
      quaternion: o.quaternion.clone(),
      scale: o.scale.clone(),
    });
    this.root.traverse((o) => {
      if (o instanceof THREE.Bone)
        this.deathPoses.push({ bone: o, start: pose(o), sampled: pose(o) });
      if (!(o instanceof THREE.Mesh)) return;
      o.frustumCulled = false;
      o.raycast = () => undefined;
      const copy = (m: THREE.Material) => {
        const c = m.clone();
        this.materials.add(c);
        return c;
      };
      o.material = Array.isArray(o.material)
        ? o.material.map(copy)
        : copy(o.material);
      if (o instanceof THREE.SkinnedMesh) this.skeletons.add(o.skeleton);
    });
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const name of [...LOCOMOTION, ...SWINGS]) {
      const clip = clips.find((c) => c.name === name);
      if (!clip) throw new Error(`Vanguard is missing ${name}`);
      // Gaits drive the whole body; swings only the upper body over them.
      const parts = SWINGS.includes(name) ? ['upper'] : ['lower', 'upper'];
      for (const part of parts) {
        const tracks = clip.tracks.filter(
          (t) => vanguardUpperTrack(t) === (part === 'upper')
        );
        const action = this.mixer.clipAction(
          new THREE.AnimationClip(`${name}:${part}`, clip.duration, tracks)
        );
        action.play();
        action.paused = true;
        action.setEffectiveWeight(0);
        this.actions.set(`${name}:${part}`, action);
      }
    }
    this.deathClip = clips.find((c) => c.name === DEATH);
    this.canDie = Boolean(this.deathClip);
    if (gun) this.boltCaster = new BoltCasterAnimation(this.root, gun);
  }

  /**
   * Blend from the exact fatal-hit pose into Defeated, then hold its final
   * frame.
   */
  updateDeath(age: number) {
    this.boltCaster?.stopFiring();
    if (!this.deathClip) return;
    if (!this.dying) {
      this.dying = true;
      this.deathMixer = new THREE.AnimationMixer(this.root);
      this.deathAction = this.deathMixer.clipAction(this.deathClip);
      this.deathAction.setLoop(THREE.LoopOnce, 1);
      this.deathAction.clampWhenFinished = true;
      this.deathAction.play();
      this.deathAction.paused = true;
      for (const { bone, start, sampled } of this.deathPoses)
        for (const pose of [start, sampled]) {
          pose.position.copy(bone.position);
          pose.quaternion.copy(bone.quaternion);
          pose.scale.copy(bone.scale);
        }
    }
    for (const { bone, sampled } of this.deathPoses) {
      bone.position.copy(sampled.position);
      bone.quaternion.copy(sampled.quaternion);
      bone.scale.copy(sampled.scale);
    }
    const death = this.deathAction!;
    death.time = Math.min(Math.max(0, age), this.deathClip.duration);
    this.deathMixer!.update(0);
    const t = Math.min(1, Math.max(0, age) / 0.15);
    const blend = t * t * (3 - 2 * t);
    for (const { bone, start, sampled } of this.deathPoses) {
      sampled.position.copy(bone.position);
      sampled.quaternion.copy(bone.quaternion);
      sampled.scale.copy(bone.scale);
      bone.position.lerpVectors(start.position, sampled.position, blend);
      bone.quaternion.copy(start.quaternion).slerp(sampled.quaternion, blend);
      bone.scale.lerpVectors(start.scale, sampled.scale, blend);
    }
    this.root.updateMatrixWorld(true);
  }

  /**
   * Pose for run time `time`, moving at `speed` world units a second, with
   * the current swing (if any) aimed `aimYaw` radians from the facing.
   */
  update(
    time: number,
    speed: number,
    attack?: SaberAttack,
    aimYaw = 0,
    headingYaw = 0,
    idleTime = time,
    landingBrace = 0,
    rebukeAge = -1,
    lobAge = -Infinity,
    wound?: Player['wound'],
    gun?: { yaw: number; targetYaw?: number; shotAge: number }
  ) {
    if (this.dying) {
      this.deathMixer?.stopAllAction();
      this.deathMixer?.uncacheRoot(this.root);
      // Restore the last live pose before the locomotion mixer resumes.
      for (const { bone, start } of this.deathPoses) {
        bone.position.copy(start.position);
        bone.quaternion.copy(start.quaternion);
        bone.scale.copy(start.scale);
      }
    }
    this.dying = false;
    if (this.lastTime !== undefined && time < this.lastTime) {
      this.gaitPhase = 0;
      this.moving = 0;
      this.running = 0;
      this.lastTime = undefined;
      this.footwork.reset();
    }
    const dt =
      this.lastTime === undefined ? 0 : Math.max(0, time - this.lastTime);
    this.lastTime = time;
    const ease = 1 - Math.exp(-dt * 24);
    this.moving += ((speed > 0.005 ? 1 : 0) - this.moving) * ease;
    const k = Math.min(
      1,
      Math.max(
        0,
        (speed - VANGUARD.runFrom) / (VANGUARD.runBy - VANGUARD.runFrom)
      )
    );
    this.running += (k * k * (3 - 2 * k) - this.running) * ease;
    // Advance by ground covered over the blended stride, so feet stay planted.
    const stride =
      (VANGUARD.walkStride +
        (VANGUARD.runStride - VANGUARD.walkStride) * this.running) *
      VANGUARD.scale;
    const backpedaling =
      gun && Math.cos(headingYaw - this.root.rotation.y) < -0.3;
    const phase =
      this.gaitPhase + ((backpedaling ? -1 : 1) * dt * speed) / stride;
    this.gaitPhase = phase % 1;
    if (this.gaitPhase < 0) this.gaitPhase++;

    for (const action of this.actions.values()) action.setEffectiveWeight(0);
    const sample = (
      name: string,
      part: string,
      weight: number,
      clock: number
    ) => {
      const a = this.actions.get(`${name}:${part}`)!;
      a.enabled = true;
      a.time = Math.max(0, clock);
      a.setEffectiveWeight(weight);
    };
    let attackWeight = 0;
    const elapsed = attack ? time - attack.startedAt : -1;
    if (attack && elapsed >= 0 && elapsed < attack.duration) {
      const phase = elapsed / attack.duration;
      attackWeight = Math.min(1, phase / 0.08, (1 - phase) / 0.12);
      const swing = attack.side > 0 ? 'AttackBackhand' : 'Attack';
      for (const [name, weight] of [
        [swing, 1 - this.moving],
        [`Run${swing}`, this.moving],
      ] as const) {
        const a = this.actions.get(`${name}:upper`)!;
        sample(
          name,
          'upper',
          weight * attackWeight,
          saberClipTime(
            elapsed,
            attack.duration,
            a.getClip().duration,
            VANGUARD.impact
          )
        );
      }
    }
    const clip = (name: string) =>
      this.actions.get(`${name}:lower`)!.getClip().duration;
    for (const part of ['lower', 'upper']) {
      const weight = part === 'upper' ? 1 - attackWeight : 1;
      sample('Idle', part, (1 - this.moving) * weight, idleTime % clip('Idle'));
      sample(
        'Walk',
        part,
        this.moving * (1 - this.running) * weight,
        this.gaitPhase * clip('Walk')
      );
      sample(
        'Run',
        part,
        this.moving * this.running * weight,
        this.gaitPhase * clip('Run')
      );
    }
    // Restore the sampled pose: the mixer may skip unchanged bindings when paused.
    this.boltCaster?.restore();
    this.footwork.restore();
    this.offhand.restore();
    if (this.chest) this.chest.quaternion.copy(this.chestPose);
    this.mixer.update(0);
    if (this.chest) this.chestPose.copy(this.chest.quaternion);
    const standing = 1 - THREE.MathUtils.smoothstep(this.moving, 0.05, 0.95);
    const backhandFrame =
      attack && attack.side > 0 && attackWeight > 0
        ? this.actions.get('AttackBackhand:upper')!.time * 24
        : 0;
    const gestureBrace =
      this.offhand.apply(rebukeAge, lobAge) * standing * (1 - attackWeight);
    let bodyHeading = headingYaw;
    const swordHeading = headingYaw + aimYaw;
    if (gun?.targetYaw !== undefined) {
      const bearing = signedYaw(gun.targetYaw - headingYaw);
      // For small corrections the shoulders lead. A rear target calls for a
      // full pivot, or a backpedal if movement continues during the turn.
      bodyHeading = gun.targetYaw - 0.55 * Math.sin(bearing);
      bodyHeading +=
        attackWeight *
        THREE.MathUtils.clamp(
          signedYaw(swordHeading - bodyHeading),
          -0.65,
          0.65
        );
    }
    const swordAim = signedYaw(swordHeading - bodyHeading);
    const correction = this.footwork.apply(
      dt,
      bodyHeading,
      backhandFrame,
      standing,
      swordAim,
      Math.max(landingBrace, gestureBrace),
      gun?.targetYaw !== undefined
    );
    const shoulderLead =
      gun?.targetYaw !== undefined
        ? THREE.MathUtils.clamp(
            signedYaw(gun.yaw - this.root.rotation.y) * 0.74,
            -0.65,
            0.65
          )
        : 0;
    const chestYaw =
      shoulderLead +
      signedYaw(swordAim + correction - shoulderLead) * attackWeight;
    if (this.chest?.parent && chestYaw !== 0) {
      this.root.getWorldQuaternion(this.rootRotation);
      this.chest.parent.getWorldQuaternion(this.parentRotation).invert();
      this.aimAxis
        .set(0, 1, 0)
        .applyQuaternion(this.rootRotation)
        .applyQuaternion(this.parentRotation);
      this.twist.setFromAxisAngle(this.aimAxis, chestYaw);
      this.chest.quaternion.premultiply(this.twist);
      this.root.updateMatrixWorld(true);
    }
    const age = wound ? time - wound.at : -1;
    if (
      this.chest?.parent &&
      wound &&
      age >= 0 &&
      age < VANGUARD.recoilDuration
    ) {
      // Take the hit across the shoulder line, in the same frame as Aegis.
      // The feet retain their sampled stride. The next update restores chestPose.
      const peak = 0.07;
      const weight =
        THREE.MathUtils.smoothstep(age, 0, peak) *
        (1 - THREE.MathUtils.smoothstep(age, peak, VANGUARD.recoilDuration));
      const { bearing } = wound;
      this.aimAxis
        .set(
          -Math.cos(bearing),
          0.64 * Math.sin(bearing - this.root.rotation.y),
          Math.sin(bearing)
        )
        .normalize();
      if (this.root.parent)
        this.aimAxis.applyQuaternion(
          this.root.parent.getWorldQuaternion(this.rootRotation)
        );
      this.chest.parent.getWorldQuaternion(this.parentRotation).invert();
      this.twist.setFromAxisAngle(
        this.aimAxis.applyQuaternion(this.parentRotation),
        weight * (wound.heavy ? 0.58 : 0.4)
      );
      this.chest.quaternion.premultiply(this.twist);
      this.root.updateMatrixWorld(true);
    }
    const shotAge = gun?.shotAge ?? -1;
    let armYaw = signedYaw(
      (gun?.yaw ?? this.root.rotation.y) - this.root.rotation.y
    );
    if (gun && this.chest) {
      // Read the actual posed ribs, including a saber wind-up or a hit reaction.
      // The wrist can finish the aim only within the left shoulder’s reach.
      this.aimAxis
        .copy(this.chestForward)
        .applyQuaternion(this.chest.getWorldQuaternion(this.parentRotation))
        .applyQuaternion(
          this.root.getWorldQuaternion(this.rootRotation).invert()
        );
      const ribs = Math.atan2(this.aimAxis.x, this.aimAxis.z);
      armYaw =
        ribs + THREE.MathUtils.clamp(signedYaw(armYaw - ribs), -1.05, 1.35);
    }
    this.boltCaster?.update(
      !!gun,
      armYaw,
      shotAge,
      this.offhand.weight *
        (shotAge < 0 ? 1 : THREE.MathUtils.smoothstep(shotAge, 0.065, 0.18))
    );
    return chestYaw;
  }

  dispose() {
    this.boltCaster?.dispose();
    this.deathMixer?.stopAllAction();
    this.deathMixer?.uncacheRoot(this.root);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    for (const m of this.materials) m.dispose();
    for (const s of this.skeletons) s.dispose();
    this.root.removeFromParent();
  }
}
