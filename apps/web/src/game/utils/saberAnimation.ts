import * as THREE from 'three';
import { BoltCasterAnimation } from './boltCasterAnimation';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  SABER,
  saberClipTime,
  type SaberAttack,
} from '../survivors/saberAttack';

const UPPER =
  /^(chest|neck|head|clavicle|pauldron|upper_arm|forearm|hand|weapon)/;
export function saberUpperTrack(track: THREE.KeyframeTrack) {
  return UPPER.test(track.name);
}
export function saberEnergyColor(source: THREE.Object3D) {
  let color = new THREE.Color();
  source.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material])
      if (m.name.includes('cyan energy'))
        color = (m as THREE.MeshStandardMaterial).emissive.clone();
  });
  return color;
}

export class SaberAnimation {
  readonly root: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly actions = new Map<string, THREE.AnimationAction>();
  gaitTime = 0;
  readonly boltCaster?: BoltCasterAnimation;
  private lastTime?: number;
  private moving = 0;
  private chest?: THREE.Object3D;
  private aimAxis = new THREE.Vector3();
  private rootRotation = new THREE.Quaternion();
  private parentRotation = new THREE.Quaternion();
  private twist = new THREE.Quaternion();
  private chestPose = new THREE.Quaternion();
  private dying = false;
  private deathMixer?: THREE.AnimationMixer;
  private deathAction?: THREE.AnimationAction;
  private deathPoses: {
    bone: THREE.Object3D;
    start: {
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      scale: THREE.Vector3;
    };
    sampled: {
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      scale: THREE.Vector3;
    };
  }[] = [];
  private skeletons = new Set<THREE.Skeleton>();
  private materials = new Set<THREE.Material>();

