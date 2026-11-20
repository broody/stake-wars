/**
 * Renderers for Core Survivors. Each registers with the root, which calls
 * them in order after advancing the run, so every actor draws from the same
 * interpolated moment.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from 'react';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createWardenWarningGeometry } from '../../utils/wardenAnimation';
import { createAimChevronGeometry } from '../../utils/aimChevron';
import {
  enemyDeathOpacity,
  setEnemyInstanceOpacity,
  setEnemyOpacity,
} from '../../utils/enemyOpacity';
import { bakeEnemyLocomotion } from '../../utils/enemyRunAtlas';
import { addRimLight } from '../../utils/rimLight';
import { PickupInstances } from '../../survivors/pickupInstances';
import { colors } from '../../../ui/tokens';
import {
  lerpNormal,
  copy,
  cross,
  pointAt,
  normalize,
  projectTangent,
  stepAlong,
  vec3,
  type Vec3,
} from '../../survivors/sphere';
import {
  VOLT_LEAP,
  voltLeapClipTime,
  sampleVoltLeap,
} from '../../survivors/voltAttack';
import {
  BOLT_LIFETIME,
  SIM_HZ,
  type DefeatedEnemy,
  type Enemy,
} from '../../survivors/sim';
import { emergeLift } from '../../survivors/breach';
import {
  ENEMY_DEFEAT,
  enemyDefeatOpacity,
  TOSS_SHAPE,
  tossFlight,
} from '../../survivors/enemyDefeat';
import {
  arcCount,
  arcGlow,
  DEATH_ARCS,
  traceArc,
} from '../../survivors/deathArcs';
import {
  BULWARK_ATTACK,
  bulwarkWarningBounds,
  sampleBulwarkAttack,
} from '../../survivors/bulwarkAttack';
import {
  ENEMY_TELEGRAPHS,
  surfaceRotation,
  telegraphed,
  toVector,
  useRenderer,
  type Renderer,
} from '../../survivors/renderFrame';

const WHITE = new THREE.Color(1, 1, 1);
const FLASH = new THREE.Color(5, 5, 5);
const VOLT = new THREE.Color(colors.danger.DEFAULT).multiplyScalar(1.6);
const CAPTAIN = new THREE.Color(colors.gold.soft).multiplyScalar(1.5);

const s = {
  n: vec3(),
  dir: vec3(),
  position: new THREE.Vector3(),
  up: new THREE.Vector3(),
  ahead: new THREE.Vector3(),
  right: new THREE.Vector3(),
  basis: new THREE.Matrix4(),
  rotation: new THREE.Quaternion(),
  scale: new THREE.Vector3(),
  color: new THREE.Color(),
  tumble: new THREE.Quaternion(),
  tilt: new THREE.Quaternion(),
  twist: new THREE.Quaternion(),
  axis: new THREE.Vector3(),
  pivot: new THREE.Vector3(),
};

/** A body's matrix, following its toss while airborne. */
function bodyMatrix(
  out: THREE.Matrix4,
  body: DefeatedEnemy,
  age: number,
  radius: number
) {
  const toss = body.toss;
  const shape = TOSS_SHAPE[body.spec.model];
  if (!toss || !shape)
    return surfaceMatrix(out, body.n, body.heading, radius, 0, body.spec.scale);
  // A Mite stays on its back, tilted, for the rest of its fade.
  const flight = tossFlight(age);
  if (flight.k < 1) lerpNormal(s.n, toss.from, toss.land, flight.travel);
  else lerpNormal(s.n, toss.land, body.n, flight.slide);
  toVector(s.up, s.n);
  toVector(s.position, body.heading);
  surfaceRotation(s.rotation, s.up, s.position);
  // Tumble end over end about the axis across the line of flight.
  toVector(s.axis, toss.land)
    .sub(toVector(s.pivot, toss.from))
    .cross(s.up)
    .normalize();
  s.tumble.setFromAxisAngle(s.axis, toss.spin * flight.k);
  // Skidding, it leans toward its own random side and slews about its up.
  toVector(s.axis, body.n)
    .sub(toVector(s.pivot, toss.land))
    .normalize()
    .applyAxisAngle(s.up, toss.lean);
  const tilt = toss.tilt * flight.slide;
  s.tilt.setFromAxisAngle(s.axis, tilt);
  s.twist.setFromAxisAngle(s.up, toss.twist * flight.slide);
  s.tumble.premultiply(s.tilt).premultiply(s.twist);
  s.rotation.premultiply(s.tumble);
  // Turn about the body's middle, and keep a rolled edge out of the ground.
  s.pivot.copy(s.up).multiplyScalar(shape.center * body.spec.scale);
  const rolled = Math.abs(Math.sin(tilt)) * shape.halfWidth * body.spec.scale;
  s.position
    .copy(s.up)
    .multiplyScalar(radius + toss.height * flight.lift + rolled)
    .add(s.pivot)
    .sub(s.pivot.applyQuaternion(s.tumble));
  s.scale.setScalar(body.spec.scale);
  return out.compose(s.position, s.rotation, s.scale);
}

