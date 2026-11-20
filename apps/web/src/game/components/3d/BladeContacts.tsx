import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { colors } from '../../../ui/tokens';
import {
  toVector,
  useRenderer,
  type Renderer,
} from '../../survivors/renderFrame';
import { SIM_HZ } from '../../survivors/sim';

const LIFE = 0.17;
const up = new THREE.Vector3(0, 1, 0);
const normal = new THREE.Vector3(),
  incoming = new THREE.Vector3(),
  side = new THREE.Vector3(),
  direction = new THREE.Vector3();
const spark = new THREE.Object3D();
const white = new THREE.Color(colors.fg.DEFAULT);

/** Three short splinters spray away from the actual enemy contact, including piercing hits. */
export function BladeContacts({
  registry,
  color,
}: {
  registry: Set<Renderer>;
  color: THREE.ColorRepresentation;
}) {
  const batch = useRef<THREE.InstancedMesh>(null);
  const tint = useMemo(() => new THREE.Color(color), [color]);
  useRenderer(registry, ({ run, radius, alpha, forward }) => {
    const mesh = batch.current;
    if (!mesh) return;
    let count = 0;
    for (const hit of run.texts) {
      const age = Math.max(0, hit.age - (1 - alpha) / SIM_HZ);
      if ((!hit.bladeFrom && !hit.shardTangent) || age >= LIFE) continue;
      if (count + 3 > mesh.instanceMatrix.count) break;
      toVector(normal, hit.n);
      if (hit.shardTangent) toVector(incoming, hit.shardTangent);
      else incoming.copy(normal).sub(hit.bladeFrom!);
      incoming.projectOnPlane(normal);
      if (incoming.lengthSq() < 1e-9)
        toVector(incoming, forward).projectOnPlane(normal);
      incoming.normalize();
      side.crossVectors(normal, incoming);
      const t = age / LIFE;
      for (let lane = -1; lane <= 1; lane++) {
        direction
          .copy(incoming)
          .addScaledVector(side, lane * 0.82)
          .addScaledVector(normal, 0.52 + 0.2 * lane)
          .normalize();
        spark.position
          .copy(normal)
          .multiplyScalar(radius + 0.12)
          .addScaledVector(direction, 0.035 + 0.21 * t);
        spark.quaternion.setFromUnitVectors(up, direction);
        const size = (1 - t) * (hit.crit ? 1.35 : 1);
        spark.scale.set(
          0.009 * size,
          (lane === 0 ? 0.092 : 0.058) * size,
          0.009 * size
        );
        spark.updateMatrix();
        mesh.setMatrixAt(count, spark.matrix);
        mesh.setColorAt(count++, lane === 0 || hit.shardTangent ? white : tint);
      }
    }
    mesh.count = count;
    if (count) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });
  return (
    <instancedMesh
      ref={batch}
      args={[undefined, undefined, 96]}
      count={0}
      frustumCulled={false}
    >
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
