import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { colors } from '../../../ui/tokens';
import {
  surfaceRotation,
  toVector,
  useRenderer,
  type Renderer,
} from '../../survivors/renderFrame';
import { shardDirection, shardOrbitRadius, SIM_HZ } from '../../survivors/sim';
import { pointAt, vec3 } from '../../survivors/sphere';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';

const MAX_SHARDS = 6;
const SEGMENTS = 6;
const HEIGHT = 0.14;
const TAU = Math.PI * 2;

type Vertex = [number, number, number];

/** +Z is the leading point. The ivory bevel runs down the outside edge. */
function shardBlade(evolved: boolean) {
  const tip: Vertex = [0.012, 0, 0.109];
  const edge: Vertex = [-0.056, 0, -0.022];
  const heel: Vertex = [-0.067, 0, -0.092];
  const notch: Vertex = [-0.01, 0, -0.044];
  const back: Vertex = [0.03, 0, -0.065];
  const spine: Vertex = [0.033, 0, -0.009];
  const bevel: Vertex = [-0.04, 0.012, -0.021];
  const ridge: Vertex = [-0.003, 0.027, -0.014];
  const underside: Vertex = [-0.004, -0.018, -0.014];
  const vertices: number[] = [],
    shades: number[] = [];
  const face = (a: Vertex, b: Vertex, c: Vertex, tint: string) => {
    vertices.push(...a, ...b, ...c);
    const { r, g, b: blue } = new THREE.Color(tint);
    for (let i = 0; i < 3; i++) shades.push(r, g, blue);
  };
  const ivory = SECTOR_COLORS.opponent,
    graphite = colors.line.strong;
  face(tip, edge, bevel, colors.fg.DEFAULT);
  face(edge, heel, bevel, ivory);
  face(tip, bevel, ridge, ivory);
  face(bevel, heel, ridge, colors.fg.muted);
  face(heel, notch, ridge, graphite);
  face(notch, back, ridge, colors.fg.subtle);
  face(back, spine, ridge, graphite);
  face(spine, tip, ridge, colors.fg.secondary);
  const rim = [tip, edge, heel, notch, back, spine];
  rim.forEach((v, i) =>
    face(
      v,
      rim[(i + 1) % rim.length],
      underside,
      i < 2 ? colors.fg.muted : graphite
    )
  );
  if (evolved) {
    // Split rear fin, with the gold confined to its raised outer facet.
    const root: Vertex = [0.013, 0.012, -0.026];
    const wing: Vertex = [0.066, 0.01, -0.106];
    const crest: Vertex = [0.046, 0.024, -0.05];
    face(spine, root, crest, colors.gold.soft);
    face(root, wing, crest, colors.fg.subtle);
    face(crest, wing, spine, colors.gold.DEFAULT);
    face(wing, root, spine, graphite);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3)
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
  return geometry;
}

/** One tapered ribbon per blade. Only the positions change as the orbit breathes. */
function shardTrails() {
  const geometry = new THREE.BufferGeometry();
  const colorsAndAlpha: number[] = [],
    indices: number[] = [];
  for (let i = 0; i < MAX_SHARDS; i++) {
    for (let j = 0; j <= SEGMENTS; j++) {
      const k = (i * (SEGMENTS + 1) + j) * 2;
      const fade = 0.42 * (1 - j / SEGMENTS) ** 1.6;
      colorsAndAlpha.push(1, 1, 1, fade, 1, 1, 1, fade * 0.4);
      if (j < SEGMENTS) indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const positions = new THREE.BufferAttribute(
    new Float32Array((colorsAndAlpha.length / 4) * 3),
    3
  );
  geometry.setAttribute('position', positions.setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(colorsAndAlpha, 4)
  );
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  return geometry;
}

export function OrbitShards({ registry }: { registry: Set<Renderer> }) {
  const blades = useRef<THREE.InstancedMesh>(null);
  const art = useMemo(
    () => ({
      base: shardBlade(false),
      halo: shardBlade(true),
      trails: shardTrails(),
    }),
    []
  );
  useEffect(
    () => () => {
      art.base.dispose();
      art.halo.dispose();
      art.trails.dispose();
    },
    [art]
  );
  const scratch = useMemo(
    () => ({
      radial: vec3(),
      point: vec3(),
      up: new THREE.Vector3(),
      travel: new THREE.Vector3(),
      blade: new THREE.Object3D(),
    }),
    []
  );

  useRenderer(registry, ({ run, alpha, radius, normal, right }) => {
    const mesh = blades.current;
    if (!mesh) return;
    const weapon = run.weapons.find((w) => w.id === 'shards');
    mesh.count = weapon?.count ?? 0;
    art.trails.setDrawRange(0, mesh.count * SEGMENTS * 6);
    if (!weapon || !mesh.count) return;

    const { radial, point, up, travel, blade } = scratch;
    const evolved = weapon.evolved;
    mesh.geometry = evolved ? art.halo : art.base;
    const phase = THREE.MathUtils.lerp(weapon.prevAngle, weapon.angle, alpha);
    const time = run.time - (1 - alpha) / SIM_HZ;
    const speed = (weapon.angle - weapon.prevAngle) * SIM_HZ;
    const reachAt = (ago: number) =>
      evolved
        ? shardOrbitRadius(weapon.level, true, run.player.area, time - ago)
        : weapon.radius;
    const reach = reachAt(0);
    const positions = art.trails.getAttribute('position');
    const height = radius + HEIGHT;
    let vertex = 0;
    for (let i = 0; i < mesh.count; i++) {
      const angle = phase + (i * TAU) / mesh.count;
      shardDirection(radial, right, normal, angle);
      pointAt(point, normal, radial, reach / radius);
      blade.position.copy(toVector(up, point)).multiplyScalar(height);
      // A point just behind also accounts for the Halo moving radially.
      shardDirection(radial, right, normal, angle - 0.02);
      pointAt(point, normal, radial, reachAt(0.02 / (speed || 1)) / radius);
      travel.copy(up).sub(point);
      surfaceRotation(blade.quaternion, up, travel);
      blade.rotateZ(0.3 + 0.09 * Math.sin(angle));
      blade.scale.setScalar(evolved ? 1.13 : 1);
      blade.updateMatrix();
      mesh.setMatrixAt(i, blade.matrix);

      for (let j = 0; j <= SEGMENTS; j++) {
        const t = j / SEGMENTS;
        const lag = 0.045 / reach + t * (evolved ? 0.44 : 0.56);
        const pastReach = reachAt(lag / (speed || 1));
        const width = 0.015 * (1 - t);
        shardDirection(radial, right, normal, angle - lag);
        for (let side = -1; side <= 1; side += 2) {
          pointAt(point, normal, radial, (pastReach + side * width) / radius);
          positions.setXYZ(
            vertex++,
            point.x * height,
            point.y * height,
            point.z * height
          );
        }
      }
    }
    positions.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh
        ref={blades}
        args={[art.base, undefined, MAX_SHARDS]}
        count={0}
        frustumCulled={false}
      >
        <meshBasicMaterial
          vertexColors
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </instancedMesh>
      <mesh geometry={art.trails} frustumCulled={false}>
        <meshBasicMaterial
          color={SECTOR_COLORS.opponent}
          vertexColors
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}
