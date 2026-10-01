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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createWardenWarningGeometry } from '../../utils/wardenAnimation';
import {
  enemyDeathOpacity,
  setEnemyInstanceOpacity,
  setEnemyOpacity,
} from '../../utils/enemyOpacity';
import { bakeEnemyLocomotion } from '../../utils/enemyRunAtlas';
import { colors } from '../../../ui/tokens';
import {
  lerpNormal,
  copy,
  cross,
  pointAt,
  normalize,
  projectTangent,
  rotateAbout,
  stepAlong,
  vec3,
  type Vec3,
} from '../../survivors/sphere';
import { SIM_HZ, type DefeatedEnemy, type Enemy } from '../../survivors/sim';
import { emergeLift } from '../../survivors/breach';
import {
  ENEMY_DEFEAT,
  enemyDefeatOpacity,
  TOSS_SHAPE,
  tossFlight,
} from '../../survivors/enemyDefeat';
import {
  BULWARK_ATTACK,
  bulwarkWarningBounds,
  sampleBulwarkAttack,
} from '../../survivors/bulwarkAttack';
import {
  surfaceRotation,
  toVector,
  useRenderer,
  type Renderer,
} from '../../survivors/renderFrame';

const WHITE = new THREE.Color(1, 1, 1);
const FLASH = new THREE.Color(5, 5, 5);
const VOLT = new THREE.Color(colors.danger.DEFAULT).multiplyScalar(1.6);
const CAPTAIN = new THREE.Color(colors.gold.soft).multiplyScalar(1.5);
const HOLLOW = colors.line.strong;
const SENSOR = colors.danger.line;

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
  if (enemy.kind === 'volt')
    return enemy.mode === 'fuse' && Math.floor(enemy.modeTime * 16) % 2 === 0
      ? FLASH
      : VOLT;
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
      model === 'bulwark' ? 'ShieldThrust' : undefined
    );
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
      lerpNormal(s.n, enemy.prev, enemy.n, alpha);
      surfaceMatrix(
        s.basis,
        s.n,
        enemy.heading,
        radius,
        lift,
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
      const elapsed = enemy.thrust
        ? enemy.thrust.previousElapsed +
          (enemy.thrust.elapsed - enemy.thrust.previousElapsed) * alpha
        : 0;
      const blend = enemy.thrust
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
      const standing = enemy.mode === 'aim' || enemy.mode === 'fuse';
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

// ---------- Placeholders for Hollow Legion units not yet modeled ----------

function box(
  w: number,
  h: number,
  d: number,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0
) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.rotateX(rx);
  geometry.rotateY(ry);
  geometry.rotateZ(rz);
  geometry.translate(x, y, z);
  return geometry;
}

function merged(...parts: THREE.BufferGeometry[]) {
  const flat = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  flat.forEach((part) => {
    part.deleteAttribute('uv');
    part.deleteAttribute('normal');
  });
  const geometry = mergeGeometries(flat);
  geometry.computeVertexNormals();
  parts.forEach((part) => part.dispose());
  return geometry;
}

interface PlaceholderParts {
  body: THREE.BufferGeometry;
  sensor: THREE.BufferGeometry;
  mask?: THREE.BufferGeometry;
}

function placeholderGeometry(model: 'seeker'): PlaceholderParts {
  switch (model) {
    case 'seeker': {
      // Low elongated hound with swept fins.
      const hull = new THREE.ConeGeometry(0.075, 0.42, 4);
      hull.rotateX(Math.PI / 2);
      hull.translate(0, 0.12, 0.02);
      return {
        body: merged(
          hull,
          box(0.02, 0.1, 0.16, -0.06, 0.18, -0.08, -0.5, 0, -0.35),
          box(0.02, 0.1, 0.16, 0.06, 0.18, -0.08, -0.5, 0, 0.35),
          box(0.03, 0.1, 0.03, -0.05, 0.05, 0.08),
          box(0.03, 0.1, 0.03, 0.05, 0.05, 0.08),
          box(0.03, 0.1, 0.03, -0.05, 0.05, -0.1),
          box(0.03, 0.1, 0.03, 0.05, 0.05, -0.1)
        ),
        sensor: box(0.08, 0.02, 0.02, 0, 0.13, 0.22),
      };
    }
  }
}

