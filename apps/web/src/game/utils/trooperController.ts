import * as THREE from 'three';

export const TROOPER_SCALE = 0.35;
export const TROOPER_SOLE_OFFSET = 486 / 384;
export const TROOPER_MODEL_URL =
  '/models/sector-trooper/sector-trooper.glb?v=armed-run-3';
export const TROOPER_GAITS = {
  Forward: { duration: 18 / 24, speed: 1.76, x: 0, z: 1, phaseOffset: 0.94 },
  Backward: { duration: 16 / 24, speed: 1.08, x: 0, z: -1, phaseOffset: 0 },
  Strafe_Left: {
    duration: 14 / 24,
    speed: 0.9257142857,
    x: 1,
    z: 0,
    phaseOffset: 0,
  },
  Strafe_Right: {
    duration: 14 / 24,
    speed: 0.9257142857,
    x: -1,
    z: 0,
    phaseOffset: 0,
  },
} as const;
export type TrooperGait = keyof typeof TROOPER_GAITS;
export type TrooperPose = TrooperGait | 'Idle';
const FORWARD_FIRE_GAIT = {
  duration: 28 / 24,
  speed: 0.72,
  x: 0,
  z: 1,
  phaseOffset: 0,
};
export function trooperGait(pose: TrooperGait, firing = false) {
  return pose === 'Forward' && firing ? FORWARD_FIRE_GAIT : TROOPER_GAITS[pose];
}
export const TROOPER_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);

export function trooperInput(keys: ReadonlySet<string>) {
  return {
    forward: Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
    left: Number(keys.has('KeyA')) - Number(keys.has('KeyD')),
  };
}

export function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'
      )
    )
  );
}

/** Parallel-transport the heading around a sphere; never accumulate Euler turns. */
export class TrooperController {
  readonly normal = new THREE.Vector3(0, 0, 1);
  readonly forward = new THREE.Vector3(0, 1, 0);
  readonly weights: Record<TrooperPose, number> = {
    Idle: 1,
    Forward: 0,
    Backward: 0,
    Strafe_Left: 0,
    Strafe_Right: 0,
  };
  firing = false;
  fireWeight = 0;
  phase = 0;
  cycles = 0;
  private readonly left = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();

  turn(radians: number) {
    this.forward
      .applyAxisAngle(this.normal, radians)
      .projectOnPlane(this.normal)
      .normalize();
  }

  stop() {
    this.firing = false;
    this.fireWeight = 0;
    for (const name of Object.keys(this.weights) as TrooperPose[])
      this.weights[name] = name === 'Idle' ? 1 : 0;
  }

  update(
    delta: number,
    radius: number,
    input: { forward: number; left: number; firing?: boolean }
  ) {
    const dt = Math.min(Math.max(delta, 0), 0.05);
    if (!dt || !Number.isFinite(radius) || radius <= 0) return;
    this.firing = Boolean(input.firing);
    this.fireWeight = THREE.MathUtils.damp(
      this.fireWeight,
      this.firing ? 1 : 0,
      24,
      dt
    );
    const f = Math.sign(input.forward),
      l = Math.sign(input.left);
    const total = Math.abs(f) + Math.abs(l);
    const target: Record<TrooperPose, number> = {
      Idle: total ? 0 : 1,
      Forward: f > 0 ? 1 / total : 0,
      Backward: f < 0 ? 1 / total : 0,
      Strafe_Left: l > 0 ? 1 / total : 0,
      Strafe_Right: l < 0 ? 1 / total : 0,
    };
    for (const name of Object.keys(this.weights) as TrooperPose[])
      this.weights[name] = THREE.MathUtils.damp(
        this.weights[name],
        target[name],
        16,
        dt
      );
    let cadence = 0,
      movingWeight = 0;
    for (const name of Object.keys(TROOPER_GAITS) as TrooperGait[]) {
      cadence +=
        this.weights[name] *
        ((1 - this.fireWeight) / trooperGait(name).duration +
          this.fireWeight / trooperGait(name, true).duration);
      movingWeight += this.weights[name];
    }
    // All clips share contact phase. Their sampled speed scales with cadence,
    // so blended pose and movement continue to use the same clock.
    if (movingWeight > 0.0001) cadence /= movingWeight;
    this.cycles += cadence * dt;
    this.phase = this.cycles % 1;
    this.left.crossVectors(this.normal, this.forward).normalize();
    this.velocity.set(0, 0, 0);
    for (const name of Object.keys(TROOPER_GAITS) as TrooperGait[]) {
      const gait = trooperGait(name);
      const firingGait = trooperGait(name, true);
      const speed =
        this.weights[name] *
        ((1 - this.fireWeight) * gait.speed * gait.duration +
          this.fireWeight * firingGait.speed * firingGait.duration) *
        cadence *
        TROOPER_SCALE;
      this.velocity.addScaledVector(this.left, gait.x * speed);
      this.velocity.addScaledVector(this.forward, gait.z * speed);
    }
    const speed = this.velocity.length();
    if (speed < 0.00001) return;
    this.axis.crossVectors(this.normal, this.velocity).normalize();
    this.rotation.setFromAxisAngle(this.axis, (speed * dt) / radius);
    this.normal.applyQuaternion(this.rotation).normalize();
    this.forward
      .applyQuaternion(this.rotation)
      .projectOnPlane(this.normal)
      .normalize();
  }
}
