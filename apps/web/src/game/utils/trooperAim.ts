import * as THREE from 'three';

// Future laser simulation must use this same muzzle ray and endpoint.
export const TROOPER_LASER_RANGE = 30;
export const TROOPER_MUZZLE_NAME =
  THREE.PropertyBinding.sanitizeNodeName('ATTACH | Muzzle');

/** Camera-selected aim, retained in the player's tangent frame after RMB release. */
export class TrooperAim {
  readonly ray = new THREE.Ray();
  readonly point = new THREE.Vector3();
  readonly screen = new THREE.Vector2();
  hitGround = false;
  private readonly localDirection = new THREE.Vector3(
    0,
    -Math.sin(0.46),
    Math.cos(0.46)
  );
  private readonly sightRay = new THREE.Ray();
  private readonly cameraRay = new THREE.Ray();
  private readonly right = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly ground = new THREE.Sphere(new THREE.Vector3(), 5);
  private readonly intersection = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();

  update(
    normal: THREE.Vector3,
    forward: THREE.Vector3,
    radius: number,
    camera: THREE.Camera,
    cameraAiming: boolean
  ) {
    this.ground.radius = radius;
    this.right.crossVectors(forward, normal).normalize();
    // Stable firing origin: independent of animation bob, rifle recoil and hand pose.
    this.sightRay.origin
      .copy(normal)
      .multiplyScalar(radius + 0.42)
      .addScaledVector(forward, 0.05);
    if (cameraAiming) {
      this.cameraRay.origin.setFromMatrixPosition(camera.matrixWorld);
      camera.getWorldDirection(this.cameraRay.direction);
      const hit = this.cameraRay.intersectSphere(
        this.ground,
        this.intersection
      );
      if (hit && this.cameraRay.origin.distanceTo(hit) <= TROOPER_LASER_RANGE)
        this.desired.copy(hit);
      else this.cameraRay.at(TROOPER_LASER_RANGE, this.desired);
      this.desired.sub(this.sightRay.origin).normalize();
      this.localDirection.set(
        this.desired.dot(this.right),
        this.desired.dot(normal),
        this.desired.dot(forward)
      );
    }
    this.sightRay.direction
      .copy(this.right)
      .multiplyScalar(this.localDirection.x)
      .addScaledVector(normal, this.localDirection.y)
      .addScaledVector(forward, this.localDirection.z)
      .normalize();
    const hit = this.sightRay.intersectSphere(this.ground, this.intersection);
    this.hitGround = Boolean(
      hit && this.sightRay.origin.distanceTo(hit) <= TROOPER_LASER_RANGE
    );
    if (this.hitGround) this.point.copy(this.intersection);
    else this.sightRay.at(TROOPER_LASER_RANGE, this.point);
  }

  setMuzzle(muzzle: THREE.Object3D) {
    muzzle.updateWorldMatrix(true, false);
    this.ray.origin.setFromMatrixPosition(muzzle.matrixWorld);
    // Recoil is visual. Lasers converge from the muzzle onto the steady aim point.
    this.ray.direction.subVectors(this.point, this.ray.origin).normalize();
  }

  project(camera: THREE.Camera, width: number, height: number) {
    this.projected.copy(this.point).applyMatrix4(camera.matrixWorldInverse);
    if (this.projected.z >= 0) return false;
    this.projected.copy(this.point).project(camera);
    if (
      Math.abs(this.projected.x) > 1 ||
      Math.abs(this.projected.y) > 1 ||
      Math.abs(this.projected.z) > 1
    )
      return false;
    this.cameraRay.origin.setFromMatrixPosition(camera.matrixWorld);
    this.cameraRay.direction
      .subVectors(this.point, this.cameraRay.origin)
      .normalize();
    const obstruction = this.cameraRay.intersectSphere(
      this.ground,
      this.intersection
    );
    if (
      obstruction &&
      this.cameraRay.origin.distanceTo(obstruction) + 0.001 <
        this.cameraRay.origin.distanceTo(this.point)
    )
      return false;
    this.screen.set(
      ((this.projected.x + 1) * width) / 2,
      ((1 - this.projected.y) * height) / 2
    );
    return true;
  }
}

const IDENTITY = new THREE.Quaternion();

/** Aim both upper limbs together; preserve grip contact and visual recoil. */
export class TrooperAimPose {
  private readonly arms: Array<{
    bone: THREE.Object3D;
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
    scale: THREE.Vector3;
  }>;
  private applied = false;
  private readonly pivot = new THREE.Vector3();
  private readonly other = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly adjustment = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();

  constructor(model: THREE.Object3D) {
    this.arms = ['clavicle.L', 'clavicle.R'].map((name) => {
      const bone = model.getObjectByName(
        THREE.PropertyBinding.sanitizeNodeName(name)
      );
      if (!bone?.parent) throw new Error(`Trooper is missing ${name}`);
      return {
        bone,
        position: new THREE.Vector3(),
        rotation: new THREE.Quaternion(),
        scale: new THREE.Vector3(),
      };
    });
  }

  // Restore before the mixer runs: unchanged animation tracks may skip writes.
  reset() {
    if (!this.applied) return;
    for (const arm of this.arms) {
      arm.bone.position.copy(arm.position);
      arm.bone.quaternion.copy(arm.rotation);
      arm.bone.scale.copy(arm.scale);
    }
    this.applied = false;
  }

  apply(forward: THREE.Vector3, aimPoint: THREE.Vector3, weight: number) {
    this.reset();
    if (weight < 0.0001) return;
    this.arms[0].bone.getWorldPosition(this.pivot);
    this.arms[1].bone.getWorldPosition(this.other);
    this.pivot.add(this.other).multiplyScalar(0.5);
    this.target.subVectors(aimPoint, this.pivot).normalize();
    this.rotation.setFromUnitVectors(forward, this.target);
    this.rotation.slerp(IDENTITY, 1 - weight);
    this.adjustment.makeRotationFromQuaternion(this.rotation);
    this.other.copy(this.pivot).applyQuaternion(this.rotation);
    this.adjustment.setPosition(this.other.subVectors(this.pivot, this.other));
    for (const arm of this.arms) {
      arm.position.copy(arm.bone.position);
      arm.rotation.copy(arm.bone.quaternion);
      arm.scale.copy(arm.bone.scale);
      this.local
        .copy(arm.bone.parent!.matrixWorld)
        .invert()
        .multiply(this.adjustment)
        .multiply(arm.bone.matrixWorld);
      this.local.decompose(
        arm.bone.position,
        arm.bone.quaternion,
        arm.bone.scale
      );
      arm.bone.updateWorldMatrix(false, true);
    }
    this.applied = true;
  }
}