export function PlaceholderBatch({
  model,
  capacity,
  registry,
}: {
  model: 'seeker';
  capacity: number;
  registry: Set<Renderer>;
}) {
  const parts = useMemo(() => placeholderGeometry(model), [model]);
  const body = useRef<THREE.InstancedMesh>(null);
  const sensor = useRef<THREE.InstancedMesh>(null);
  const mask = useRef<THREE.InstancedMesh>(null);
  useInstanced(body);
  useInstanced(sensor);
  useInstanced(mask);
  useEffect(
    () => () => Object.values(parts).forEach((geometry) => geometry.dispose()),
    [parts]
  );
  const maskGeometry = parts.mask ?? null;

  useRenderer(registry, ({ run, alpha, radius }) => {
    const meshes = [body.current, sensor.current, mask.current];
    let index = 0;
    for (const enemy of run.enemies) {
      if (enemy.spec.model !== model) continue;
      if (index >= capacity) break;
      const lift = emergeLift(
        enemy.emerge,
        alpha,
        1 / SIM_HZ,
        enemy.spec.scale
      );
      if (lift === null) continue;
      lerpNormal(s.n, enemy.prev, enemy.n, alpha);
      const bob =
        enemy.mode === 'walk' ? Math.abs(Math.sin(enemy.age * 9)) * 0.015 : 0;
      surfaceMatrix(
        s.basis,
        s.n,
        enemy.heading,
        radius,
        bob + lift,
        enemy.spec.scale
      );
      const tint = tintFor(enemy, run.time);
      for (const mesh of meshes) {
        if (!mesh) continue;
        setEnemyInstanceOpacity(
          mesh,
          index,
          enemyDeathOpacity(run, enemy.n, enemy.spec.radius)
        );
        mesh.setMatrixAt(index, s.basis);
        mesh.setColorAt(index, tint);
      }
      index++;
    }
    for (const mesh of meshes)
      if (mesh) {
        setEnemyOpacity(mesh.material, 1, run.status === 'fallen');
        finish(mesh, index);
      }
  });

  return (
    <>
      <instancedMesh ref={body} args={[parts.body, undefined, capacity]}>
        <meshStandardMaterial
          color={HOLLOW}
          flatShading
          roughness={0.7}
          metalness={0.3}
        />
      </instancedMesh>
      <instancedMesh ref={sensor} args={[parts.sensor, undefined, capacity]}>
        <meshStandardMaterial
          color={SENSOR}
          emissive={SENSOR}
          emissiveIntensity={2}
        />
      </instancedMesh>
      {maskGeometry ? (
        <instancedMesh ref={mask} args={[maskGeometry, undefined, capacity]}>
          <meshStandardMaterial color={colors.fg.DEFAULT} flatShading />
        </instancedMesh>
      ) : null}
    </>
  );
}

// ---------- Bolts ----------

