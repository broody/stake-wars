import { MathUtils, Object3D, Quaternion, Vector3 } from 'three';
import { VANGUARD_TURN_RATE } from '../survivors/content';

const up = new Vector3(0, 1, 0);
const axis = new Vector3(),
  pole = new Vector3(),
  joint = new Vector3();
const hip = new Vector3(),
  knee = new Vector3(),
  ankle = new Vector3();
const from = new Vector3(),
  to = new Vector3();
const delta = new Quaternion(),
  rotation = new Quaternion(),
  parent = new Quaternion();

const angle = (radians: number) =>
  Math.atan2(Math.sin(radians), Math.cos(radians));
const ramp = MathUtils.smoothstep;

function rotateWorld(bone: Object3D, delta: Quaternion) {
  bone.parent!.getWorldQuaternion(parent);
  rotation.copy(parent).invert().multiply(delta).multiply(parent);
  bone.quaternion.premultiply(rotation);
}

function aimJoint(
  bone: Object3D,
  child: Vector3,
  origin: Vector3,
  target: Vector3
) {
  delta.setFromUnitVectors(
    from.subVectors(child, origin).normalize(),
    to.subVectors(target, origin).normalize()
  );
  rotateWorld(bone, delta);
}

class Leg {
  readonly thigh: Object3D;
  readonly shin: Object3D;
  readonly foot: Object3D;
  readonly target = new Vector3();
  readonly orientation = new Quaternion();
  readonly last = new Vector3();
  readonly lastOrientation = new Quaternion();

  constructor(root: Object3D, side: string) {
    this.thigh = root.getObjectByName('thigh' + side)!;
    this.shin = root.getObjectByName('shin' + side)!;
    this.foot = root.getObjectByName('foot' + side)!;
  }

  /** Two-link solve along the clip's own knee bend, retaining the boot's contact angle. */
  plant() {
    this.thigh.getWorldPosition(hip);
    this.shin.getWorldPosition(knee);
    this.foot.getWorldPosition(ankle);
    const a = hip.distanceTo(knee),
      b = knee.distanceTo(ankle);
    axis.subVectors(this.target, hip);
    const d = MathUtils.clamp(
      axis.length(),
      Math.abs(a - b) + 1e-6,
      a + b - 1e-6
    );
    axis.normalize();
    from.subVectors(ankle, hip).normalize();
    pole.subVectors(knee, hip).addScaledVector(from, -pole.dot(from));
    pole.addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (a * a - b * b + d * d) / (2 * d);
    joint
      .copy(hip)
      .addScaledVector(axis, along)
      .addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
    aimJoint(this.thigh, knee, hip, joint);
    this.foot.getWorldPosition(ankle);
    aimJoint(this.shin, ankle, joint, this.target);
    this.shin.getWorldQuaternion(parent);
    this.foot.quaternion.copy(parent.invert()).multiply(this.orientation);
  }
}

/** Contact corrections layered on the sampled gait. All contact points are in world space. */
export class VanguardFootwork {
  private readonly pelvis: Object3D;
  private readonly left: Leg;
  private readonly right: Leg;
  private readonly normal = new Vector3();
  private readonly offset = new Vector3();
  private readonly basis = new Quaternion();
  private readonly yawRotation = new Quaternion();
  private readonly anchor = new Vector3();
  private readonly anchorOrientation = new Quaternion();
  private readonly sampled;
  private readonly pelvisPosition = new Vector3();
  private corrected = false;
  private support?: Leg;
  private turnAge = 0;
  private lastHeading?: number;
  private facing = 0;

  constructor(private readonly root: Object3D) {
    this.pelvis = root.getObjectByName('pelvis')!;
    this.left = new Leg(root, 'L');
    this.right = new Leg(root, 'R');
    this.sampled = [
      this.pelvis,
      this.left.thigh,
      this.left.shin,
      this.left.foot,
      this.right.thigh,
      this.right.shin,
      this.right.foot,
    ].map((bone) => ({
      bone,
      quaternion: bone.quaternion.clone(),
    }));
  }

  restore() {
    if (!this.corrected) return;
    this.pelvis.position.copy(this.pelvisPosition);
    for (const { bone, quaternion } of this.sampled)
      bone.quaternion.copy(quaternion);
    this.corrected = false;
  }

  reset() {
    this.lastHeading = undefined;
    this.support = undefined;
  }

