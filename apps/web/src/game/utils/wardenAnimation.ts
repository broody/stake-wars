import { setEnemyOpacity } from './enemyOpacity';
import * as THREE from 'three';
import { addRimLight } from './rimLight';
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
      const changingGait =
        (name === 'Walk' && this.current === 'Run') ||
        (name === 'Run' && this.current === 'Walk');
      const phase =
        previous && changingGait
          ? previous.time / previous.getClip().duration
          : 0;
      action.reset().setEffectiveWeight(1).play();
      action.time = phase * action.getClip().duration;
      if (previous) {
        const blend = changingGait ? 0.18 : 0.1;
        previous.fadeOut(blend);
        action.fadeIn(blend);
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

/** A ground-hugging sector in the staff's local +Z frame, with a bright rim. */
export const WARDEN_MARK_LIFT = 0.018;
export function createWardenWarningGeometry(groundRadius: number) {
  const positions: number[] = [],
    shades: number[] = [],
    indices: number[] = [];
  const angles = [-WARDEN_SLAM.halfAngle, -WARDEN_SLAM.halfAngle + 0.035];
  for (let i = 1; i < 32; i++)
    angles.push(WARDEN_SLAM.halfAngle * ((2 * i) / 32 - 1));
  angles.push(WARDEN_SLAM.halfAngle - 0.035, WARDEN_SLAM.halfAngle);
  const distances = [0, 0.2, 0.4, 0.6, 0.8, 0.96, 1];
  const shell = groundRadius + WARDEN_MARK_LIFT;
  for (const [row, fraction] of distances.entries()) {
    const arc = (fraction * WARDEN_SLAM.radius) / groundRadius;
    for (const [col, angle] of angles.entries()) {
      positions.push(
        shell * Math.sin(arc) * Math.sin(angle),
        shell * (Math.cos(arc) - 1),
        shell * Math.sin(arc) * Math.cos(angle)
      );
      const rim = fraction === 1 || col === 0 || col === angles.length - 1;
      const light = rim ? 1 : 0.22 + 0.18 * fraction;
      shades.push(light, light, light);
      if (row && col) {
        const i = row * angles.length + col,
          prev = i - angles.length;
        indices.push(prev - 1, i - 1, i, prev - 1, i, prev);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
  geometry.setIndex(indices);
  return geometry;
}