  constructor(
    source: THREE.Object3D,
    clips: THREE.AnimationClip[],
    gun?: THREE.Object3D
  ) {
    this.root = clone(source);
    this.chest = this.root.getObjectByName('chest');
    if (this.chest) this.chestPose.copy(this.chest.quaternion);
    this.root.traverse((o) => {
      if (o instanceof THREE.Bone) {
        const pose = () => ({
          position: o.position.clone(),
          quaternion: o.quaternion.clone(),
          scale: o.scale.clone(),
        });
        this.deathPoses.push({ bone: o, start: pose(), sampled: pose() });
      }
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
    for (const name of [
      'Saber_Idle',
      'Saber_Run',
      'Saber_Swing',
      'Saber_Backhand',
      'Saber_Run_Swing',
      'Saber_Run_Backhand',
    ]) {
      const clip = clips.find((c) => c.name === name);
      if (!clip) throw new Error(`Sector Trooper is missing ${name}`);
      for (const part of name === 'Saber_Idle' || name === 'Saber_Run'
        ? ['lower', 'upper']
        : ['upper']) {
        const tracks = clip.tracks.filter(
          (t) => saberUpperTrack(t) === (part === 'upper')
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
    const death = clips.find((c) => c.name === 'Saber_Death');
    if (!death) throw new Error('Sector Trooper is missing Saber_Death');
    const action = this.mixer.clipAction(death);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    action.paused = true;
    action.setEffectiveWeight(0);
    this.actions.set('Saber_Death', action);
    if (gun) this.boltCaster = new BoltCasterAnimation(this.root, gun);
  }

  /** Blend from the exact fatal-hit pose, then hold the authored final frame. */
  updateDeath(age: number) {
    this.boltCaster?.stopFiring();
    if (!this.dying) {
      this.dying = true;
      this.deathMixer?.stopAllAction();
      this.deathMixer?.uncacheRoot(this.root);
      this.deathMixer = new THREE.AnimationMixer(this.root);
      this.deathAction = this.deathMixer.clipAction(
        this.actions.get('Saber_Death')!.getClip()
      );
      this.deathAction.setLoop(THREE.LoopOnce, 1);
      this.deathAction.clampWhenFinished = true;
      this.deathAction.play();
      this.deathAction.paused = true;
      for (const { bone, start, sampled } of this.deathPoses) {
        for (const pose of [start, sampled]) {
          pose.position.copy(bone.position);
          pose.quaternion.copy(bone.quaternion);
          pose.scale.copy(bone.scale);
        }
      }
    }
    for (const { bone, sampled } of this.deathPoses) {
      bone.position.copy(sampled.position);
      bone.quaternion.copy(sampled.quaternion);
      bone.scale.copy(sampled.scale);
    }
    const death = this.deathAction!;
    death.time = Math.min(Math.max(0, age), death.getClip().duration);
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

  update(
    time: number,
    speed: number,
    attack?: SaberAttack,
    aimYaw = 0,
    gun?: { equipped: boolean; yaw: number; shotAge: number }
  ) {
    if (this.dying) {
      // Restore the last live pose before resuming the locomotion mixer's bindings.
      for (const { bone, start } of this.deathPoses) {
        bone.position.copy(start.position);
        bone.quaternion.copy(start.quaternion);
        bone.scale.copy(start.scale);
      }
    }
    this.dying = false;
    if (this.lastTime !== undefined && time < this.lastTime) {
      this.gaitTime = 0;
      this.moving = 0;
    }
    const dt =
      this.lastTime === undefined ? 0 : Math.max(0, time - this.lastTime);
    this.lastTime = time;
    this.gaitTime += (dt * speed) / (SABER.runSpeed * SABER.scale);
    this.moving +=
      ((speed > 0.005 ? 1 : 0) - this.moving) * (1 - Math.exp(-dt * 24));
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
      const suffix = attack.side > 0 ? 'Backhand' : 'Swing';
      for (const [name, weight] of [
        [`Saber_${suffix}`, 1 - this.moving],
        [`Saber_Run_${suffix}`, this.moving],
      ] as const) {
        const a = this.actions.get(`${name}:upper`)!;
        sample(
          name,
          'upper',
          weight * attackWeight,
          saberClipTime(elapsed, attack.duration, a.getClip().duration)
        );
      }
    }
    for (const part of ['lower', 'upper']) {
      const weight = part === 'upper' ? 1 - attackWeight : 1;
      sample('Saber_Idle', part, (1 - this.moving) * weight, time % 3);
      sample(
        'Saber_Run',
        part,
        this.moving * weight,
        this.gaitTime % SABER.duration
      );
    }
    // Restore the sampled pose: the mixer may skip unchanged bindings when paused.
    if (this.chest) this.chest.quaternion.copy(this.chestPose);
    this.boltCaster?.restore();
    this.mixer.update(0);
    if (this.chest) this.chestPose.copy(this.chest.quaternion);
    this.root.updateMatrixWorld(true);
    if (this.chest?.parent && attackWeight > 0) {
      // Apply aim above the pelvis so footwork and locomotion stay uninterrupted.
      this.root.getWorldQuaternion(this.rootRotation);
      this.chest.parent.getWorldQuaternion(this.parentRotation).invert();
      this.aimAxis
        .set(0, 1, 0)
        .applyQuaternion(this.rootRotation)
        .applyQuaternion(this.parentRotation);
      this.twist.setFromAxisAngle(this.aimAxis, aimYaw * attackWeight);
      this.chest.quaternion.premultiply(this.twist);
      this.root.updateMatrixWorld(true);
    }
    this.boltCaster?.update(
      gun?.equipped ?? false,
      gun?.yaw ?? 0,
      gun?.shotAge ?? -1
    );
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

/** Compensate for ellipse scaling so the displayed world-space angle matches damage. */
export function createSaberSlashGeometry(
  inner: number,
  arc = Math.PI,
  aspect = 1
) {
  const half = Math.atan2(Math.sin(arc / 2) / aspect, Math.cos(arc / 2));
  const g = new THREE.RingGeometry(inner, 1, 40, 1, -half, half * 2);
  g.rotateX(-Math.PI / 2);
  return g;
}