export function Bolts({ registry }: { registry: Set<Renderer> }) {
  const friendly = useRef<THREE.InstancedMesh>(null);
  const hostile = useRef<THREE.InstancedMesh>(null);
  useInstanced(friendly);
  useInstanced(hostile);
  const stretch = useMemo(() => new THREE.Vector3(1, 1, 1), []);

  useRenderer(registry, ({ run, alpha, radius }) => {
    let mine = 0;
    let theirs = 0;
    const a = friendly.current;
    const b = hostile.current;
    if (!a || !b) return;
    for (const shot of run.projectiles) {
      lerpNormal(s.n, shot.prev, shot.n, alpha);
      stretch.set(1, 1, 1);
      surfaceMatrix(s.basis, s.n, shot.dir, radius, 0.14, stretch);
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
      <instancedMesh ref={hostile} args={[undefined, undefined, 300]}>
        <octahedronGeometry args={[0.055, 0]} />
        <meshBasicMaterial color={colors.danger.DEFAULT} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

// ---------- Weapons around the Vanguard ----------

export function Shards({ registry }: { registry: Set<Renderer> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useInstanced(mesh);
  const flat = useMemo(() => new THREE.Vector3(1, 0.35, 1), []);

  useRenderer(registry, ({ run, alpha, radius, normal, right }) => {
    const batch = mesh.current;
    if (!batch) return;
    const weapon = run.weapons.find((w) => w.id === 'shards');
    let index = 0;
    if (weapon && weapon.count) {
      const angle =
        weapon.prevAngle + (weapon.angle - weapon.prevAngle) * alpha;
      for (let i = 0; i < weapon.count; i++) {
        s.dir.x = right.x;
        s.dir.y = right.y;
        s.dir.z = right.z;
        rotateAbout(s.dir, normal, angle + (i * Math.PI * 2) / weapon.count);
        s.n.x = normal.x;
        s.n.y = normal.y;
        s.n.z = normal.z;
        stepAlong(s.n, s.dir, weapon.radius / radius);
        flat.set(weapon.evolved ? 1.5 : 1, 0.35, weapon.evolved ? 1.5 : 1);
        rotateAbout(s.dir, s.n, run.time * 14 + i);
        surfaceMatrix(s.basis, s.n, s.dir, radius, 0.13, flat);
        batch.setMatrixAt(index, s.basis);
        batch.setColorAt(index, weapon.evolved ? CAPTAIN : WHITE);
        index++;
      }
    }
    finish(batch, index);
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, 8]}>
      <octahedronGeometry args={[0.07, 0]} />
      <meshStandardMaterial
        color={colors.fg.DEFAULT}
        emissive={colors.fg.secondary}
        emissiveIntensity={0.6}
        flatShading
      />
    </instancedMesh>
  );
}

/** Things drawn flat on the ground in the player's screen frame. */
export function PlayerFrameEffects({ registry }: { registry: Set<Renderer> }) {
  const frame = useRef<THREE.Group>(null);
  const field = useRef<THREE.Mesh>(null);
  const fieldRing = useRef<THREE.Mesh>(null);
  useRenderer(registry, ({ run, radius, normal, forward }) => {
    const group = frame.current;
    if (!group) return;
    toVector(s.up, normal);
    toVector(s.position, forward);
    surfaceRotation(group.quaternion, s.up, s.position);
    group.position.copy(s.up).multiplyScalar(radius + 0.02);

    const pulse = run.weapons.find((w) => w.id === 'pulse');
    const disc = field.current;
    const ring = fieldRing.current;
    if (disc && ring) {
      const on = Boolean(pulse && pulse.radius);
      disc.visible = on;
      ring.visible = on;
      if (pulse && on) {
        disc.scale.setScalar(pulse.radius);
        ring.scale.setScalar(pulse.radius);
        ring.rotation.z = run.time * 0.6;
        const material = disc.material as THREE.MeshBasicMaterial;
        material.color.set(
          pulse.evolved ? colors.gold.DEFAULT : colors.accent.DEFAULT
        );
        (ring.material as THREE.MeshBasicMaterial).color.set(
          pulse.evolved ? colors.gold.soft : colors.accent.soft
        );
      }
    }
  });

  return (
    <group ref={frame}>
      <mesh ref={field} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <circleGeometry args={[1, 48]} />
        <meshBasicMaterial
          transparent
          opacity={0.05}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={fieldRing} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.96, 1, 48, 1, 0, Math.PI * 1.7]} />
        <meshBasicMaterial
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
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
      if (elapsed < BULWARK_ATTACK.driveStart + 0.08) {
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

// ---------- Ground effects, burns, lobs and telegraphs ----------

const TONES = {
  fire: new THREE.Color(colors.accent.DEFAULT),
  volt: new THREE.Color(colors.danger.DEFAULT),
  strike: new THREE.Color(colors.fg.DEFAULT),
  warden: new THREE.Color(colors.danger.strong),
};

export function WorldEffects({ registry }: { registry: Set<Renderer> }) {
  const blasts = useRef<THREE.InstancedMesh>(null);
  const burns = useRef<THREE.InstancedMesh>(null);
  const beams = useRef<THREE.InstancedMesh>(null);
  const links = useRef<THREE.InstancedMesh>(null);
  const chevrons = useRef<THREE.InstancedMesh>(null);
  const lobs = useRef<THREE.InstancedMesh>(null);
  const cone = useRef<THREE.InstancedMesh>(null);
  useInstanced(cone);
  useInstanced(blasts);
  useInstanced(burns);
  useInstanced(beams);
  useInstanced(links);
  useInstanced(chevrons);
  useInstanced(lobs);
  const flat = useMemo(() => new THREE.Vector3(), []);
  const flatDisc = useMemo(() => {
    const geometry = new THREE.CircleGeometry(1, 32);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, []);
  const flatRing = useMemo(() => {
    const geometry = new THREE.RingGeometry(0.82, 1, 32);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, []);
  const chevron = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.07, -0.03);
    shape.lineTo(0, 0.04);
    shape.lineTo(0.07, -0.03);
    shape.lineTo(0.07, -0.06);
    shape.lineTo(0, 0.01);
    shape.lineTo(-0.07, -0.06);
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, []);
  const coneGeometry = useMemo(createWardenWarningGeometry, []);
  useEffect(
    () => () =>
      [flatDisc, flatRing, chevron, coneGeometry].forEach((g) => g.dispose()),
    [flatDisc, flatRing, chevron, coneGeometry]
  );

  useRenderer(registry, ({ run, alpha, radius }) => {
    const [blast, burn, beam, link, marks, lob] = [
      blasts.current,
      burns.current,
      beams.current,
      links.current,
      chevrons.current,
      lobs.current,
    ];
    if (!blast || !burn || !beam || !link || !marks || !lob) return;
    let b = 0;
    let bm = 0;
    let l = 0;
    let c = 0;
    let coneCount = 0;
    for (const effect of run.effects) {
      const k = effect.age / effect.life;
      if (effect.kind === 'blast' || effect.kind === 'strike') {
        const tone =
          effect.kind === 'strike' ? TONES.strike : TONES[effect.tone];
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
        if (effect.kind === 'strike' && bm < beam.instanceMatrix.count) {
          flat.set(1 - k, 1, 1 - k);
          surfaceMatrix(
            s.basis,
            effect.n,
            run.player.forward,
            radius,
            1.5,
            flat
          );
          beam.setMatrixAt(bm, s.basis);
          beam.setColorAt(bm++, s.color);
        }
      } else if (effect.kind === 'chain' && l < link.instanceMatrix.count) {
        // A straight bar between two nearby points, lifted off the ground.
        toVector(s.position, effect.a).multiplyScalar(radius + 0.15);
        toVector(s.up, effect.b).multiplyScalar(radius + 0.15);
        const length = s.position.distanceTo(s.up);
        s.ahead.copy(s.up).sub(s.position).normalize();
        s.right.copy(s.position).add(s.up).multiplyScalar(0.5);
        s.rotation.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.ahead);
        s.scale.set(1 - k, 1 - k, length);
        s.basis.compose(s.right, s.rotation, s.scale);
        link.setMatrixAt(l, s.basis);
        link.setColorAt(l++, s.color.copy(TONES.strike).multiplyScalar(1 - k));
      } else if (effect.kind === 'aim') {
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
    finish(beam, bm);
    finish(link, l);
    finish(marks, c);

    let z = 0;
    for (const zone of run.zones) {
      if (z >= burn.instanceMatrix.count) break;
      const fade = Math.min(1, (zone.life - zone.age) * 3);
      flat.setScalar(zone.radius * (0.92 + Math.sin(run.time * 20 + z) * 0.06));
      surfaceMatrix(s.basis, zone.n, run.player.forward, radius, 0.015, flat);
      burn.setMatrixAt(z, s.basis);
      burn.setColorAt(z++, s.color.copy(TONES.fire).multiplyScalar(0.3 * fade));
    }
    finish(burn, z);

    let i = 0;
    for (const item of run.lobs) {
      if (i >= lob.instanceMatrix.count) break;
      const t = Math.min(1, (item.age + alpha / 30) / item.life);
      lerpNormal(s.n, item.from, item.to, t);
      surfaceMatrix(
        s.basis,
        s.n,
        run.player.forward,
        radius,
        0.1 + Math.sin(t * Math.PI) * 0.55,
        1
      );
      lob.setMatrixAt(i++, s.basis);
    }
    finish(lob, i);
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
      <instancedMesh ref={burns} args={[flatDisc, undefined, 60]}>
        <meshBasicMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={beams} args={[undefined, undefined, 24]}>
        <cylinderGeometry args={[0.05, 0.02, 3, 6, 1, true]} />
        <meshBasicMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={links} args={[undefined, undefined, 40]}>
        <boxGeometry args={[0.025, 0.025, 1]} />
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
      <instancedMesh ref={lobs} args={[undefined, undefined, 24]}>
        <icosahedronGeometry args={[0.05, 0]} />
        <meshStandardMaterial
          color={colors.accent.DEFAULT}
          emissive={colors.accent.DEFAULT}
          emissiveIntensity={0.8}
          flatShading
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

const SHARD_TIERS = [
  new THREE.Color(colors.accent.DEFAULT),
  new THREE.Color(colors.owned),
  new THREE.Color(colors.gold.DEFAULT),
];

export function Pickups({ registry }: { registry: Set<Renderer> }) {
  const gems = useRef<THREE.InstancedMesh>(null);
  const repair = useRef<THREE.InstancedMesh>(null);
  const tractor = useRef<THREE.InstancedMesh>(null);
  const emp = useRef<THREE.InstancedMesh>(null);
  const drops = useRef<THREE.InstancedMesh>(null);
  const beacons = useRef<THREE.InstancedMesh>(null);
  useInstanced(gems, SHARD_TIERS[0]);
  useInstanced(repair);
  useInstanced(tractor);
  useInstanced(emp);
  useInstanced(drops);
  useInstanced(beacons);
  const spin = useMemo(() => new THREE.Vector3(), []);

  useRenderer(registry, ({ run, alpha, radius }) => {
    const batch = gems.current;
    if (!batch) return;
    let index = 0;
    for (const gem of run.gems) {
      if (index >= batch.instanceMatrix.count) break;
      lerpNormal(s.n, gem.prev, gem.n, alpha);
      const tier = gem.value < 2 ? 0 : gem.value < 10 ? 1 : 2;
      s.dir.x = run.player.forward.x;
      s.dir.y = run.player.forward.y;
      s.dir.z = run.player.forward.z;
      rotateAbout(s.dir, s.n, run.time * 2 + index);
      surfaceMatrix(
        s.basis,
        s.n,
        s.dir,
        radius,
        0.07 + Math.sin(run.time * 4 + index) * 0.015,
        1 + tier * 0.35
      );
      batch.setMatrixAt(index, s.basis);
      batch.setColorAt(index, SHARD_TIERS[tier]);
      index++;
    }
    finish(batch, index);

    const counts = { repair: 0, tractor: 0, emp: 0, drop: 0 };
    const meshes = {
      repair: repair.current,
      tractor: tractor.current,
      emp: emp.current,
      drop: drops.current,
    };
    let lit = 0;
    for (const item of run.items) {
      const mesh = meshes[item.kind];
      if (!mesh || counts[item.kind] >= mesh.instanceMatrix.count) continue;
      lerpNormal(s.n, item.prev, item.n, alpha);
      s.dir.x = run.player.forward.x;
      s.dir.y = run.player.forward.y;
      s.dir.z = run.player.forward.z;
      rotateAbout(s.dir, s.n, item.age * 1.5);
      const size = item.big ? 1.5 : 1;
      surfaceMatrix(
        s.basis,
        s.n,
        s.dir,
        radius,
        0.1 + Math.sin(item.age * 4) * 0.02,
        size
      );
      mesh.setMatrixAt(counts[item.kind]++, s.basis);
      if (
        item.kind === 'drop' &&
        beacons.current &&
        lit < beacons.current.instanceMatrix.count
      ) {
        spin.set(size, 1, size);
        surfaceMatrix(s.basis, s.n, s.dir, radius, 1, spin);
        beacons.current.setMatrixAt(lit++, s.basis);
      }
    }
    for (const kind of ['repair', 'tractor', 'emp', 'drop'] as const) {
      const mesh = meshes[kind];
      if (mesh) finish(mesh, counts[kind]);
    }
    if (beacons.current) finish(beacons.current, lit);
  });

  return (
    <>
      <instancedMesh ref={gems} args={[undefined, undefined, 400]}>
        <octahedronGeometry args={[0.045, 0]} />
        <meshStandardMaterial
          color={colors.fg.DEFAULT}
          emissive={colors.fg.DEFAULT}
          emissiveIntensity={0.35}
          flatShading
        />
      </instancedMesh>
      <instancedMesh ref={repair} args={[undefined, undefined, 12]}>
        <boxGeometry args={[0.12, 0.12, 0.12]} />
        <meshStandardMaterial
          color={colors.success}
          emissive={colors.success}
          emissiveIntensity={0.5}
          flatShading
        />
      </instancedMesh>
      <instancedMesh ref={tractor} args={[undefined, undefined, 12]}>
        <torusGeometry args={[0.07, 0.022, 6, 12]} />
        <meshStandardMaterial
          color={colors.fg.DEFAULT}
          emissive={colors.fg.secondary}
          emissiveIntensity={0.6}
          flatShading
        />
      </instancedMesh>
      <instancedMesh ref={emp} args={[undefined, undefined, 12]}>
        <icosahedronGeometry args={[0.08, 0]} />
        <meshStandardMaterial
          color={colors.danger.DEFAULT}
          emissive={colors.danger.DEFAULT}
          emissiveIntensity={0.7}
          flatShading
        />
      </instancedMesh>
      <instancedMesh ref={drops} args={[undefined, undefined, 8]}>
        <boxGeometry args={[0.18, 0.14, 0.18]} />
        <meshStandardMaterial
          color={colors.gold.DEFAULT}
          emissive={colors.gold.DEFAULT}
          emissiveIntensity={0.4}
          flatShading
        />
      </instancedMesh>
      <instancedMesh ref={beacons} args={[undefined, undefined, 8]}>
        <cylinderGeometry args={[0.02, 0.02, 2, 6, 1, true]} />
        <meshBasicMaterial
          color={colors.gold.soft}
          transparent
          opacity={0.6}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
    </>
  );
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