/** Compose an instance matrix on the surface at `n`, `lift` above the ground. */
function surfaceMatrix(
  out: THREE.Matrix4,
  n: Vec3,
  ahead: Vec3,
  radius: number,
  lift: number,
  scale: number | THREE.Vector3
) {
  toVector(s.up, n);
  toVector(s.position, ahead);
  surfaceRotation(s.rotation, s.up, s.position);
  s.position.copy(s.up).multiplyScalar(radius + lift);
  if (typeof scale === 'number') s.scale.setScalar(scale);
  else s.scale.copy(scale);
  return out.compose(s.position, s.rotation, s.scale);
}

function useInstanced(
  ref: RefObject<THREE.InstancedMesh | null>,
  color = WHITE
) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < mesh.instanceMatrix.count; i++)
      mesh.setColorAt(i, color);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.raycast = () => undefined;
  }, [ref, color]);
}

function finish(mesh: THREE.InstancedMesh, count: number) {
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

// ---------- Authored Hollow Legion models ----------

const MODELS = {
  mite: {
    url: '/models/hollow-legion/mite.glb',
    clip: 'Run',
    travelSpeed: 1.008,
    capacity: 700,
  },
  lancer: {
    url: '/models/hollow-legion/lancer.glb',
    clip: 'Run',
    travelSpeed: 2.7,
    capacity: 160,
  },
  bulwark: {
    url: '/models/hollow-legion/bulwark.glb',
    clip: 'Walk',
    travelSpeed: 0.375,
    capacity: 450,
  },
} as const;

function tintFor(enemy: Enemy, time: number) {
  if (enemy.flash > 0) return FLASH;
  if (enemy.kind === 'volt') return VOLT;
  if (enemy.kind === 'captain') return CAPTAIN;
  if (enemy.mode === 'aim' && Math.floor(time * 12) % 2 === 0) return VOLT;
  return WHITE;
}

export function RiggedBatch({
  model,
  registry,
}: {
  model: keyof typeof MODELS;
  registry: Set<Renderer>;
}) {
  const config = MODELS[model];
  const { scene, animations } = useGLTF(config.url);
  const group = useRef<THREE.Group>(null);
  const runtime = useRef<{
    batches: THREE.InstancedMesh[];
    gait: THREE.InstancedBufferAttribute;
    attack: THREE.InstancedBufferAttribute;
    time: THREE.IUniform<number>;
  } | null>(null);

  useLayoutEffect(() => {
    const container = group.current;
    if (!container) return;
    const time = { value: 0 };
    const parts = bakeEnemyLocomotion(
      scene,
      animations,
      time,
      config.clip,
      model === 'bulwark'
        ? 'ShieldThrust'
        : model === 'mite'
          ? 'LeapAttack'
          : undefined
    );
    for (const part of parts) addRimLight(part.material);
    const gait = new THREE.InstancedBufferAttribute(
      new Float32Array(config.capacity * 2),
      2
    );
    gait.setUsage(THREE.DynamicDrawUsage);
    const attack = new THREE.InstancedBufferAttribute(
      new Float32Array(config.capacity * 3),
      3
    );
    attack.setUsage(THREE.DynamicDrawUsage);
    const batches = parts.map((part, index) => {
      part.geometry.setAttribute('enemyGait', gait);
      part.geometry.setAttribute('enemyAttack', attack);
      const batch = new THREE.InstancedMesh(
        part.geometry,
        part.material,
        config.capacity
      );
      batch.name = `${model} part ${index}`;
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < config.capacity; i++) batch.setColorAt(i, WHITE);
      batch.count = 0;
      batch.frustumCulled = false;
      batch.raycast = () => undefined;
      container.add(batch);
      return batch;
    });
    runtime.current = { batches, gait, attack, time };
    return () => {
      runtime.current = null;
      batches.forEach((batch) => {
        container.remove(batch);
        batch.dispose();
      });
      parts.forEach((part) => {
        part.geometry.dispose();
        part.material.dispose();
        part.texture.dispose();
      });
    };
  }, [scene, animations, config, model]);

  useRenderer(registry, ({ run, alpha, radius }) => {
    const live = runtime.current;
    if (!live) return;
    live.time.value = run.time;
    const gait = live.gait.array as Float32Array;
    let index = 0;
    for (const enemy of run.enemies) {
      if (enemy.spec.model !== model) continue;
      if (index >= config.capacity) break;
      const lift = emergeLift(
        enemy.emerge,
        alpha,
        1 / SIM_HZ,
        enemy.spec.scale
      );
      if (lift === null) continue;
      const leapElapsed = enemy.leap
        ? enemy.leap.previousElapsed +
          (enemy.leap.elapsed - enemy.leap.previousElapsed) * alpha
        : undefined;
      const jumpHeight =
        leapElapsed === undefined
          ? 0
          : sampleVoltLeap(voltLeapClipTime(leapElapsed)).height *
            enemy.spec.scale *
            VOLT_LEAP.heightScale;
      lerpNormal(s.n, enemy.prev, enemy.n, alpha);
      surfaceMatrix(
        s.basis,
        s.n,
        enemy.heading,
        radius,
        lift + jumpHeight,
        enemy.spec.scale
      );
      const tint = tintFor(enemy, run.time);
      for (const batch of live.batches) {
        setEnemyInstanceOpacity(
          batch,
          index,
          enemyDeathOpacity(run, enemy.n, enemy.spec.radius)
        );
        batch.setMatrixAt(index, s.basis);
        batch.setColorAt(index, tint);
      }
      const elapsed =
        leapElapsed !== undefined
          ? voltLeapClipTime(leapElapsed)
          : enemy.thrust
            ? enemy.thrust.previousElapsed +
              (enemy.thrust.elapsed - enemy.thrust.previousElapsed) * alpha
            : 0;
      const blend =
        leapElapsed !== undefined
          ? Math.min(
              1,
              (elapsed - VOLT_LEAP.start) / VOLT_LEAP.blendIn,
              (VOLT_LEAP.duration - elapsed) / VOLT_LEAP.blendOut
            )
          : enemy.thrust
            ? Math.min(
                1,
                elapsed / BULWARK_ATTACK.blendIn,
                (BULWARK_ATTACK.duration - elapsed) / BULWARK_ATTACK.blendOut
              )
            : 0;
      // Three accelerating pulses across the windup, shared by all red sensors.
      // Integrating the frequency keeps the pulse continuous as its rate rises.
      const windup = Math.min(1, elapsed / BULWARK_ATTACK.driveStart);
      const pulse =
        ((1 + Math.cos(2 * Math.PI * (windup + 2 * windup * windup))) / 2) ** 3;
      const signal =
        enemy.thrust && elapsed < BULWARK_ATTACK.driveStart
          ? (1 + 4 * windup) * pulse
          : 0;
      live.attack.setXYZ(index, elapsed, Math.max(0, blend), signal);
      const standing = enemy.mode === 'aim' || enemy.mode === 'leap';
      gait[index * 2] = (enemy.id * 0.618) % 1;
      gait[index * 2 + 1] = standing
        ? 0.05
        : enemy.speed / (config.travelSpeed * enemy.spec.scale);
      index++;
    }
    live.gait.needsUpdate = true;
    live.attack.needsUpdate = true;
    for (const batch of live.batches) {
      setEnemyOpacity(batch.material, 1, run.status === 'fallen');
      finish(batch, index);
    }
  });

  return <group ref={group} dispose={null} />;
}

