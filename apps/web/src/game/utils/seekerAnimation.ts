import { setEnemyOpacity } from './enemyOpacity';
import * as THREE from 'three';
import { addRimLight } from './rimLight';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  SEEKER_ATTACK,
  SEEKER_GAIT,
  type seekerAttackPose,
} from '../survivors/seekerAttack';
import { enemyDefeatOpacity } from '../survivors/enemyDefeat';

type ClipName =
  | 'Idle'
  | 'Walk'
  | 'Run'
  | 'ChargeWindup'
  | 'Charge'
  | 'ChargeRecover'
  | 'Defeated';
export interface SeekerPose {
  time: number;
  speed: number;
  scale: number;
  attack?: ReturnType<typeof seekerAttackPose>;
  defeatAge?: number;
  flash?: boolean;
  opacity?: number;
}

/** Independent skeletons preserve the authored charge phases and collapse crossfades. */
export class SeekerAnimation {
  readonly root: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly actions = new Map<ClipName, THREE.AnimationAction>();
  private materials: {
    material: THREE.MeshStandardMaterial;
    color: THREE.Color;
  }[] = [];
  private skeletons = new Set<THREE.Skeleton>();
  private current?: ClipName;
  private lastTime?: number;

  constructor(source: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.root = clone(source);
    this.root.traverse((object) => {
      if (!(object instanceof THREE.SkinnedMesh)) return;
      const material = addRimLight(
        (object.material as THREE.MeshStandardMaterial).clone()
      ) as THREE.MeshStandardMaterial;
      object.material = material;
      object.frustumCulled = false;
      object.raycast = () => undefined;
      this.materials.push({ material, color: material.color.clone() });
      this.skeletons.add(object.skeleton);
    });
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const name of [
      'Idle',
      'Walk',
      'Run',
      'ChargeWindup',
      'Charge',
      'ChargeRecover',
      'Defeated',
    ] as const) {
      const clip = clips.find((c) => c.name === name);
      if (!clip) throw new Error(`Seeker is missing ${name}`);
      const action = this.mixer.clipAction(clip);
      if (
        name === 'ChargeWindup' ||
        name === 'ChargeRecover' ||
        name === 'Defeated'
      ) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(name, action);
    }
  }

  update(pose: SeekerPose) {
    const dt =
      this.lastTime === undefined ? 0 : Math.max(0, pose.time - this.lastTime);
    this.lastTime = pose.time;
    const dead = pose.defeatAge !== undefined;
    const name: ClipName = dead
      ? 'Defeated'
      : pose.attack !== undefined
        ? pose.attack.clip
        : pose.speed < 0.005
          ? 'Idle'
          : pose.speed <= SEEKER_GAIT.walkSpeed * pose.scale * 1.3
            ? 'Walk'
            : 'Run';
    const action = this.actions.get(name)!;
    if (this.current !== name) {
      const previous = this.current && this.actions.get(this.current);
      action.reset().setEffectiveWeight(1).play();
      if (previous) {
        previous.fadeOut(0.1);
        action.fadeIn(0.1);
      }
      this.current = name;
    }
    this.actions
      .get('Walk')!
      .setEffectiveTimeScale(pose.speed / (SEEKER_GAIT.walkSpeed * pose.scale));
    this.actions
      .get('Run')!
      .setEffectiveTimeScale(pose.speed / (SEEKER_GAIT.runSpeed * pose.scale));
    if (dead || pose.attack !== undefined) {
      action.setEffectiveTimeScale(0);
      const elapsed = Math.max(0, pose.defeatAge ?? pose.attack!.elapsed);
      action.time =
        name === 'Charge'
          ? ((elapsed * SEEKER_ATTACK.speed) /
              (SEEKER_GAIT.chargeSpeed * pose.scale)) %
            action.getClip().duration
          : Math.min(action.getClip().duration, elapsed);
    }
    this.mixer.update(dt);
    const opacity = dead ? enemyDefeatOpacity(pose.defeatAge!, 'seeker') : 1;
    for (const { material, color } of this.materials) {
      setEnemyOpacity(material, opacity * (pose.opacity ?? 1), dead);
      material.color.copy(color);
      if (pose.flash && !dead) material.color.multiplyScalar(5);
    }
    this.root.updateMatrixWorld(true);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    for (const { material } of this.materials) material.dispose();
    for (const skeleton of this.skeletons) skeleton.dispose();
    this.root.removeFromParent();
  }
}
