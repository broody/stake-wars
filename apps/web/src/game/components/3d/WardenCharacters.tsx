import { useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { enemyDeathOpacity } from '../../utils/enemyOpacity';
import {
  createWardenWarningGeometry,
  WARDEN_MARK_LIFT,
  WardenAnimation,
} from '../../utils/wardenAnimation';
import { WARDEN_SLAM } from '../../survivors/wardenAttack';
import { colors } from '../../../ui/tokens';
import { chord, lerpNormal, vec3, type Vec3 } from '../../survivors/sphere';
import { SIM_HZ } from '../../survivors/sim';
import { emergeLift } from '../../survivors/breach';
import {
  surfaceRotation,
  toVector,
  useRenderer,
  type Renderer,
} from '../../survivors/renderFrame';

export function WardenCharacters({ registry }: { registry: Set<Renderer> }) {
  const { scene, animations } = useGLTF('/models/hollow-legion/warden.glb');
  const group = useRef<THREE.Group>(null);
  const actors = useRef(new Map<number, WardenAnimation>());
  const lastFrame = useRef<number | undefined>(undefined);
  const scratch = useRef({
    normal: vec3(),
    up: new THREE.Vector3(),
    facing: new THREE.Vector3(),
    target: new THREE.Quaternion(),
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
    const keep = new Set<number>();
    const { normal, up, facing, target } = scratch.current;
    const time = Math.max(0, run.time - (1 - alpha) / SIM_HZ);
    const dt =
      lastFrame.current === undefined || time < lastFrame.current
        ? Infinity
        : time - lastFrame.current;
    lastFrame.current = time;
    const get = (
      id: number,
      n: Vec3,
      heading: Vec3,
      scale: number,
      lift = 0,
      locked = false
    ) => {
      keep.add(id);
      let actor = actors.current.get(id);
      const first = !actor;
      if (!actor) {
        actor = new WardenAnimation(scene, animations);
        actor.root.name = `Warden ${id}`;
        actors.current.set(id, actor);
        container.add(actor.root);
      }
      actor.root.position.copy(toVector(up, n)).multiplyScalar(radius + lift);
      surfaceRotation(target, up, toVector(facing, heading));
      if (first || locked) actor.root.quaternion.copy(target);
      else actor.root.quaternion.rotateTowards(target, 7 * dt);
      actor.root.scale.setScalar(scale);
      return actor;
    };
    for (const enemy of run.enemies) {
      if (enemy.spec.model !== 'warden' || enemy.dead) continue;
      const lift = emergeLift(
        enemy.emerge,
        alpha,
        1 / SIM_HZ,
        enemy.spec.scale
      );
      lerpNormal(normal, enemy.prev, enemy.n, alpha);
      const slam = enemy.slam;
      const actor = get(
        enemy.id,
        normal,
        enemy.heading,
        enemy.spec.scale,
        lift ?? 0,
        !!slam
      );
      // Still under its flipping Sector.
      actor.root.visible = lift !== null;
      actor.update({
        time,
        opacity: enemyDeathOpacity(run, enemy.n, enemy.spec.radius),
        scale: enemy.spec.scale,
        speed: chord(enemy.prev, enemy.n) * radius * SIM_HZ,
        slamElapsed: slam
          ? slam.previousElapsed + (slam.elapsed - slam.previousElapsed) * alpha
          : undefined,
        flash: enemy.flash > 0,
      });
    }
    for (const body of run.defeatedEnemies) {
      if (body.spec.model !== 'warden') continue;
      get(body.id, body.n, body.heading, body.spec.scale, 0, true).update({
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

/** Draw every committed slam directly from the boss, including its impact frame. */
export function WardenSlamMarkers({
  registry,
  groundRadius,
}: {
  registry: Set<Renderer>;
  groundRadius: number;
}) {
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(
    () => createWardenWarningGeometry(groundRadius),
    [groundRadius]
  );
  const marks = useRef<
    THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[]
  >([]);
  const scratch = useMemo(
    () => ({
      normal: new THREE.Vector3(),
      facing: new THREE.Vector3(),
      danger: new THREE.Color(colors.danger.DEFAULT),
      flash: new THREE.Color(colors.fg.DEFAULT),
    }),
    []
  );
  useLayoutEffect(() => {
    const pool = marks.current;
    return () => {
      for (const mark of pool) {
        mark.material.dispose();
        mark.removeFromParent();
      }
      pool.length = 0;
      geometry.dispose();
    };
  }, [geometry]);
  useRenderer(registry, ({ run, alpha }) => {
    if (!group.current) return;
    let count = 0;
    for (const boss of run.bosses) {
      const slam = boss.slam;
      if (!slam || boss.dead || (run.status === 'fallen' && !slam.impacted))
        continue;
      const elapsed =
        slam.previousElapsed +
        (slam.elapsed - slam.previousElapsed) * alpha +
        run.deathAge;
      const sinceImpact = elapsed - WARDEN_SLAM.impact;
      if (sinceImpact >= 0.24) continue;
      let mark = marks.current[count++];
      if (!mark) {
        mark = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
          })
        );
        mark.raycast = () => undefined;
        group.current.add(mark);
        marks.current.push(mark);
      }
      mark.visible = true;
      const normal = toVector(scratch.normal, slam.origin);
      mark.position
        .copy(normal)
        .multiplyScalar(groundRadius + WARDEN_MARK_LIFT);
      surfaceRotation(
        mark.quaternion,
        normal,
        toVector(scratch.facing, slam.direction)
      );
      const flash = sinceImpact >= 0 ? 1 - sinceImpact / 0.24 : 0;
      mark.material.color
        .copy(scratch.danger)
        .lerp(scratch.flash, 0.65 * flash);
      mark.material.opacity =
        sinceImpact >= 0
          ? flash
          : 0.56 + 0.44 * (elapsed / WARDEN_SLAM.impact) ** 2;
    }
    for (let i = count; i < marks.current.length; i++)
      marks.current[i].visible = false;
  });
  return <group ref={group} dispose={null} />;
}
