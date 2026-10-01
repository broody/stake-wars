import { useLayoutEffect, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SaberAnimation } from '../../utils/saberAnimation';
import { SABER } from '../../survivors/saberAttack';
import { chord } from '../../survivors/sphere';
import { SIM_HZ } from '../../survivors/sim';
import {
  surfaceRotation,
  toVector,
  useRenderer,
  type Renderer,
} from '../../survivors/renderFrame';

export const SABER_MODEL = '/models/sector-trooper/sector-trooper-saber.glb';
export const BOLT_CASTER_MODEL =
  '/models/sector-trooper/sector-trooper-bolt-caster.glb';
export function SurvivorTrooper({ registry }: { registry: Set<Renderer> }) {
  const { scene, animations } = useGLTF(SABER_MODEL);
  const { scene: gun } = useGLTF(BOLT_CASTER_MODEL);
  const container = useRef<THREE.Group>(null);
  const actor = useRef<SaberAnimation | undefined>(undefined);
  const scratch = useRef({
    up: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    aim: new THREE.Vector3(),
    localX: new THREE.Vector3(),
  });
  useLayoutEffect(() => {
    const a = new SaberAnimation(scene, animations, gun);
    actor.current = a;
    a.root.scale.setScalar(SABER.scale);
    a.root.position.y = -SABER.sole * SABER.scale;
    container.current?.add(a.root);
    return () => {
      a.dispose();
      actor.current = undefined;
    };
  }, [scene, animations, gun]);
  useRenderer(registry, ({ run, radius, normal, alpha }) => {
    const group = container.current,
      a = actor.current;
    if (!group || !a) return;
    const { up, forward, aim, localX } = scratch.current;
    group.position.copy(toVector(up, normal)).multiplyScalar(radius);
    surfaceRotation(
      group.quaternion,
      up,
      toVector(forward, run.player.heading)
    );
    if (run.status === 'fallen') {
      a.updateDeath(run.deathAge);
      group.visible = true;
      return;
    }
    const time = Math.max(0, run.time - (1 - alpha) / SIM_HZ);
    const attack = run.player.saberAttack;
    let aimYaw = 0;
    if (attack) {
      toVector(aim, attack.forward).projectOnPlane(up).normalize();
      forward.projectOnPlane(up).normalize();
      localX.crossVectors(up, forward);
      aimYaw = Math.atan2(aim.dot(localX), aim.dot(forward));
    }
    const shot = run.player.boltShot;
    forward.projectOnPlane(up).normalize();
    localX.crossVectors(up, forward);
    toVector(aim, shot?.forward ?? run.player.heading)
      .projectOnPlane(up)
      .normalize();
    const gunYaw = Math.atan2(aim.dot(localX), aim.dot(forward));
    a.update(
      time,
      chord(run.player.prev, run.player.n) * radius * SIM_HZ,
      attack,
      aimYaw,
      {
        equipped: run.weapons.some((w) => w.id === 'bolts'),
        yaw: gunYaw,
        shotAge: shot ? time - shot.firedAt : -1,
      }
    );
    group.visible = !(
      run.player.invulnerable > 0 &&
      Math.floor(run.player.invulnerable * 20) % 2 === 0
    );
  });
  return <group ref={container} dispose={null} />;
}
useGLTF.preload(SABER_MODEL);

useGLTF.preload(BOLT_CASTER_MODEL);