  apply(
    dt: number,
    heading: number,
    backhandFrame: number,
    standing: number,
    aim: number,
    brace: number,
    gunPivot = false
  ) {
    this.root.getWorldQuaternion(this.basis);
    this.normal.copy(up).applyQuaternion(this.basis);
    if (this.lastHeading === undefined) this.facing = heading;
    else if (
      Math.abs(angle(heading - this.lastHeading)) > Math.PI / 3 ||
      (!this.support && Math.abs(angle(heading - this.facing)) > Math.PI / 3)
    ) {
      // Use the boot closest to the surface before the direction change.
      this.support =
        this.left.last.dot(this.normal) <= this.right.last.dot(this.normal)
          ? this.left
          : this.right;
      this.anchor.copy(this.support.last);
      this.anchorOrientation.copy(this.support.lastOrientation);
      this.turnAge = 0;
    }
    this.lastHeading = heading;
    const turn = angle(heading - this.facing);
    const stepAngle = VANGUARD_TURN_RATE * dt;
    this.facing += MathUtils.clamp(turn, -stepAngle, stepAngle);
    this.root.rotation.y = this.facing;
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldQuaternion(this.basis);

    // Plant the outside boot during the wind-up. Transfer weight onto it through the cut.
    const step =
      standing * ramp(backhandFrame, 0, 5) * (1 - ramp(backhandFrame, 13, 22));
    const transfer = ramp(backhandFrame, 4, 9);
    const twist =
      step * (MathUtils.clamp(aim * 0.62, -0.85, 0.85) + 0.2 - 0.42 * transfer);
    if (this.support || step > 0 || brace > 0) {
      this.corrected = true;
      this.pelvisPosition.copy(this.pelvis.position);
      for (const { bone, quaternion } of this.sampled)
        quaternion.copy(bone.quaternion);
      for (const leg of [this.left, this.right]) {
        leg.foot.getWorldPosition(leg.target);
        leg.foot.getWorldQuaternion(leg.orientation);
      }
      if (step > 0) {
        this.yawRotation.setFromAxisAngle(this.normal, twist);
        rotateWorld(this.pelvis, this.yawRotation);
        // Offsets are in authored metres. The pelvis parent has the rig's basis.
        this.offset.set(
          (0.045 - 0.14 * transfer) * step,
          -0.085 * step,
          0.045 * transfer * step
        );
        this.offset.applyQuaternion(this.basis);
        this.pelvis.parent!.getWorldQuaternion(parent).invert();
        this.pelvis.position.add(this.offset.applyQuaternion(parent));
        const plantYaw = MathUtils.clamp(aim * 0.65 - 0.22, -1, 0.85);
        const scale = this.root.getWorldScale(this.offset).x;
        // The left heel anchors the pivot. The right boot lifts, opens and settles
        // before impact; it picks up again only as the fighter recovers.
        this.yawRotation.setFromAxisAngle(this.normal, plantYaw * step);
        this.right.target
          .sub(this.left.target)
          .applyQuaternion(this.yawRotation)
          .add(this.left.target);
        this.offset
          .set(-0.09 * step, 0.08 * Math.sin(Math.PI * step), 0.12 * step)
          .applyQuaternion(this.basis)
          .multiplyScalar(scale);
        this.right.target.add(this.offset);
        this.right.orientation.premultiply(this.yawRotation);
      }
      if (brace > 0) {
        this.offset.copy(this.normal).multiplyScalar(-0.24 * brace);
        this.pelvis.parent!.getWorldQuaternion(parent).invert();
        this.pelvis.position.add(this.offset.applyQuaternion(parent));
      }
      if (this.support) {
        this.turnAge += dt;
        const weight = 1 - ramp(this.turnAge, 0.065, 0.16);
        // Absorb the change of direction through the knees, then drive back up.
        const compression = ramp(this.turnAge, 0, 0.055) * weight;
        this.offset.copy(this.normal).multiplyScalar(-0.09 * compression);
        this.pelvis.parent!.getWorldQuaternion(parent).invert();
        this.pelvis.position.add(this.offset.applyQuaternion(parent));
        if (gunPivot && standing > 0) {
          const stepping = this.support === this.left ? this.right : this.left;
          const lift = Math.sin(Math.PI * Math.min(1, this.turnAge / 0.16));
          stepping.target.addScaledVector(
            this.normal,
            0.115 * this.root.getWorldScale(this.offset).x * lift * standing
          );
        }
        this.support.target.lerp(this.anchor, weight);
        this.support.orientation.slerp(this.anchorOrientation, weight);
        if (weight === 0) this.support = undefined;
      }
      this.left.plant();
      this.right.plant();
    }
    this.root.updateWorldMatrix(true, true);
    for (const leg of [this.left, this.right]) {
      leg.foot.matrixWorld.decompose(leg.last, leg.lastOrientation, from);
    }
    return angle(heading - this.facing) - twist;
  }
}
