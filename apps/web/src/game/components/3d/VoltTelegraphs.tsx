import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { colors } from '../../../ui/tokens';
import {
  voltWarningCount,
  voltWarningSteps,
  VOLT_WARNING_SPACING,
  VOLT_WARNING_STEPS,
} from '../../survivors/voltAttack';
import { copy, stepAlong, vec3 } from '../../survivors/sphere';
import { createAimChevronGeometry } from '../../utils/aimChevron';
import {
  surfaceRotation,
  toVector,
  useRenderer,
  type Renderer,
} from '../../survivors/renderFrame';

/** Carets fill the locked lunge path while the Volt Mite coils. */
export function VoltTelegraphs({ registry }: { registry: Set<Renderer> }) {
  const arrows = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const arrow = createAimChevronGeometry();
    // Anchor each instance at its tip, so the last tip marks the exact landing.
    arrow.translate(0, 0, -0.04);
    return arrow;
  }, []);
  const scratch = useMemo(
    () => ({
      normal: vec3(),
      direction: vec3(),
      up: new THREE.Vector3(),
      ahead: new THREE.Vector3(),
      position: new THREE.Vector3(),
      scale: new THREE.Vector3(1, 1, 1),
      rotation: new THREE.Quaternion(),
      matrix: new THREE.Matrix4(),
    }),
    []
  );
  useEffect(() => {
    arrows.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (arrows.current) {
      arrows.current.count = 0;
      arrows.current.raycast = () => undefined;
    }
    return () => geometry.dispose();
  }, [geometry]);
  useRenderer(registry, ({ run, alpha, radius }) => {
    const mesh = arrows.current;
    if (!mesh) return;
    let count = 0;
    for (const enemy of run.enemies) {
      const leap = enemy.leap;
      if (
        !leap ||
        enemy.dead ||
        enemy.emerge > 0 ||
        count >= mesh.instanceMatrix.count
      )
        continue;
      const elapsed =
        leap.previousElapsed + (leap.elapsed - leap.previousElapsed) * alpha;
      const steps = voltWarningCount(elapsed, leap.distance);
      if (!steps || leap.distance <= 0) continue;
      // Work backward from the landing point, preserving the usual spacing.
      const firstTip =
        leap.distance -
        (voltWarningSteps(leap.distance) - 1) * VOLT_WARNING_SPACING;
      copy(scratch.normal, leap.origin);
      copy(scratch.direction, leap.direction);
      for (let i = 0; i < steps && count < mesh.instanceMatrix.count; i++) {
        stepAlong(
          scratch.normal,
          scratch.direction,
          (i === 0 ? firstTip : VOLT_WARNING_SPACING) / run.groundRadius
        );
        toVector(scratch.up, scratch.normal);
        toVector(scratch.ahead, scratch.direction);
        surfaceRotation(scratch.rotation, scratch.up, scratch.ahead);
        scratch.position.copy(scratch.up).multiplyScalar(radius + 0.012);
        scratch.matrix.compose(
          scratch.position,
          scratch.rotation,
          scratch.scale
        );
        mesh.setMatrixAt(count++, scratch.matrix);
      }
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={arrows}
      args={[geometry, undefined, 700 * VOLT_WARNING_STEPS]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        color={colors.danger.DEFAULT}
        transparent
        opacity={0.85}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
