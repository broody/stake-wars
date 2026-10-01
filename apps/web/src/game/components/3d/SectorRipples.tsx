import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { colors } from '../../../ui/tokens';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';
import {
  RIPPLE,
  rippleHeight,
  rippleReach,
  type Ripple,
} from '../../survivors/ripple';
import { sectorCorner, sectorsWithin } from '../../survivors/sectors';
import { SIM_HZ } from '../../survivors/sim';
import {
  toVector,
  useRenderer,
  type Renderer,
} from '../../survivors/renderFrame';
import { vec3 } from '../../survivors/sphere';

/** Raised tiles share the breach panels' resting height above the Core. */
const SURFACE_INSET = 0.002;
/** Below this a tile reads as resting and is left to the Core. */
const MIN_LIFT = 0.003;
const CAPACITY = 1024;
const VERTICES = CAPACITY * 3;
const EDGE_VERTICES = CAPACITY * 6;
/**
 * How far a crest's edges and face tint toward the strike's light. Colors mix
 * in linear space, so the face stays faint or it reads as a grey slab.
 */
const EDGE_GLOW = 0.7;
const FACE_GLOW = 0.03;

const s = {
  corner: vec3(),
  points: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
  pivot: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  edgeA: new THREE.Vector3(),
  edgeB: new THREE.Vector3(),
  face: new THREE.Color(),
  line: new THREE.Color(),
  rest: new THREE.Color(SECTOR_COLORS.neutral),
  grid: new THREE.Color(SECTOR_COLORS.neutralGrid),
  light: new THREE.Color(colors.fg.DEFAULT),
};

function dynamic(count: number) {
  return new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(
    THREE.DynamicDrawUsage
  );
}

/** Orbital Strikes ripple the Sectors around each impact in rising rings. */
export function SectorRipples({ registry }: { registry: Set<Renderer> }) {
  const geometry = useMemo(() => {
    const tiles = new THREE.BufferGeometry();
    tiles.setAttribute('position', dynamic(VERTICES));
    tiles.setAttribute('color', dynamic(VERTICES));
    tiles.setDrawRange(0, 0);
    const edges = new THREE.BufferGeometry();
    edges.setAttribute('position', dynamic(EDGE_VERTICES));
    edges.setAttribute('color', dynamic(EDGE_VERTICES));
    edges.setDrawRange(0, 0);
    return { tiles, edges };
  }, []);
  useEffect(
    () => () => {
      geometry.tiles.dispose();
      geometry.edges.dispose();
    },
    [geometry]
  );
  // Each impact's neighborhood is found once; a ripple never moves.
  const reachOf = useRef(
    new WeakMap<Ripple, { sector: number; angle: number }[]>()
  );
  const lifts = useMemo(() => new Map<number, number>(), []);

  useRenderer(registry, ({ run, alpha, radius }) => {
    lifts.clear();
    let peak = 0;
    for (const ripple of run.ripples) {
      let near = reachOf.current.get(ripple);
      if (!near) {
        near = sectorsWithin(ripple.n, rippleReach(ripple.strength) / radius);
        reachOf.current.set(ripple, near);
      }
      const age = Math.max(0, ripple.age - (1 - alpha) / SIM_HZ);
      peak = Math.max(peak, RIPPLE.height * ripple.strength);
      for (const { sector, angle } of near) {
        const lift = rippleHeight(angle * radius, age, ripple.strength);
        // Where rings cross, the higher crest wins rather than stacking.
        if (lift > (lifts.get(sector) ?? 0)) lifts.set(sector, lift);
      }
    }
    const tile = geometry.tiles.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    const tileColor = geometry.tiles.getAttribute(
      'color'
    ) as THREE.BufferAttribute;
    const edge = geometry.edges.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    const edgeColor = geometry.edges.getAttribute(
      'color'
    ) as THREE.BufferAttribute;
    const base = radius - SURFACE_INSET;
    let count = 0;
    for (const [sector, lift] of lifts) {
      if (lift < MIN_LIFT) continue;
      if (count >= CAPACITY) break;
      s.pivot.set(0, 0, 0);
      for (let i = 0; i < 3; i++) {
        toVector(s.points[i], sectorCorner(s.corner, sector, i));
        s.points[i].multiplyScalar(base);
        s.pivot.addScaledVector(s.points[i], 1 / 3);
      }
      s.normal.copy(s.pivot).normalize();
      for (const point of s.points) point.addScaledVector(s.normal, lift);
      s.edgeA.subVectors(s.points[1], s.points[0]);
      s.edgeB.subVectors(s.points[2], s.points[0]);
      const [a, b, c] =
        s.edgeA.cross(s.edgeB).dot(s.normal) >= 0
          ? s.points
          : [s.points[0], s.points[2], s.points[1]];
      const glow = Math.min(1, lift / peak);
      s.face.copy(s.rest).lerp(s.light, glow * FACE_GLOW);
      s.line.copy(s.grid).lerp(s.light, glow * EDGE_GLOW);
      const v = count * 3;
      tile.setXYZ(v, a.x, a.y, a.z);
      tile.setXYZ(v + 1, b.x, b.y, b.z);
      tile.setXYZ(v + 2, c.x, c.y, c.z);
      for (let i = 0; i < 3; i++) s.face.toArray(tileColor.array, (v + i) * 3);
      const e = count * 6;
      for (let i = 0; i < 3; i++) {
        const from = s.points[i],
          to = s.points[(i + 1) % 3];
        edge.setXYZ(e + i * 2, from.x, from.y, from.z);
        edge.setXYZ(e + i * 2 + 1, to.x, to.y, to.z);
        s.line.toArray(edgeColor.array, (e + i * 2) * 3);
        s.line.toArray(edgeColor.array, (e + i * 2 + 1) * 3);
      }
      count++;
    }
    tile.needsUpdate = true;
    tileColor.needsUpdate = true;
    edge.needsUpdate = true;
    edgeColor.needsUpdate = true;
    geometry.tiles.setDrawRange(0, count * 3);
    geometry.edges.setDrawRange(0, count * 6);
  });

  return (
    <>
      <mesh
        geometry={geometry.tiles}
        frustumCulled={false}
        raycast={() => undefined}
      >
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
      <lineSegments
        geometry={geometry.edges}
        frustumCulled={false}
        raycast={() => undefined}
      >
        <lineBasicMaterial vertexColors toneMapped={false} />
      </lineSegments>
    </>
  );
}