// Dedicated transparent batches keep living units opaque and corpses non-interactive.
export function DefeatedBatch({
  registry,
  model,
}: {
  registry: Set<Renderer>;
  model: 'mite' | 'lancer' | 'bulwark';
}) {
  const config = MODELS[model];
  const { scene, animations } = useGLTF(config.url);
  const group = useRef<THREE.Group>(null);
  const runtime = useRef<{
    batches: THREE.InstancedMesh[];
    gait: THREE.InstancedBufferAttribute;
    pose: THREE.InstancedBufferAttribute;
    runDuration: number;
  } | null>(null);
  useLayoutEffect(() => {
    const container = group.current;
    if (!container) return;
    const parts = bakeEnemyLocomotion(
      scene,
      animations,
      { value: 0 },
      config.clip,
      'Defeated'
    );
    for (const part of parts) addRimLight(part.material);
    const gait = new THREE.InstancedBufferAttribute(
      new Float32Array(ENEMY_DEFEAT.capacity * 2),
      2
    );
    const pose = new THREE.InstancedBufferAttribute(
      new Float32Array(ENEMY_DEFEAT.capacity * 3),
      3
    );
    gait.setUsage(THREE.DynamicDrawUsage);
    pose.setUsage(THREE.DynamicDrawUsage);
    const batches = parts.map((part, i) => {
      part.geometry.setAttribute('enemyGait', gait);
      part.geometry.setAttribute('enemyAttack', pose);
      const batch = new THREE.InstancedMesh(
        part.geometry,
        part.material,
        ENEMY_DEFEAT.capacity
      );
      batch.name = `defeated ${model} part ${i}`;
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let j = 0; j < ENEMY_DEFEAT.capacity; j++)
        batch.setColorAt(j, WHITE);
      batch.count = 0;
      batch.frustumCulled = false;
      batch.raycast = () => undefined;
      container.add(batch);
      return batch;
    });
    runtime.current = {
      batches,
      gait,
      pose,
      runDuration: animations.find((clip) => clip.name === config.clip)!
        .duration,
    };
    return () => {
      runtime.current = null;
      for (const batch of batches) {
        container.remove(batch);
        batch.dispose();
      }
      for (const part of parts) {
        part.geometry.dispose();
        part.material.dispose();
        part.texture.dispose();
      }
    };
  }, [scene, animations, model, config]);
  useRenderer(registry, ({ run, alpha, radius }) => {
    const live = runtime.current;
    if (!live) return;
    let i = 0;
    for (const body of run.defeatedEnemies) {
      if (body.spec.model !== model) continue;
      if (i >= ENEMY_DEFEAT.capacity) break;
      const age = body.previousAge + (body.age - body.previousAge) * alpha;
      bodyMatrix(s.basis, body, age, radius);
      for (const batch of live.batches) {
        setEnemyInstanceOpacity(
          batch,
          i,
          enemyDeathOpacity(run, body.n, body.spec.radius)
        );
        batch.setMatrixAt(i, s.basis);
        batch.setColorAt(
          i,
          body.kind === 'volt'
            ? VOLT
            : body.kind === 'captain'
              ? CAPTAIN
              : WHITE
        );
      }
      // Freeze the preceding locomotion pose during the short blend into the collapse.
      const rate = body.speed / (config.travelSpeed * body.spec.scale);
      live.gait.setXY(
        i,
        ((body.diedAt * rate) / live.runDuration + body.id * 0.618) % 1,
        0
      );
      live.pose.setXYZ(
        i,
        Math.min(age, ENEMY_DEFEAT.duration),
        Math.min(1, age / ENEMY_DEFEAT.blendIn),
        enemyDefeatOpacity(age)
      );
      i++;
    }
    live.gait.needsUpdate = true;
    live.pose.needsUpdate = true;
    for (const batch of live.batches) {
      setEnemyOpacity(batch.material, 1, true);
      finish(batch, i);
    }
  });
  return <group ref={group} dispose={null} />;
}

