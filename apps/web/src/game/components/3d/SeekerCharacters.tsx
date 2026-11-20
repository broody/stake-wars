import { useLayoutEffect, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { enemyDeathOpacity } from '../../utils/enemyOpacity';
import { SeekerAnimation } from '../../utils/seekerAnimation';
import { lerpNormal, vec3, type Vec3 } from '../../survivors/sphere';
import { seekerAttackPose } from '../../survivors/seekerAttack';
import type { Run } from '../../survivors/sim';
import { SIM_HZ } from '../../survivors/sim';
import { emergeLift } from '../../survivors/breach';
import {
  surfaceRotation,
  toVector,
  useRenderer,
  type Renderer,
} from '../../survivors/renderFrame';

export function SeekerCharacters({ registry }: { registry: Set<Renderer> }) {
  const { scene, animations } = useGLTF('/models/hollow-legion/seeker.glb');
  const previousRun = useRef<Run | null>(null);
  const lastTime = useRef(0);
  const group = useRef<THREE.Group>(null);
  const actors = useRef(new Map<number, SeekerAnimation>());
  const scratch = useRef({
    normal: vec3(),
    up: new THREE.Vector3(),
    facing: new THREE.Vector3(),
    previousFacing: new THREE.Vector3(),
    axis: new THREE.Vector3(),
  });
  useLayoutEffect(() => {
    const map = actors.current;
    return () => {
      for (const actor of map.values()) actor.dispose();
      map.clear();
    };
  }, [scene, animations]);

  useRenderer(registry, ({ run, alpha, radius }) => {
    const container = group.current;
    if (!container) return;
    if (previousRun.current !== run) {
      for (const actor of actors.current.values()) actor.dispose();
      actors.current.clear();
      previousRun.current = run;
    }
    const keep = new Set<number>();
    const { normal, up, facing, previousFacing, axis } = scratch.current;
    const time = Math.max(0, run.time - (1 - alpha) / SIM_HZ);
    const maxTurn = 9 * Math.max(0, time - lastTime.current);
    lastTime.current = time;
    const get = (
      id: number,
      n: Vec3,
      heading: Vec3,
      scale: number,
      lift = 0,
      steer = false
    ) => {
      keep.add(id);
      let actor = actors.current.get(id);
      if (!actor) {
        actor = new SeekerAnimation(
          scene,
          animations,
          (id * 0.61803398875) % 1
        );
        actor.root.name = `Seeker ${id}`;
        actors.current.set(id, actor);
        container.add(actor.root);
        steer = false;
      }
      actor.root.position.copy(toVector(up, n)).multiplyScalar(radius + lift);
      toVector(facing, heading);
      if (steer) {
        // Turn about the local ground normal so all four paws stay on the Core.
        previousFacing.set(0, 0, 1).applyQuaternion(actor.root.quaternion);
        previousFacing.projectOnPlane(up).normalize();
        const yaw = Math.atan2(
          axis.crossVectors(previousFacing, facing).dot(up),
          previousFacing.dot(facing)
        );
        facing
          .copy(previousFacing)
          .applyAxisAngle(up, THREE.MathUtils.clamp(yaw, -maxTurn, maxTurn));
      }
      surfaceRotation(actor.root.quaternion, up, facing);
      actor.root.scale.setScalar(scale);
      return actor;
    };
    for (const enemy of run.enemies) {
      if (enemy.spec.model !== 'seeker' || enemy.dead) continue;
      const lift = emergeLift(
        enemy.emerge,
        alpha,
        1 / SIM_HZ,
        enemy.spec.scale
      );
      lerpNormal(normal, enemy.prev, enemy.n, alpha);
      const attack =
        enemy.emerge > 0
          ? undefined
          : seekerAttackPose(
              enemy.mode,
              enemy.modeTime + (1 - alpha) / SIM_HZ,
              enemy.straight
            );
      const actor = get(
        enemy.id,
        normal,
        attack ? enemy.aim : enemy.heading,
        enemy.spec.scale,
        lift ?? 0,
        enemy.emerge <= 0 && (!attack || attack.clip === 'ChargeWindup')
      );
      // Still under its flipping Sector.
      actor.root.visible = lift !== null;
      actor.update({
        time,
        opacity: enemyDeathOpacity(run, enemy.n, enemy.spec.radius),
        scale: enemy.spec.scale,
        speed: enemy.emerge > 0 ? 0 : (enemy.seekerPace ?? 0),
        attack,
        flash: enemy.flash > 0,
      });
    }
    for (const body of run.defeatedEnemies) {
      if (body.spec.model !== 'seeker') continue;
      get(body.id, body.n, body.heading, body.spec.scale).update({
        time,
        opacity: enemyDeathOpacity(run, body.n, body.spec.radius),
        scale: body.spec.scale,
        speed: 0,
        defeatAge: body.previousAge + (body.age - body.previousAge) * alpha,
      });
    }
    for (const [id, actor] of actors.current)
      if (!keep.has(id)) {
        actor.dispose();
        actors.current.delete(id);
      }
  });
  return <group ref={group} dispose={null} />;
}
