import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { colors } from '../../../ui/tokens';
import { useRenderer, type Renderer } from '../../survivors/renderFrame';
import { markedSectors, SectorMarkings } from '../../survivors/sectorMarkings';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';
import { SIM_HZ, type Zone, type Lob } from '../../survivors/sim';

const MAX_LOBS = 24;
const MAX_BURNS = 60;
const TRAIL = 5;
const EJECTA = 5;
const up = new THREE.Vector3(0, 1, 0);
const ember = new THREE.Color(colors.accent.DEFAULT);
const ivory = new THREE.Color(SECTOR_COLORS.opponent);
const graphite = new THREE.Color(colors.line.strong);
const steel = new THREE.Color(colors.fg.subtle);

// Two triangular armor plates separated by a narrow fuse recessed into the housing.
function chargeCasing() {
  const profile = [
    [0, -0.058, graphite],
    [0.047, -0.04, graphite],
    [0.055, -0.014, steel],
    [0.045, -0.01, graphite],
    [0.045, -0.005, ember],
    [0.062, 0.001, graphite],
    [0.061, 0.007, ivory],
    [0.046, 0.035, ivory],
    [0.019, 0.054, steel],
    [0, 0.058, graphite],
  ] as const;
  const shell = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    3
  );
  const geometry = shell.toNonIndexed();
  shell.dispose();
  geometry.computeVertexNormals();
  const pos = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const shades: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    // LatheGeometry emits two triangles per profile interval, per side.
    const band = Math.floor(i / 6) % (profile.length - 1);
    const color = profile[band + 1][2];
    const facet = 0.72 + 0.18 * normal.getX(i) + 0.1 * normal.getZ(i);
    shades.push(color.r * facet, color.g * facet, color.b * facet);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
  return geometry;
}

const burnFragment = `
  uniform vec3 groundTone, graphite, ember, ivory;
  void main() {
    // Clip the scorched faces to a shallow hexagonal cut inside the damage radius.
    vec2 p = abs(localGround);
    float r = max(p.x, dot(p, vec2(.5, .866))) / .866;
    float age = phase.x, remaining = phase.y;
    float grow = 1. - pow(1. - clamp(age / .17, 0., 1.), 2.);
    if (r > grow) discard;
    float aa = max(.008, fwidth(r));
    float cover = 1. - smoothstep(grow - aa, grow + .001, r);
    float fade = smoothstep(0., .43, remaining);
    float seam = sectorEdge();
    float impact = exp(-12. * abs(r - grow)) * (1. - smoothstep(.035, .25, age));
    // Damage ticks every .3 s. Let the exposed joints keep a little heat between ticks.
    float tick = 1. - smoothstep(0., .55, fract(age / .3));
    vec3 face = mix(groundTone, graphite, .25 + .70 * facet);
    vec3 joint = mix(ember, ivory, .12 * tick + .68 * impact);
    float lip = (1. - smoothstep(.012, .012 + aa, abs(r - .964))) * (.12 + .36 * facet);
    float heat = (.52 + .36 * tick) * seam + lip;
    vec3 tint = mix(face, joint, min(1., heat + impact));
    float alpha = (.40 + .18 * facet + .26 * seam + .26 * lip) * cover + .4 * impact;
    gl_FragColor = vec4(tint, fade * clamp(alpha, 0., .90));
    #include <colorspace_fragment>
  }`;

// Sample the same arc for the casing and its trailing cinders, including while scrubbing.
function flightPoint(
  out: THREE.Vector3,
  lob: Lob,
  t: number,
  radius: number,
  side: THREE.Vector3
) {
  const arc = 4 * t * (1 - t);
  out
    .copy(lob.from)
    .lerp(lob.to, t)
    .addScaledVector(side, (0.19 * lob.spread * arc) / radius)
    .normalize();
  return out.multiplyScalar(
    radius + 0.42 * (1 - t) + 0.02 * t + (0.49 + 0.07 * lob.spread) * arc
  );
}