// ---------- Death arcs ----------

/** World thickness of one arc segment. */
const ARC_THICKNESS = 0.016;
const ARC_FORWARD = new THREE.Vector3(0, 0, 1);

/** One draw call of thin glowing segments crawling over dying enemies. */
export function DeathArcs({ registry }: { registry: Set<Renderer> }) {
  const segments = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(
    () => ({
      points: Array.from({ length: DEATH_ARCS.steps + 1 }, () => vec3()),
      world: Array.from(
        { length: DEATH_ARCS.steps + 1 },
        () => new THREE.Vector3()
      ),
      body: new THREE.Matrix4(),
      matrix: new THREE.Matrix4(),
      middle: new THREE.Vector3(),
      along: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
      head: new THREE.Color(colors.fg.DEFAULT),
      tail: new THREE.Color(colors.accent.DEFAULT),
      color: new THREE.Color(),
    }),
    []
  );
  useLayoutEffect(() => {
    const mesh = segments.current;
    if (!mesh) return;
    // Create per-instance colors before the material first compiles.
    mesh.setColorAt(0, scratch.tail);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.raycast = () => undefined;
  }, [scratch]);

  useRenderer(registry, ({ run, alpha, radius }) => {
    const mesh = segments.current;
    if (!mesh) return;
    let count = 0;
    // Bodies are kept in order of death, so walk back from the newest.
    for (let b = run.defeatedEnemies.length - 1; b >= 0; b--) {
      const body = run.defeatedEnemies[b];
      const age = body.previousAge + (body.age - body.previousAge) * alpha;
      if (age >= DEATH_ARCS.life || count >= DEATH_ARCS.capacity) break;
      bodyMatrix(scratch.body, body, age, radius);
      for (let slot = 0; slot < arcCount(body); slot++) {
        const lit = traceArc(scratch.points, body, slot, age);
        const glow = arcGlow(body, slot, age);
        for (let i = 0; i < lit; i++)
          toVector(scratch.world[i], scratch.points[i]).applyMatrix4(
            scratch.body
          );
        for (let i = 1; i < lit && count < DEATH_ARCS.capacity; i++) {
          const from = scratch.world[i - 1];
          const to = scratch.world[i];
          const length = scratch.along.subVectors(to, from).length();
          if (length < 1e-6) continue;
          scratch.rotation.setFromUnitVectors(
            ARC_FORWARD,
            scratch.along.divideScalar(length)
          );
          scratch.middle.addVectors(from, to).multiplyScalar(0.5);
          scratch.scale.set(ARC_THICKNESS, ARC_THICKNESS, length);
          mesh.setMatrixAt(
            count,
            scratch.matrix.compose(
              scratch.middle,
              scratch.rotation,
              scratch.scale
            )
          );
          // The growing head burns white; the rest of the arc cools to orange.
          mesh.setColorAt(
            count++,
            scratch.color
              .copy(scratch.tail)
              .lerp(scratch.head, i / (lit - 1))
              .multiplyScalar(glow)
          );
        }
      }
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={segments}
      args={[undefined, undefined, DEATH_ARCS.capacity]}
      frustumCulled={false}
    >
      <boxGeometry />
      <meshBasicMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

// ---------- Bolts ----------

export function Bolts({ registry }: { registry: Set<Renderer> }) {
  const friendly = useRef<THREE.InstancedMesh>(null);
  const hostile = useRef<THREE.InstancedMesh>(null);
  useInstanced(friendly);
  useInstanced(hostile);
  useRenderer(registry, ({ run, alpha, radius }) => {
    let mine = 0;
    let theirs = 0;
    const a = friendly.current;
    const b = hostile.current;
    if (!a || !b) return;
    for (const shot of run.projectiles) {
      lerpNormal(s.n, shot.prev, shot.n, alpha);
      surfaceMatrix(s.basis, s.n, shot.dir, radius, 0.14, 1);
      if (!shot.from && run.hero === 'vanguard' && shot.speed > 0) {
        // Leave the raised left-hand muzzle, then converge on the hit path.
        const age = BOLT_LIFETIME - shot.life - (1 - alpha) / SIM_HZ;
        const muzzle = 1 - THREE.MathUtils.smoothstep(age, 0, 0.28);
        if (muzzle > 0) {
          s.position.addScaledVector(s.up, 0.2 * muzzle);
          s.position.addScaledVector(
            toVector(s.ahead, shot.dir),
            0.21 * muzzle
          );
          s.position.addScaledVector(
            s.right.crossVectors(s.up, s.ahead),
            0.066 * muzzle
          );
          s.basis.setPosition(s.position);
        }
      }
      if (shot.from) {
        if (theirs < b.instanceMatrix.count) b.setMatrixAt(theirs++, s.basis);
      } else if (mine < a.instanceMatrix.count) a.setMatrixAt(mine++, s.basis);
    }
    finish(a, mine);
    finish(b, theirs);
  });

  return (
    <>
      <instancedMesh ref={friendly} args={[undefined, undefined, 400]}>
        <boxGeometry args={[0.03, 0.03, 0.2]} />
        <meshBasicMaterial color={colors.fg.DEFAULT} toneMapped={false} />
      </instancedMesh>
      {/* Rods like the Vanguard's, so hostile fire never reads as a pickup. */}
      <instancedMesh ref={hostile} args={[undefined, undefined, 300]}>
        <boxGeometry args={[0.03, 0.03, 0.2]} />
        <meshBasicMaterial color={colors.danger.DEFAULT} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

// ---------- Shield lanes: fixed aim, filling warning, launch flash, skid ----------

export function BulwarkTelegraphs({ registry }: { registry: Set<Renderer> }) {
  const lanes = useRef<THREE.InstancedMesh>(null);
  const fills = useRef<THREE.InstancedMesh>(null);
  const trails = useRef<THREE.InstancedMesh>(null);
  useInstanced(lanes);
  useInstanced(fills);
  useInstanced(trails);
  const plane = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, []);
  const scratch = useMemo(
    () => ({
      normal: vec3(),
      forward: vec3(),
      right: vec3(),
      size: new THREE.Vector3(),
      color: new THREE.Color(colors.accent.DEFAULT),
    }),
    []
  );
  useEffect(() => () => plane.dispose(), [plane]);
  useRenderer(registry, ({ run, alpha, radius }) => {
    const base = lanes.current,
      fill = fills.current,
      trail = trails.current;
    if (!base || !fill || !trail) return;
    let b = 0,
      f = 0,
      t = 0;
    const draw = (
      mesh: THREE.InstancedMesh,
      index: number,
      enemy: Enemy,
      across: number,
      near: number,
      far: number,
      width: number,
      brightness: number
    ) => {
      if (far <= near || index >= mesh.instanceMatrix.count) return index;
      const attack = enemy.thrust!;
      // Short individual tiles follow the sphere instead of cutting through it.
      pointAt(
        scratch.normal,
        attack.origin,
        attack.direction,
        (near + far) / 2 / radius
      );
      normalize(
        projectTangent(copy(scratch.forward, attack.direction), scratch.normal)
      );
      cross(scratch.right, scratch.normal, scratch.forward);
      stepAlong(scratch.normal, scratch.right, across / radius);
      normalize(projectTangent(scratch.forward, scratch.normal));
      scratch.size.set(width, 1, far - near + 0.001);
      surfaceMatrix(
        s.basis,
        scratch.normal,
        scratch.forward,
        radius,
        0.012,
        scratch.size
      );
      mesh.setMatrixAt(index, s.basis);
      mesh.setColorAt(
        index,
        scratch.color.set(colors.accent.DEFAULT).multiplyScalar(brightness)
      );
      return index + 1;
    };
    for (const enemy of run.enemies) {
      if (!enemy.thrust || enemy.dead) continue;
      const attack = enemy.thrust;
      const elapsed =
        attack.previousElapsed +
        (attack.elapsed - attack.previousElapsed) * alpha;
      const warning = bulwarkWarningBounds(enemy.spec.scale);
      const across = (warning.left + warning.right) / 2;
      const width = warning.right - warning.left;
      const launch = elapsed >= BULWARK_ATTACK.driveStart;
      if (ENEMY_TELEGRAPHS && elapsed < BULWARK_ATTACK.driveStart + 0.08) {
        const progress = Math.min(1, elapsed / BULWARK_ATTACK.driveStart);
        const tip = warning.near + (warning.far - warning.near) * progress;
        for (let i = 0; i < 12; i++) {
          const near = warning.near + ((warning.far - warning.near) * i) / 12;
          const far =
            warning.near + ((warning.far - warning.near) * (i + 1)) / 12;
          b = draw(
            base,
            b,
            enemy,
            across,
            near,
            far,
            width + 0.025,
            launch ? 2 : 0.3
          );
          f = draw(
            fill,
            f,
            enemy,
            across,
            near,
            Math.min(far, tip),
            width,
            launch ? 3 : 1.4
          );
        }
      }
      if (launch && elapsed < BULWARK_ATTACK.driveEnd + 0.2) {
        const travel = sampleBulwarkAttack(elapsed)[0] * enemy.spec.scale;
        const fade = Math.min(
          1,
          (BULWARK_ATTACK.driveEnd + 0.2 - elapsed) / 0.2
        );
        for (const foot of [-0.09, 0.09])
          for (let i = 0; i < 8; i++)
            t = draw(
              trail,
              t,
              enemy,
              foot,
              (travel * i) / 8,
              (travel * (i + 1)) / 8,
              0.025,
              fade * 0.65
            );
      }
    }
    finish(base, b);
    finish(fill, f);
    finish(trail, t);
  });
  return (
    <>
      <instancedMesh ref={lanes} args={[plane, undefined, 5400]}>
        <meshBasicMaterial
          transparent
          opacity={0.65}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={fills} args={[plane, undefined, 5400]}>
        <meshBasicMaterial
          transparent
          opacity={0.9}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={trails} args={[plane, undefined, 7200]}>
        <meshBasicMaterial
          transparent
          opacity={0.6}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}

// ---------- Ground effects and telegraphs ----------

const TONES = {
  volt: new THREE.Color(colors.danger.DEFAULT),
  strike: new THREE.Color(colors.fg.DEFAULT),
  warden: new THREE.Color(colors.danger.strong),
};

export function WorldEffects({ registry }: { registry: Set<Renderer> }) {
  const blasts = useRef<THREE.InstancedMesh>(null);
  const chevrons = useRef<THREE.InstancedMesh>(null);
  const cone = useRef<THREE.InstancedMesh>(null);
  useInstanced(cone);
  useInstanced(blasts);
  useInstanced(chevrons);
  const flat = useMemo(() => new THREE.Vector3(), []);
  const flatDisc = useMemo(() => {
    const geometry = new THREE.CircleGeometry(1, 32);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, []);
  const chevron = useMemo(createAimChevronGeometry, []);
  const coneGeometry = useMemo(createWardenWarningGeometry, []);
  useEffect(
    () => () => [flatDisc, chevron, coneGeometry].forEach((g) => g.dispose()),
    [flatDisc, chevron, coneGeometry]
  );

  useRenderer(registry, ({ run, radius }) => {
    const blast = blasts.current,
      marks = chevrons.current;
    if (!blast || !marks) return;
    let b = 0;
    let c = 0;
    let coneCount = 0;
    for (const effect of run.effects) {
      const k = effect.age / effect.life;
      if (effect.kind === 'blast') {
        const tone = TONES[effect.tone];
        flat.setScalar(effect.radius * (0.5 + 0.5 * k));
        surfaceMatrix(
          s.basis,
          effect.n,
          run.player.forward,
          radius,
          0.03,
          flat
        );
        s.color.copy(tone).multiplyScalar(1 - k);
        if (b < blast.instanceMatrix.count) {
          blast.setMatrixAt(b, s.basis);
          blast.setColorAt(b++, s.color);
        }
      } else if (effect.kind === 'aim' && telegraphed(effect.from)) {
        const blink = Math.floor(effect.age * 10) % 2 === 0 ? 1 : 0.45;
        const steps = Math.min(16, Math.ceil(effect.length / 0.22));
        s.n.x = effect.n.x;
        s.n.y = effect.n.y;
        s.n.z = effect.n.z;
        s.dir.x = effect.dir.x;
        s.dir.y = effect.dir.y;
        s.dir.z = effect.dir.z;
        for (let i = 0; i < steps && c < marks.instanceMatrix.count; i++) {
          stepAlong(s.n, s.dir, effect.length / steps / radius);
          surfaceMatrix(s.basis, s.n, s.dir, radius, 0.02, 1);
          marks.setMatrixAt(c, s.basis);
          marks.setColorAt(c++, s.color.copy(TONES.volt).multiplyScalar(blink));
        }
      } else if (
        effect.kind === 'cone' &&
        ENEMY_TELEGRAPHS &&
        cone.current &&
        coneCount < cone.current.instanceMatrix.count
      ) {
        surfaceMatrix(
          s.basis,
          effect.n,
          effect.dir,
          radius,
          0.025,
          effect.radius
        );
        cone.current.setMatrixAt(coneCount, s.basis);
        cone.current.setColorAt(
          coneCount++,
          s.color.copy(TONES.warden).multiplyScalar(0.45 + 0.55 * k)
        );
      }
    }
    if (cone.current) finish(cone.current, coneCount);
    finish(blast, b);
    finish(marks, c);
  });

  return (
    <>
      <instancedMesh ref={blasts} args={[flatDisc, undefined, 80]}>
        <meshBasicMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={chevrons} args={[chevron, undefined, 600]}>
        <meshBasicMaterial
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={cone} args={[coneGeometry, undefined, 16]}>
        <meshBasicMaterial
          transparent
          opacity={0.45}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
    </>
  );
}

// ---------- XP shards and pickups ----------

export function Pickups({ registry }: { registry: Set<Renderer> }) {
  const group = useRef<THREE.Group>(null);
  const instances = useRef<PickupInstances | null>(null);
  useLayoutEffect(() => {
    const parent = group.current!;
    const pickups = new PickupInstances();
    instances.current = pickups;
    parent.add(pickups.group);
    return () => {
      parent.remove(pickups.group);
      pickups.dispose();
      instances.current = null;
    };
  }, []);
  useRenderer(registry, ({ run, alpha, radius }) => {
    instances.current?.update(run, radius, alpha);
  });
  return <group ref={group} />;
}

// ---------- Damage numbers, as a DOM layer over the canvas ----------

const TEXT_POOL = 120;
const projected = new THREE.Vector3();

export function DamageNumbers({ registry }: { registry: Set<Renderer> }) {
  const { gl } = useThree();
  const spans = useRef<HTMLSpanElement[]>([]);

  useLayoutEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!parent) return;
    const layer = document.createElement('div');
    layer.className = 'pointer-events-none absolute inset-0 overflow-hidden';
    layer.setAttribute('aria-hidden', 'true');
    spans.current = Array.from({ length: TEXT_POOL }, () => {
      const span = document.createElement('span');
      span.className = 'absolute left-0 top-0 font-mono text-label font-bold';
      span.style.display = 'none';
      layer.appendChild(span);
      return span;
    });
    parent.appendChild(layer);
    return () => {
      parent.removeChild(layer);
      spans.current = [];
    };
  }, [gl]);

  useRenderer(registry, ({ run, radius, camera, size }) => {
    let index = 0;
    for (const text of run.texts) {
      const span = spans.current[index];
      if (!span) break;
      projected
        .set(text.n.x, text.n.y, text.n.z)
        .multiplyScalar(radius + 0.3 + text.age * 0.5)
        .project(camera);
      if (projected.z > 1) continue;
      const x = ((projected.x + 1) / 2) * size.width;
      const y = ((1 - projected.y) / 2) * size.height;
      const tone = text.hurt
        ? 'text-danger'
        : text.crit
          ? 'text-gold'
          : 'text-fg';
      if (span.dataset.tone !== tone) {
        span.dataset.tone = tone;
        span.className = `absolute left-0 top-0 font-mono text-label font-bold ${tone}`;
      }
      const label = String(text.value);
      if (span.textContent !== label) span.textContent = label;
      span.style.display = '';
      span.style.opacity = String(Math.min(1, (0.7 - text.age) / 0.25));
      span.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      index++;
    }
    for (; index < spans.current.length; index++) {
      const span = spans.current[index];
      if (span.style.display !== 'none') span.style.display = 'none';
    }
  });

  return null;
}
