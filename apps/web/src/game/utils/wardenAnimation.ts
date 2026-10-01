import { setEnemyOpacity } from './enemyOpacity';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { WARDEN_GAIT, WARDEN_SLAM } from '../survivors/wardenAttack';
import { enemyDefeatOpacity } from '../survivors/enemyDefeat';

type ClipName = 'Guard' | 'Walk' | 'Run' | 'StaffSlam' | 'Defeated';
export interface WardenPose {
  time: number;
  speed: number;
  scale: number;
  slamElapsed?: number;
  defeatAge?: number;
  flash?: boolean;
  opacity?: number;
}

/** Wardens are rare: real skinned clones retain crossfades and sensor morph tracks. */
export class WardenAnimation {
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
      const material = (object.material as THREE.MeshStandardMaterial).clone();
      object.material = material;
      object.frustumCulled = false;
      object.raycast = () => undefined;
      this.materials.push({ material, color: material.color.clone() });
      this.skeletons.add(object.skeleton);
    });
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const name of [
      'Guard',
      'Walk',
      'Run',
      'StaffSlam',
      'Defeated',
    ] as const) {
      const clip = clips.find((c) => c.name === name);
      if (!clip) throw new Error(`Warden is missing ${name}`);
      const action = this.mixer.clipAction(clip);
      if (name === 'StaffSlam' || name === 'Defeated') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(name, action);
    }
  }

  update(pose: WardenPose) {
    const dt =
      this.lastTime === undefined ? 0 : Math.max(0, pose.time - this.lastTime);
    this.lastTime = pose.time;
    const dead = pose.defeatAge !== undefined;
    const name: ClipName = dead
      ? 'Defeated'
      : pose.slamElapsed !== undefined
        ? 'StaffSlam'
        : pose.speed < 0.005
          ? 'Guard'
          : pose.speed <= WARDEN_GAIT.walkSpeed * pose.scale * 1.3
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
      .setEffectiveTimeScale(pose.speed / (WARDEN_GAIT.walkSpeed * pose.scale));
    this.actions
      .get('Run')!
      .setEffectiveTimeScale(pose.speed / (WARDEN_GAIT.runSpeed * pose.scale));
    if (dead || pose.slamElapsed !== undefined) {
      action.setEffectiveTimeScale(0);
      action.time = Math.min(
        action.getClip().duration,
        pose.defeatAge ?? pose.slamElapsed!
      );
    }
    this.mixer.update(dt);
    const opacity = dead ? enemyDefeatOpacity(pose.defeatAge!, 'warden') : 1;
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

/** CircleGeometry starts in XY; after rotation its negative Y becomes forward +Z. */
export function createWardenWarningGeometry() {
  const geometry = new THREE.CircleGeometry(
    1,
    24,
    -Math.PI / 2 - WARDEN_SLAM.halfAngle,
    2 * WARDEN_SLAM.halfAngle
  );
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}
