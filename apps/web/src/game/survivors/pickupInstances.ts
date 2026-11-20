import * as THREE from 'three';
import {
  createPickupGeometry,
  PICKUP_MODELS,
  shardModel,
  type PickupModel,
} from './pickupGeometry';
import { lerpNormal, vec3 } from './sphere';
import { MAX_GEMS, type Run } from './sim';

type Mesh = THREE.InstancedMesh<
  THREE.BufferGeometry,
  THREE.MeshStandardMaterial
>;
const localUp = new THREE.Vector3(0, 1, 0);

/** Build before combat. Catalog views can share the same GPU buffers. */
function buildAssets() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.57,
    metalness: 0.22,
  });
  const geometries = new Map(
    PICKUP_MODELS.map((kind) => [kind, createPickupGeometry(kind)])
  );
  return { material, geometries, users: 0 };
}
let shared: ReturnType<typeof buildAssets> | undefined;

/** One matrix stream per visible silhouette. No per-pickup materials or scene nodes. */
export class PickupInstances {
  readonly group = new THREE.Group();
  private readonly batches = new Map<PickupModel, Mesh>();
  private readonly assets = (shared ??= buildAssets());
  private readonly normal = vec3();
  private readonly up = new THREE.Vector3();
  private readonly pose = new THREE.Object3D();
  private readonly spin = new THREE.Quaternion();

  constructor() {
    this.assets.users++;
  }

  private write(
    kind: PickupModel,
    lift: number,
    angle: number,
    size: number,
    radius: number
  ) {
    let mesh = this.batches.get(kind);
    if (!mesh || mesh.count === mesh.instanceMatrix.count) {
      const capacity = mesh
        ? mesh.instanceMatrix.count * 2
        : kind.startsWith('shard-')
          ? MAX_GEMS
          : 12;
      const next = new THREE.InstancedMesh(
        this.assets.geometries.get(kind)!,
        this.assets.material,
        capacity
      );
      next.name = kind;
      next.frustumCulled = false;
      next.raycast = () => undefined;
      next.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      next.count = mesh?.count ?? 0;
      if (mesh) {
        next.instanceMatrix.array.set(mesh.instanceMatrix.array);
        this.group.remove(mesh);
        mesh.dispose();
      }
      this.group.add(next);
      this.batches.set(kind, next);
      mesh = next;
    }

    this.up.copy(this.normal);
    this.pose.position.copy(this.up).multiplyScalar(radius + lift);
    this.pose.quaternion.setFromUnitVectors(localUp, this.up);
    this.pose.quaternion.multiply(this.spin.setFromAxisAngle(localUp, angle));
    this.pose.scale.setScalar(size);
    this.pose.updateMatrix();
    mesh.setMatrixAt(mesh.count++, this.pose.matrix);
  }

  update(
    run: Pick<Run, 'gems' | 'items' | 'time'>,
    radius: number,
    alpha: number
  ) {
    for (const mesh of this.batches.values()) mesh.count = 0;
    for (const gem of run.gems) {
      lerpNormal(this.normal, gem.prev, gem.n, alpha);
      const phase =
        this.normal.x * 83 + this.normal.y * 59 + this.normal.z * 107;
      const bob = 0.012 * Math.sin(run.time * 3.4 + phase);
      this.write(
        shardModel(gem.value),
        0.083 + bob,
        run.time * 1.15 + phase,
        1,
        radius
      );
    }
    for (const item of run.items) {
      lerpNormal(this.normal, item.prev, item.n, alpha);
      if (item.kind === 'drop') {
        const arrived = 1 - (1 - Math.min(item.age / 1.15, 1)) ** 3;
        const full = item.big ? 0.33 : 0.235;
        const size = full * (0.35 + 0.65 * arrived);
        const lift =
          size * 0.81 +
          full *
            ((1 - arrived) * 2.1 + Math.sin(item.age * 1.45) * 0.055 * arrived);
        this.write(
          item.big ? 'drop-large' : 'drop',
          lift,
          item.age * 0.45,
          size,
          radius
        );
      } else {
        this.write(
          item.kind,
          0.083 + Math.sin(item.age * 3.2) * 0.012,
          item.age * 0.85,
          item.big ? 1.5 : 1,
          radius
        );
      }
    }
    for (const mesh of this.batches.values()) {
      mesh.visible = mesh.count > 0;
      if (!mesh.visible) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const mesh of this.batches.values()) {
      mesh.dispose();
    }
    if (--this.assets.users === 0) {
      for (const geometry of this.assets.geometries.values())
        geometry.dispose();
      this.assets.material.dispose();
      shared = undefined;
    }
    this.batches.clear();
    this.group.clear();
  }
}
