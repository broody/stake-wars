import { MathUtils, Matrix4, Object3D, Quaternion, Vector3 } from 'three';

export const REBUKE_GESTURE = {
  guard: 0.08,
  extended: 0.19,
  hold: 0.27,
  end: 0.56,
} as const;

type Direction = [number, number, number];

// In the Vanguard rig +Y runs along the limb and +Z points toward the thumb.
// Author the two silhouettes in character space (+X left, +Z forward).
function orientation(along: Direction, thumb: Direction) {
  const y = new Vector3(...along).normalize();
  const x = y
    .clone()
    .cross(new Vector3(...thumb))
    .normalize();
  const z = x.clone().cross(y);
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(x, y, z)
  );
}

const guard = [
  orientation([0.48, -0.77, 0.42], [0, 0.2, 1]),
  orientation([-0.65, 0.65, 0.4], [-0.35, 0.2, 1]),
  orientation([-0.53, 0.84, 0.14], [-0.35, 0.2, 1]),
  orientation([0.75, -0.6, 0.28], [0, 1, 0]),
];
const drive = [
  orientation([0.94, -0.21, 0.27], [-0.2, 0.73, 0.65]),
  orientation([0.77, 0.28, 0.57], [-0.45, 0.7, 0.55]),
  orientation([0.24, 0.93, 0.28], [-0.64, -0.12, 0.76]),
  orientation([0.97, -0.15, 0.18], [0, 1, 0]),
];

// Scoop from behind the hip, then lift the palm through the launch point.
const scoop = [
  orientation([0.47, -0.8, -0.38], [0.5, -0.1, 0.85]),
  orientation([0.16, -0.59, -0.79], [0.2, -0.74, 0.64]),
  orientation([0.12, -0.8, -0.58], [0.18, -0.52, 0.84]),
  orientation([0.68, -0.7, -0.22], [0, 1, 0]),
];
const release = [
  orientation([0.53, 0.13, 0.84], [-0.16, 0.98, -0.05]),
  orientation([0.25, 0.68, 0.69], [-0.4, 0.7, -0.55]),
  orientation([0.3, 0.44, 0.85], [-0.25, 0.88, -0.4]),
  orientation([0.9, -0.12, 0.4], [0, 1, 0]),
];

/** The free gauntlet can counter or throw over the current sword and gait. */
export class VanguardOffhand {
  private readonly joints;
  private readonly fingers;
  private readonly target = new Quaternion();
  weight = 0;

  constructor(root: Object3D) {
    const clavicle = root
      .getObjectByName('clavicleL')!
      .getWorldQuaternion(new Quaternion());
    this.joints = ['upper_armL', 'forearmL', 'handL', 'pauldronL'].map(
      (name, i) => {
        const bone = root.getObjectByName(name)!;
        // The pauldron is a sibling of the upper arm. Let it lift with the shoulder.
        const local = (pose: Quaternion[]) =>
          (i === 0 || i === 3 ? clavicle : pose[i - 1])
            .clone()
            .invert()
            .multiply(pose[i]);
        return {
          bone,
          guard: local(guard),
          drive: local(drive),
          scoop: local(scoop),
          release: local(release),
          sampled: new Quaternion(),
        };
      }
    );
    this.fingers = root
      .getObjectByName('handL')!
      .getObjectsByProperty('type', 'Bone')
      .filter(
        (bone) =>
          bone.name.startsWith('finger') || bone.name.startsWith('thumb')
      )
      .map((bone) => ({
        bone,
        open: bone.quaternion.clone(),
        sampled: new Quaternion(),
      }));
  }

  restore() {
    if (!this.weight) return;
    for (const { bone, sampled } of this.joints) bone.quaternion.copy(sampled);
    for (const { bone, sampled } of this.fingers) bone.quaternion.copy(sampled);
    this.weight = 0;
  }

  /** Rebuke takes the free hand if a hit interrupts a toss. */
  apply(rebukeAge: number, lobAge: number) {
    const { guard, extended, hold, end } = REBUKE_GESTURE;
    if (rebukeAge > 0 && rebukeAge < end) {
      const reach = MathUtils.smoothstep(rebukeAge, guard, extended);
      const weight =
        MathUtils.smoothstep(rebukeAge, 0, guard) *
        (1 - MathUtils.smoothstep(rebukeAge, hold, end));
      this.pose('guard', 'drive', weight, reach);
      return weight * (0.73 - 0.37 * reach);
    }
    if (lobAge > -0.25 && lobAge < 0.32) {
      const reach = MathUtils.smoothstep(lobAge, -0.13, 0.015);
      const weight =
        MathUtils.smoothstep(lobAge, -0.25, -0.14) *
        (1 - MathUtils.smoothstep(lobAge, 0.055, 0.32));
      this.pose('scoop', 'release', weight, reach);
      return 0.4 * weight * (1 - reach);
    }
    return 0;
  }

  private pose(
    from: 'guard' | 'scoop',
    to: 'drive' | 'release',
    weight: number,
    reach: number
  ) {
    this.weight = weight;
    for (const joint of this.joints) {
      joint.sampled.copy(joint.bone.quaternion);
      this.target.slerpQuaternions(joint[from], joint[to], reach);
      joint.bone.quaternion.slerp(this.target, weight);
    }
    for (const { bone, open, sampled } of this.fingers) {
      sampled.copy(bone.quaternion);
      bone.quaternion.slerp(open, weight * reach * 0.92);
    }
  }
}
