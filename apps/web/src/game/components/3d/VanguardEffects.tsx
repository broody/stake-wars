/**
 * The Vanguard's own effects: Crescent Wave cuts in flight, Rebuke
 * shockwaves, and the Aegis shield around the player.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { colors } from '../../../ui/tokens';
import { lerpNormal, vec3 } from '../../survivors/sphere';
import { bladeArcMaterial } from '../../survivors/bladeArcMaterial';
import { createSaberSlashGeometry } from '../../utils/saberAnimation';
import { SIM_HZ } from '../../survivors/sim';
import { AegisField } from './AegisField';
import {
  surfaceRotation,
  toVector,
  useRenderer,
  type Renderer,
} from '../../survivors/renderFrame';

const AMBER = new THREE.Color(colors.accent.soft);
const IVORY = new THREE.Color(colors.fg.DEFAULT);
const GOLD = new THREE.Color(colors.gold.DEFAULT);

const GROUND_UP = new THREE.Vector3(0, 1, 0);
/** Half the angle a crescent's arc spans. */
const CRESCENT_HALF_ARC = (50 * Math.PI) / 180;
const s = {
  n: vec3(),
  up: new THREE.Vector3(),
  ahead: new THREE.Vector3(),
  position: new THREE.Vector3(),
  rotation: new THREE.Quaternion(),
  scale: new THREE.Vector3(),
  matrix: new THREE.Matrix4(),
  color: new THREE.Color(),
};

/** Broken pressure ridges. Each crest peaks at its centre and feathers into the ground. */
function createRebukeGeometry() {
  const positions: number[] = [],
    shades: number[] = [],
    indices: number[] = [];
  const ridges = 8,
    steps = 8;
  for (let ridge = 0; ridge < ridges; ridge++) {
    const first = positions.length / 3;
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const a = ((ridge + 0.08 + t * 0.84) * 2 * Math.PI) / ridges;
      const peak = 1 - Math.abs(2 * t - 1);
      const rim = 0.9 + 0.1 * peak;
      const contrast = 0.24 + 0.76 * peak;
      for (const [r, y, light] of [
        [rim - 0.025 - 0.12 * peak, 0, 0],
        [rim - 0.014, 0.018 * peak, contrast],
        [rim, 0, 0.4 * contrast],
      ]) {
        positions.push(r * Math.cos(a), 1 - r * r + y, r * Math.sin(a));
        shades.push(light, light, light);
      }
      if (j === steps) continue;
      const k = first + 3 * j;
      indices.push(
        k,
        k + 1,
        k + 3,
        k + 3,
        k + 1,
        k + 4,
        k + 1,
        k + 2,
        k + 4,
        k + 4,
        k + 2,
        k + 5
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
  geometry.setIndex(indices);
  return geometry;
}

export function VanguardEffects({ registry }: { registry: Set<Renderer> }) {
  const crescents = useRef<THREE.InstancedMesh>(null);
  const rings = useRef<THREE.InstancedMesh>(null);
  // A band of arc lying on the ground, its apex at the origin and bowing
  // toward +Z (the direction of travel); scaled so its chord is the width.
  const crescentGeometry = useMemo(() => {
    const geometry = createSaberSlashGeometry(0.48, 2 * CRESCENT_HALF_ARC);
    geometry.rotateY(-Math.PI / 2);
    geometry.translate(0, 0, -1);
    return geometry;
  }, []);
  const waveMaterial = useMemo(() => bladeArcMaterial(AMBER, true), []);
  const ringGeometry = useMemo(createRebukeGeometry, []);
  useLayoutEffect(() => {
    for (const mesh of [crescents.current, rings.current]) {
      if (!mesh) continue;
      // Instance colours must exist before the first draw compiles the shader.
      for (let i = 0; i < mesh.instanceMatrix.count; i++)
        mesh.setColorAt(i, IVORY);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.raycast = () => undefined;
    }
  }, []);

  useEffect(
    () => () => {
      crescentGeometry.dispose();
      waveMaterial.dispose();
      ringGeometry.dispose();
    },
    [crescentGeometry, waveMaterial, ringGeometry]
  );

  useRenderer(registry, ({ run, alpha, radius }) => {
    const time = run.time - (1 - alpha) / SIM_HZ;

    const arcs = crescents.current;
    if (arcs) {
      waveMaterial.uniforms.clock.value = time;
      let count = 0;
      for (const crescent of run.crescents) {
        if (count >= arcs.instanceMatrix.count) break;
        lerpNormal(s.n, crescent.prev, crescent.n, alpha);
        toVector(s.up, s.n);
        surfaceRotation(s.rotation, s.up, toVector(s.ahead, crescent.dir));
        s.position.copy(s.up).multiplyScalar(radius + 0.15);
        s.scale.setScalar(crescent.width / (2 * Math.sin(CRESCENT_HALF_ARC)));
        arcs.setMatrixAt(
          count,
          s.matrix.compose(s.position, s.rotation, s.scale)
        );
        const fade = Math.min(1, (crescent.life / crescent.span) * 4);
        s.color.copy(crescent.evolved ? GOLD : AMBER).multiplyScalar(fade);
        arcs.setColorAt(count++, s.color);
      }
      arcs.count = count;
      arcs.instanceMatrix.needsUpdate = true;
      if (arcs.instanceColor) arcs.instanceColor.needsUpdate = true;
    }

    const waves = rings.current;
    if (waves) {
      let count = 0;
      for (const effect of run.effects) {
        if (effect.kind !== 'rebuke' || count >= waves.instanceMatrix.count)
          continue;
        const age = Math.max(0, effect.age - (1 - alpha) / SIM_HZ);
        const k = Math.min(1, age / effect.life);
        const grow = THREE.MathUtils.smoothstep(k, 0, 0.85);
        toVector(s.up, effect.n);
        s.rotation.setFromUnitVectors(GROUND_UP, s.up);
        const reach = effect.radius * (0.22 + 0.78 * grow);
        // Put the leading edge on the curved surface at the knockback radius.
        const drop = (reach * reach) / (2 * radius);
        s.position.copy(s.up).multiplyScalar(radius - drop + 0.023);
        const tangent = reach * Math.sqrt(1 - drop / (2 * radius));
        s.scale.set(tangent, drop, tangent);
        waves.setMatrixAt(
          count,
          s.matrix.compose(s.position, s.rotation, s.scale)
        );
        s.color
          .copy(effect.evolved ? GOLD : IVORY)
          .multiplyScalar(1 - THREE.MathUtils.smoothstep(k, 0.3, 1));
        waves.setColorAt(count++, s.color);
      }
      waves.count = count;
      waves.instanceMatrix.needsUpdate = true;
      if (waves.instanceColor) waves.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh
        ref={crescents}
        args={[crescentGeometry, waveMaterial, 64]}
        frustumCulled={false}
      />
      <instancedMesh ref={rings} args={[ringGeometry, undefined, 8]}>
        <meshBasicMaterial
          vertexColors
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
      <AegisField registry={registry} />
    </>
  );
}
