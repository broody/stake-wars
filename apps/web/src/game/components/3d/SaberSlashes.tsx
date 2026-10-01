import { useLayoutEffect, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { colors } from '../../../ui/tokens';
import {
  createSaberSlashGeometry,
  saberEnergyColor,
} from '../../utils/saberAnimation';
import {
  surfaceRotation,
  toVector,
  useRenderer,
  type Renderer,
} from '../../survivors/renderFrame';
import { saberArc } from '../../survivors/saberAttack';
import { SIM_HZ } from '../../survivors/sim';
import { SABER_MODEL } from './SurvivorTrooper';

/** Impact snapshots stay on the ground where damage occurred, even while sprinting. */
export function SaberSlashes({ registry }: { registry: Set<Renderer> }) {
  const { scene } = useGLTF(SABER_MODEL);
  const root = useRef<THREE.Group>(null);
  const slots = useRef<{ group: THREE.Group; meshes: THREE.Mesh[] }[]>([]);
  const shapes = useRef(new Map<number, THREE.BufferGeometry[]>());
  const scratch = useRef({
    up: new THREE.Vector3(),
    forward: new THREE.Vector3(),
  });
  useLayoutEffect(() => {
    const geometries = new Map(
      [saberArc(1), saberArc(3), saberArc(4), Math.PI].map((arc) => [
        arc,
        [0, 0.76, 0.965].map((inner) =>
          createSaberSlashGeometry(inner, arc, arc === Math.PI ? 1 : 0.8)
        ),
      ])
    );
    shapes.current = geometries;
    const color = saberEnergyColor(scene);
    const list = Array.from({ length: 6 }, () => {
      const group = new THREE.Group();
      const meshes = geometries.get(saberArc(1))!.map((geometry, i) => {
        const material = new THREE.MeshBasicMaterial({
          color: i === 2 ? colors.fg.DEFAULT : color,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = 0.1 + i * 0.001;
        mesh.raycast = () => undefined;
        group.add(mesh);
        return mesh;
      });
      group.visible = false;
      root.current?.add(group);
      return { group, meshes };
    });
    slots.current = list;
    return () => {
      for (const { group, meshes } of list) {
        group.removeFromParent();
        for (const m of meshes) (m.material as THREE.Material).dispose();
      }
      for (const group of geometries.values())
        for (const g of group) g.dispose();
      shapes.current.clear();
      slots.current = [];
    };
  }, [scene]);
  useRenderer(registry, ({ run, radius, alpha }) => {
    let index = 0;
    const { up, forward } = scratch.current;
    for (const effect of run.effects) {
      if (
        (effect.kind !== 'sweep' && effect.kind !== 'eclipse') ||
        index >= slots.current.length
      )
        continue;
      const { group, meshes } = slots.current[index++];
      group.visible = true;
      group.position.copy(toVector(up, effect.n)).multiplyScalar(radius + 0.02);
      surfaceRotation(group.quaternion, up, toVector(forward, effect.dir));
      const fade = Math.max(
        0,
        1 - Math.max(0, effect.age - (1 - alpha) / SIM_HZ) / effect.life
      );
      for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        mesh.geometry = shapes.current.get(
          effect.kind === 'sweep' ? effect.arc : Math.PI
        )![i];
        // Eclipse uses two mirrored half-discs in adjacent slots below.
        const reach = effect.kind === 'sweep' ? effect.reach : effect.radius;
        const width =
          effect.kind === 'sweep' ? effect.width / 2 : effect.radius;
        mesh.scale.set(
          effect.kind === 'sweep' ? -effect.side * reach : reach,
          1,
          width
        );
        (mesh.material as THREE.MeshBasicMaterial).opacity =
          [0.12, 0.72, 0.95][i] * fade * fade;
      }
      if (effect.kind === 'eclipse' && index < slots.current.length) {
        const mirror = slots.current[index++];
        mirror.group.visible = true;
        mirror.group.position.copy(group.position);
        mirror.group.quaternion.copy(group.quaternion);
        mirror.meshes.forEach((m, i) => {
          m.geometry = meshes[i].geometry;
          m.scale.copy(meshes[i].scale);
          m.scale.x *= -1;
          (m.material as THREE.MeshBasicMaterial).opacity = (
            meshes[i].material as THREE.MeshBasicMaterial
          ).opacity;
        });
      }
    }
    for (; index < slots.current.length; index++)
      slots.current[index].group.visible = false;
  });
  return <group ref={root} dispose={null} />;
}
