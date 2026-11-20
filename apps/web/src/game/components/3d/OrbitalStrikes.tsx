import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { colors } from '../../../ui/tokens';
import { CHAIN_TRAVEL, SIM_HZ } from '../../survivors/sim';
import {
  toVector,
  useRenderer,
  type Renderer,
} from '../../survivors/renderFrame';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';

const ivory = new THREE.Color(SECTOR_COLORS.opponent);
const white = new THREE.Color(colors.fg.DEFAULT);
const tint = new THREE.Color();
const up = new THREE.Vector3(0, 1, 0);
const normal = new THREE.Vector3(),
  tangent = new THREE.Vector3();
const a = new THREE.Vector3(),
  b = new THREE.Vector3();
const start = new THREE.Vector3(),
  end = new THREE.Vector3();
const axis = new THREE.Vector3();
const part = new THREE.Object3D();

/** Stretch a unit-height prism between two world points. */
function span(mesh: THREE.InstancedMesh, width: number, color: THREE.Color) {
  if (mesh.count >= mesh.instanceMatrix.count) return;
  axis.subVectors(end, start);
  const length = axis.length();
  if (length < 0.00001) return;
  part.position.copy(start).lerp(end, 0.5);
  part.quaternion.setFromUnitVectors(up, axis.multiplyScalar(1 / length));
  part.scale.set(width, length, width);
  part.updateMatrix();
  mesh.setMatrixAt(mesh.count, part.matrix);
  mesh.setColorAt(mesh.count++, color);
}

/** A shallow arc just above the surface, from the last hit to the next. */
function linkPoint(out: THREE.Vector3, t: number, radius: number) {
  return out
    .lerpVectors(a, b, t)
    .normalize()
    .multiplyScalar(radius + 0.12 + 0.12 * Math.sin(t * Math.PI));
}

export function OrbitalStrikes({ registry }: { registry: Set<Renderer> }) {
  const needles = useRef<THREE.InstancedMesh>(null);
  const trails = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    for (const batch of [needles.current!, trails.current!]) {
      batch.setColorAt(0, ivory);
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
  }, []);
  useRenderer(registry, ({ run, radius, alpha, forward }) => {
    const points = needles.current!,
      lines = trails.current!;
    points.count = lines.count = 0;
    for (const effect of run.effects) {
      if (effect.kind !== 'strike' && effect.kind !== 'chain') continue;
      const age = Math.max(0, effect.age - (1 - alpha) / SIM_HZ);
      if (effect.kind === 'strike') {
        const k = age / effect.life;
        toVector(normal, effect.n);
        if (!effect.linked) {
          // A single ivory column pinches off at the contact point.
          start.copy(normal).multiplyScalar(radius + 0.035);
          end.copy(start).addScaledVector(normal, 1.85 * (1 - k) ** 1.5);
          span(points, 0.029 * (1 - k), white);
        }
        tangent.copy(forward).projectOnPlane(normal).normalize();
        for (let i = 0; i < 3; i++) {
          tangent.applyAxisAngle(normal, (2 * Math.PI) / 3);
          const spread = effect.radius * (0.12 + 0.86 * k);
          start
            .copy(normal)
            .multiplyScalar(radius + 0.036 + 0.075 * Math.sin(Math.PI * k))
            .addScaledVector(tangent, spread);
          end
            .copy(start)
            .addScaledVector(tangent, 0.1 * (1 - k))
            .addScaledVector(normal, 0.12 * (1 - k));
          span(points, 0.017 * (1 - k), ivory);
        }
      } else {
        toVector(a, effect.a);
        toVector(b, effect.b);
        const head = Math.min(1, age / CHAIN_TRAVEL);
        const tail = Math.min(head, Math.max(0, (age - 0.085) / CHAIN_TRAVEL));
        linkPoint(start, tail, radius);
        for (let i = 1; i <= 5; i++) {
          const t = tail + ((head - tail) * i) / 5;
          linkPoint(end, t, radius);
          const light = i / 5;
          span(
            lines,
            0.003 + 0.012 * light,
            tint.copy(ivory).multiplyScalar(light * light)
          );
          start.copy(end);
        }
        if (head < 1) {
          linkPoint(start, Math.max(0, head - 0.12), radius);
          linkPoint(end, head, radius);
          span(points, 0.023, white);
        }
      }
    }
    for (const batch of [points, lines]) {
      if (!batch.count) continue;
      batch.instanceMatrix.needsUpdate = true;
      batch.instanceColor!.needsUpdate = true;
    }
  });
  return (
    <>
      <instancedMesh
        ref={needles}
        args={[undefined, undefined, 192]}
        count={0}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.05, 1, 1, 4]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={trails}
        args={[undefined, undefined, 200]}
        count={0}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, 4]} />
        <meshBasicMaterial
          toneMapped={false}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
    </>
  );
}
