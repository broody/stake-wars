import * as THREE from 'three';
import {
  trooperGait,
  type TrooperController,
  type TrooperPose,
} from './trooperController';

export const TROOPER_CLIPS = {
  Idle: { carry: 'Armed_Idle', fire: 'Idle_Shoot' },
  Forward: { carry: 'Run_Carry_Forward', fire: 'Walk_Shoot_Forward' },
  Backward: { carry: 'Backward_Carry', fire: 'Backward_Shoot' },
  Strafe_Left: { carry: 'Strafe_Carry_Left', fire: 'Strafe_Shoot_Left' },
  Strafe_Right: { carry: 'Strafe_Carry_Right', fire: 'Strafe_Shoot_Right' },
} as const satisfies Record<TrooperPose, { carry: string; fire: string }>;

export class TrooperAnimation {
  readonly mixer: THREE.AnimationMixer;
  readonly actions: Record<
    TrooperPose,
    { carry: THREE.AnimationAction; fire: THREE.AnimationAction }
  >;
  private elapsed = 0;
  private fireElapsed = 0;
  private wasFiring = false;

  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {} as typeof this.actions;
    for (const pose of Object.keys(TROOPER_CLIPS) as TrooperPose[]) {
      const pair = {} as (typeof this.actions)[typeof pose];
      for (const mode of ['carry', 'fire'] as const) {
        const name = TROOPER_CLIPS[pose][mode];
        const clip = clips.find((c) => c.name === name);
        if (!clip) throw new Error(`Trooper model is missing ${name}`);
        pair[mode] = this.mixer.clipAction(clip).play();
        pair[mode].setEffectiveWeight(
          pose === 'Idle' && mode === 'carry' ? 1 : 0
        );
      }
      this.actions[pose] = pair;
    }
    this.mixer.update(0);
  }

  update(delta: number, controller: TrooperController, playing = true) {
    const dt = THREE.MathUtils.clamp(delta, 0, 0.05);
    const firing = playing && controller.firing;
    if (firing && !this.wasFiring) this.fireElapsed = 0;
    this.wasFiring = firing;
    if (playing) {
      this.elapsed += dt;
      this.fireElapsed += dt;
    }
    for (const pose of Object.keys(this.actions) as TrooperPose[]) {
      for (const mode of ['carry', 'fire'] as const) {
        const action = this.actions[pose][mode];
        action.setEffectiveWeight(
          controller.weights[pose] *
            (mode === 'fire'
              ? controller.fireWeight
              : 1 - controller.fireWeight)
        );
        // Firing clips span several strides. Each mode uses its own stride
        // duration and contact offset on one continuous normalized gait clock.
        const time =
          pose === 'Idle'
            ? mode === 'fire'
              ? this.fireElapsed
              : this.elapsed
            : (controller.cycles -
                trooperGait(pose, mode === 'fire').phaseOffset) *
              trooperGait(pose, mode === 'fire').duration;
        action.time = THREE.MathUtils.euclideanModulo(
          time,
          action.getClip().duration
        );
      }
    }
    this.mixer.update(0);
  }

  dispose(model: THREE.Object3D) {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(model);
  }
}
