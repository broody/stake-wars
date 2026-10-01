import * as THREE from 'three';

/** An independent left arm layer; saber twists and the running legs stay intact. */
export class BoltCasterAnimation {
  readonly gun: THREE.Object3D;
  private readonly upper: THREE.Object3D;
  private readonly forearm: THREE.Object3D;
  private readonly hand: THREE.Object3D;
  private readonly poses: {
    bone: THREE.Object3D;
    rotation: THREE.Quaternion;
  }[];
  private readonly flash: THREE.Mesh;
  private readonly materials = new Set<THREE.Material>();
  private readonly rotation = new THREE.Quaternion();
  private readonly parentRotation = new THREE.Quaternion();
  private readonly delta = new THREE.Quaternion();
  private readonly attachment = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0)
    )
  );
  private readonly basis = new THREE.Matrix4();
  private readonly up = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly shoulder = new THREE.Vector3();
  private readonly elbow = new THREE.Vector3();
  private readonly wrist = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly current = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();

  constructor(
    private readonly root: THREE.Object3D,
    source: THREE.Object3D
  ) {
    this.upper = root.getObjectByName('upper_armL')!;
    this.forearm = root.getObjectByName('forearmL')!;
    this.hand = root.getObjectByName('handL')!;
    this.poses = [this.upper, this.forearm, this.hand].map((bone) => ({
      bone,
      rotation: bone.quaternion.clone(),
    }));
    this.gun = source.clone(true);
    this.gun.quaternion.copy(this.attachment);
    this.gun.position.set(0, 0.085, 0);
    this.gun.visible = false;
    const energy = new THREE.Color();
    this.gun.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const copy = (m: THREE.Material) => {
        const result = m.clone();
        this.materials.add(result);
        if (m.name.includes('status light'))
          energy.copy((m as THREE.MeshStandardMaterial).emissive);
        return result;
      };
      o.material = Array.isArray(o.material)
        ? o.material.map(copy)
        : copy(o.material);
      o.frustumCulled = false;
      o.raycast = () => undefined;
    });
    this.hand.add(this.gun);
    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 6, 4),
      new THREE.MeshBasicMaterial({
        color: energy,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.flash.name = 'BoltCaster_Flash';
    this.flash.scale.set(0.045, 0.045, 0.12);
    this.flash.position.z = 0.06;
    this.flash.visible = false;
    this.flash.raycast = () => undefined;
    this.gun.getObjectByName('BoltCaster_Muzzle')!.add(this.flash);
  }

  /** Restore the mixer pose first, including frames where bindings don't change. */
  restore() {
    for (const { bone, rotation } of this.poses) bone.quaternion.copy(rotation);
  }

  update(equipped: boolean, yaw: number, shotAge: number) {
    for (const { bone, rotation } of this.poses) rotation.copy(bone.quaternion);
    this.gun.visible = equipped;
    this.flash.visible = equipped && shotAge >= 0 && shotAge < 0.065;
    if (!equipped) return;
    const recoil = shotAge >= 0 ? Math.exp(-shotAge * 30) : 0;
    this.root.getWorldQuaternion(this.rotation);
    const scale = this.root.getWorldScale(this.current).x;
    this.up.set(0, 1, 0).applyQuaternion(this.rotation);
    this.forward
      .set(Math.sin(yaw), 0, Math.cos(yaw))
      .applyQuaternion(this.rotation);
    this.right.crossVectors(this.up, this.forward);
    this.upper.getWorldPosition(this.shoulder);
    this.forearm.getWorldPosition(this.elbow);
    this.hand.getWorldPosition(this.wrist);
    const upperLength = this.shoulder.distanceTo(this.elbow);
    const lowerLength = this.elbow.distanceTo(this.wrist);
    this.wrist
      .copy(this.shoulder)
      .addScaledVector(this.right, 0.06 * scale)
      .addScaledVector(this.up, -0.12 * scale)
      .addScaledVector(this.forward, (0.46 - 0.045 * recoil) * scale);
    this.axis.subVectors(this.wrist, this.shoulder);
    const distance = this.axis.length();
    this.axis.normalize();
    const along =
      (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
    const bend = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
    this.pole
      .copy(this.right)
      .addScaledVector(this.up, -1.2)
      .projectOnPlane(this.axis)
      .normalize();
    this.elbow
      .copy(this.shoulder)
      .addScaledVector(this.axis, along)
      .addScaledVector(this.pole, bend);
    this.pointBone(this.upper, this.forearm, this.elbow);
    this.pointBone(this.forearm, this.hand, this.wrist);
    // Fixed grip: the wrist follows the barrel, rather than inheriting the saber's roll.
    this.basis.makeBasis(this.right, this.up, this.forward);
    this.rotation
      .setFromRotationMatrix(this.basis)
      .multiply(this.delta.copy(this.attachment).invert());
    this.hand.parent!.getWorldQuaternion(this.parentRotation).invert();
    this.hand.quaternion.copy(this.parentRotation).multiply(this.rotation);
    this.root.updateMatrixWorld(true);
  }

  private pointBone(
    bone: THREE.Object3D,
    child: THREE.Object3D,
    target: THREE.Vector3
  ) {
    bone.getWorldPosition(this.current);
    this.desired.subVectors(target, this.current).normalize();
    child.getWorldPosition(this.axis).sub(this.current).normalize();
    bone.getWorldQuaternion(this.rotation);
    this.delta.setFromUnitVectors(this.axis, this.desired);
    this.rotation.premultiply(this.delta);
    bone.parent!.getWorldQuaternion(this.parentRotation).invert();
    bone.quaternion.copy(this.parentRotation).multiply(this.rotation);
    this.root.updateMatrixWorld(true);
  }

  stopFiring() {
    this.flash.visible = false;
  }

  dispose() {
    this.gun.removeFromParent();
    for (const material of this.materials) material.dispose();
    this.flash.geometry.dispose();
    (this.flash.material as THREE.Material).dispose();
  }
}