export function SectorChargeEffects({ registry }: { registry: Set<Renderer> }) {
  const charges = useRef<THREE.InstancedMesh>(null);
  const cinders = useRef<THREE.InstancedMesh>(null);
  const shell = useMemo(chargeCasing, []);
  const patches = useMemo(
    () =>
      new SectorMarkings(2048, burnFragment, {
        graphite: { value: graphite },
        groundTone: { value: new THREE.Color(SECTOR_COLORS.neutral) },
        ember: { value: ember },
        ivory: { value: ivory },
      }),
    []
  );
  const neighborhoods = useMemo(
    () => new WeakMap<Zone, ReturnType<typeof markedSectors>>(),
    []
  );
  const s = useMemo(
    () => ({
      object: new THREE.Object3D(),
      spark: new THREE.Object3D(),
      head: new THREE.Vector3(),
      tail: new THREE.Vector3(),
      side: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      point: new THREE.Vector3(),
      tint: new THREE.Color(),
    }),
    []
  );

  useLayoutEffect(() => {
    for (const mesh of [charges.current!, cinders.current!]) {
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    // Allocate the colour attribute before Three compiles the cinder material.
    cinders.current!.setColorAt(0, ember);
    return () => {
      shell.dispose();
      patches.dispose();
    };
  }, [patches, shell]);

  useRenderer(registry, ({ run, alpha, radius }) => {
    const casings = charges.current!,
      sparks = cinders.current!;
    const { object, head, tail, side, tangent, point, tint } = s;
    const lag = (1 - alpha) / SIM_HZ;
    casings.count = sparks.count = 0;
    patches.begin(radius);
    for (const lob of run.lobs) {
      if (casings.count >= MAX_LOBS) break;
      const t = THREE.MathUtils.clamp((lob.age - lag) / lob.life, 0, 1);
      side.crossVectors(lob.from, lob.to).normalize();
      flightPoint(head, lob, t, radius, side);
      object.position.copy(head);
      object.quaternion.setFromUnitVectors(up, point.copy(head).normalize());
      object.rotateZ(0.7 + t * 5.8);
      object.rotateY(t * 4);
      object.scale.setScalar(1);
      object.updateMatrix();
      casings.setMatrixAt(casings.count++, object.matrix);

      // A tapered trace of the last 80 ms of flight, anchored to the moving charge.
      for (let i = 0; i < TRAIL; i++) {
        const previous = Math.max(0, t - ((i + 1) * 0.016) / lob.life);
        flightPoint(tail, lob, previous, radius, side);
        tangent.subVectors(head, tail);
        const length = tangent.length();
        if (length < 0.0001) break;
        const width = 0.016 * (1 - i / TRAIL);
        object.position.lerpVectors(head, tail, 0.5);
        object.quaternion.setFromUnitVectors(up, tangent.divideScalar(length));
        object.scale.set(width, length * 0.62, width);
        object.updateMatrix();
        sparks.setMatrixAt(sparks.count, object.matrix);
        sparks.setColorAt(
          sparks.count++,
          tint
            .copy(ivory)
            .lerp(steel, i / (TRAIL - 1))
            .multiplyScalar(1 - (0.72 * i) / TRAIL)
        );
        head.copy(tail);
        if (previous === 0) break;
      }
    }

    for (const zone of run.zones) {
      const age = Math.max(0, zone.age - lag);
      const seed = zone.n.x * 23 + zone.n.y * 13 + zone.n.z * 37;
      let faces = neighborhoods.get(zone);
      const chord = zone.radius / radius;
      if (!faces) {
        faces = markedSectors(zone.n, chord);
        neighborhoods.set(zone, faces);
      }
      patches.mark(faces, zone.n, chord, age, zone.life - age);
      object.position.copy(zone.n).multiplyScalar(radius);
      object.quaternion.setFromUnitVectors(up, point.copy(zone.n));
      if (age >= 0.37 || sparks.count + EJECTA > sparks.instanceMatrix.count)
        continue;
      // Fragments lift out of the surface on impact and fall back into the burn.
      for (let i = 0; i < EJECTA; i++) {
        const life = 0.28 + (0.09 * (i % 3)) / 2;
        const k = age / life;
        if (k >= 1) continue;
        const angle = seed + i * 2.39996;
        const reach = zone.radius * (0.13 + 0.95 * k);
        point.set(
          reach * Math.cos(angle),
          0.025 + (0.16 + (i % 3) * 0.035) * 4 * k * (1 - k),
          reach * Math.sin(angle)
        );
        tangent
          .set(
            Math.cos(angle) * zone.radius,
            0.68 * (1 - 2 * k),
            Math.sin(angle) * zone.radius
          )
          .normalize();
        const index = sparks.count++;
        tangent.applyQuaternion(object.quaternion);
        const size = 0.014 * (1 - k);
        const spark = s.spark;
        spark.position
          .copy(point)
          .applyQuaternion(object.quaternion)
          .add(object.position);
        spark.quaternion.setFromUnitVectors(up, tangent);
        spark.scale.set(size, size * 2.8, size);
        spark.updateMatrix();
        sparks.setMatrixAt(index, spark.matrix);
        sparks.setColorAt(
          index,
          tint.copy(i === 0 ? ember : ivory).lerp(graphite, k)
        );
      }
    }
    casings.instanceMatrix.needsUpdate = casings.count > 0;
    sparks.instanceMatrix.needsUpdate = sparks.count > 0;
    if (sparks.instanceColor)
      sparks.instanceColor.needsUpdate = sparks.count > 0;
    patches.flush();
  });

  return (
    <>
      <instancedMesh
        ref={charges}
        args={[shell, undefined, MAX_LOBS]}
        frustumCulled={false}
        raycast={() => undefined}
      >
        <meshBasicMaterial vertexColors toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={cinders}
        args={[undefined, undefined, MAX_LOBS * TRAIL + MAX_BURNS * EJECTA]}
        frustumCulled={false}
        raycast={() => undefined}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <primitive object={patches} />
    </>
  );
}
