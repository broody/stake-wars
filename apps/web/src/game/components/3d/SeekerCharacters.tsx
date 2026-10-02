import { useLayoutEffect, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { enemyDeathOpacity } from '../../utils/enemyOpacity';
import { SeekerAnimation } from '../../utils/seekerAnimation';
import { chord, lerpNormal, vec3, type Vec3 } from '../../survivors/sphere';
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
  const group = useRef<THREE.Group>(null);
  const actors = useRef(new Map<number, SeekerAnimation>());
  const scratch = useRef({
    normal: vec3(),
    up: new THREE.Vector3(),
    facing: new THREE.Vector3(),
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
    const { normal, up, facing } = scratch.current;
    const get = (
      id: number,
      n: Vec3,
      heading: Vec3,
      scale: number,
      lift = 0
    ) => {
      keep.add(id);
      let actor = actors.current.get(id);
      if (!actor) {
        actor = new SeekerAnimation(scene, animations);
        actor.root.name = `Seeker ${id}`;
        actors.current.set(id, actor);
        container.add(actor.root);
      }
      actor.root.position.copy(toVector(up, n)).multiplyScalar(radius + lift);
      surfaceRotation(actor.root.quaternion, up, toVector(facing, heading));
      actor.root.scale.setScalar(scale);
      return actor;
    };
    const time = Math.max(0, run.time - (1 - alpha) / SIM_HZ);
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
        lift ?? 0
      );
      // Still under its flipping Sector.
      actor.root.visible = lift !== null;
      actor.update({
        time,
        opacity: enemyDeathOpacity(run, enemy.n, enemy.spec.radius),
        scale: enemy.spec.scale,
        speed:
          enemy.emerge > 0 ? 0 : chord(enemy.prev, enemy.n) * radius * SIM_HZ,
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
