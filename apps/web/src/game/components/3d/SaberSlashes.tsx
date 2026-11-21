import { useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { bladeArcMaterial } from '../../survivors/bladeArcMaterial';
import { BladeContacts } from './BladeContacts';
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

/** The trooper's slashes take the cyan of its saber's energy blade. */
export function TrooperSaberSlashes({ registry }: { registry: Set<Renderer> }) {
  const { scene } = useGLTF(SABER_MODEL);
  const color = useMemo(() => saberEnergyColor(scene), [scene]);
  return <SaberSlashes registry={registry} color={color} />;
}

/**
 * Impact snapshots stay on the ground where damage occurred, even while
 * sprinting. `color` fills the cut; its outer edge is always white.
 */
export function SaberSlashes({
  registry,
  color,
}: {
  registry: Set<Renderer>;
  color: THREE.ColorRepresentation;
}) {
  const root = useRef<THREE.Group>(null);
  const slots = useRef<
    THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[]
  >([]);
  const shapes = useMemo(() => {
    const sweeps = new Map(
      [1, 2, 3, 4, 5].map((level) => {
        const arc = saberArc(level);
        return [arc, createSaberSlashGeometry(0.18, arc, 0.8)] as const;
      })
    );
    return { sweeps, eclipse: createSaberSlashGeometry(0.18, 2 * Math.PI) };
  }, []);
  const scratch = useMemo(
    () => ({ up: new THREE.Vector3(), forward: new THREE.Vector3() }),
    []
  );
  useLayoutEffect(() => {
    const pool = Array.from({ length: 6 }, () => {
      const mesh = new THREE.Mesh(shapes.eclipse, bladeArcMaterial(color));
      mesh.visible = false;
      mesh.raycast = () => undefined;
      root.current?.add(mesh);
      return mesh;
    });
    slots.current = pool;
    return () => {
      for (const mesh of pool) {
        mesh.removeFromParent();
        mesh.material.dispose();
      }
      slots.current = [];
    };
  }, [color, shapes]);
  useLayoutEffect(
    () => () => {
      shapes.eclipse.dispose();
      for (const sweep of shapes.sweeps.values()) sweep.dispose();
    },
    [shapes]
  );

  useRenderer(registry, ({ run, radius, alpha }) => {
    let count = 0;
    const { up, forward } = scratch;
    for (const effect of run.effects) {
      if (effect.kind !== 'sweep' && effect.kind !== 'eclipse') continue;
      if (count === slots.current.length) break;
      const mesh = slots.current[count++];
      mesh.visible = true;
      mesh.position.copy(toVector(up, effect.n)).multiplyScalar(radius + 0.15);
      surfaceRotation(mesh.quaternion, up, toVector(forward, effect.dir));
      if (effect.kind === 'sweep') {
        mesh.geometry = shapes.sweeps.get(effect.arc)!;
        mesh.scale.set(-effect.side * effect.reach, 1, effect.width / 2);
      } else {
        mesh.geometry = shapes.eclipse;
        mesh.scale.set(effect.radius, 1, effect.radius);
      }
      mesh.material.uniforms.eclipse.value = effect.kind === 'eclipse';
      mesh.material.uniforms.progress.value = THREE.MathUtils.clamp(
        (effect.age - (1 - alpha) / SIM_HZ) / effect.life,
        0,
        1
      );
    }
    for (; count < slots.current.length; count++)
      slots.current[count].visible = false;
  });
  return (
    <>
      <group ref={root} dispose={null} />
      <BladeContacts registry={registry} color={color} />
    </>
  );
}
