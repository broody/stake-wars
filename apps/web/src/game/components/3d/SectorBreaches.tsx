import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { colors } from '../../../ui/tokens';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';
import {
  BREACH,
  breachAngle,
  breachHinge,
  MAX_BREACHES,
} from '../../survivors/breach';
import { sectorCorner } from '../../survivors/sectors';
import { SIM_HZ } from '../../survivors/sim';
import {
  toVector,
  useRenderer,
  type Renderer,
} from '../../survivors/renderFrame';
import { vec3 } from '../../survivors/sphere';

/** Panels rest just above the Core's face and below the enemies' feet. */
const SURFACE_INSET = 0.002;
const VERTICES = MAX_BREACHES * 6;

const s = {
  corner: vec3(),
  hinge: vec3(),
  axis: new THREE.Vector3(),
  pivot: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  points: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
  edgeA: new THREE.Vector3(),
  edgeB: new THREE.Vector3(),
  front: new THREE.Color(SECTOR_COLORS.neutral),
  back: new THREE.Color(colors.accent.DEFAULT),
};

/** Each spawn's Sector flips over to its accent face; the enemy rises onto it. */
export function SectorBreaches({ registry }: { registry: Set<Renderer> }) {
  const geometry = useMemo(() => {
    const panels = new THREE.BufferGeometry();
    panels.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(VERTICES * 3), 3).setUsage(
        THREE.DynamicDrawUsage
      )
    );
    // Each panel is two triangles: the Core face, then the reversed accent face.
    const color = new Float32Array(VERTICES * 3);
    for (let v = 0; v < VERTICES; v++)
      (v % 6 < 3 ? s.front : s.back).toArray(color, v * 3);
    panels.setAttribute('color', new THREE.BufferAttribute(color, 3));
    panels.setDrawRange(0, 0);
    const edges = new THREE.BufferGeometry();
    edges.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(VERTICES * 3), 3).setUsage(
        THREE.DynamicDrawUsage
      )
    );
    edges.setDrawRange(0, 0);
    return { panels, edges };
  }, []);
  useEffect(
    () => () => {
      geometry.panels.dispose();
      geometry.edges.dispose();
    },
    [geometry]
  );

  useRenderer(registry, ({ run, alpha, radius }) => {
    const panel = geometry.panels.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    const edge = geometry.edges.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    const r = radius - SURFACE_INSET;
    let count = 0;
    for (const breach of run.breaches) {
      if (count >= MAX_BREACHES) break;
      const age = Math.max(0, breach.age - (1 - alpha) / SIM_HZ);
      const angle = breachAngle(age);
      toVector(s.axis, breachHinge(s.hinge, breach.sector));
      s.pivot.set(0, 0, 0);
      for (let i = 0; i < 3; i++) {
        toVector(s.points[i], sectorCorner(s.corner, breach.sector, i));
        s.points[i].multiplyScalar(r);
        s.pivot.addScaledVector(s.points[i], 1 / 3);
      }
      s.normal.copy(s.pivot).normalize();
      // Wind the Core face outward at rest, whatever the Sector's own order;
      // the turn then carries it inward and brings the accent face up.
      s.edgeA.subVectors(s.points[1], s.points[0]);
      s.edgeB.subVectors(s.points[2], s.points[0]);
      const outward = s.edgeA.cross(s.edgeB).dot(s.normal) >= 0;
      // Turn the flat panel about its hinge, lifting it clear while edge-on.
      const lift = Math.sin(angle) * BREACH.lift;
      for (const point of s.points)
        point
          .sub(s.pivot)
          .applyAxisAngle(s.axis, angle)
          .add(s.pivot)
          .addScaledVector(s.normal, lift);
      const [a, b, c] = outward
        ? s.points
        : [s.points[0], s.points[2], s.points[1]];
      const v = count * 6;
      panel.setXYZ(v, a.x, a.y, a.z);
      panel.setXYZ(v + 1, b.x, b.y, b.z);
      panel.setXYZ(v + 2, c.x, c.y, c.z);
      panel.setXYZ(v + 3, a.x, a.y, a.z);
      panel.setXYZ(v + 4, c.x, c.y, c.z);
      panel.setXYZ(v + 5, b.x, b.y, b.z);
      for (let i = 0; i < 3; i++) {
        const from = s.points[i],
          to = s.points[(i + 1) % 3];
        edge.setXYZ(v + i * 2, from.x, from.y, from.z);
        edge.setXYZ(v + i * 2 + 1, to.x, to.y, to.z);
      }
      count++;
    }
    panel.needsUpdate = true;
    edge.needsUpdate = true;
    geometry.panels.setDrawRange(0, count * 6);
    geometry.edges.setDrawRange(0, count * 6);
  });

  return (
    <>
      <mesh
        geometry={geometry.panels}
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
        <lineBasicMaterial color={SECTOR_COLORS.neutralGrid} />
      </lineSegments>
    </>
  );
}
