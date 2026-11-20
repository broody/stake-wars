import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { colors } from '../../../ui/tokens';
import {
  surfaceRotation,
  toVector,
  useRenderer,
  type Renderer,
} from '../../survivors/renderFrame';
import { SIM_HZ } from '../../survivors/sim';

const RAISE_SECONDS = 0.42;
const IMPACT_SECONDS = 0.53;
const BREAK_SECONDS = 0.54;

/** Six separate kite-shaped plates. The open crown clears the helmet and
 * the pointed bases taper in toward the legs. Local +Z faces outwards. */
function fieldGeometry() {
  const outline = [
    [0, 0.77, 0.68],
    [-0.34, 0.56, 0.83],
    [-0.4, 0.27, 0.84],
    [-0.23, -0.43, 0.72],
    [0, -0.85, 0.54],
    [0.23, -0.43, 0.72],
    [0.4, 0.27, 0.84],
    [0.34, 0.56, 0.83],
  ];
  const positions: number[] = [],
    centers: number[] = [],
    phases: number[] = [],
    interiors: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let plate = 0; plate < 6; plate++) {
    const yaw = ((plate + 0.5) * Math.PI) / 3;
    // Stagger neighbours so the hover never reads as a revolving ring.
    const phase = plate * Math.PI * (3 - Math.sqrt(5));
    const ridge = new THREE.Vector3(0, 0.19, 1).applyAxisAngle(up, yaw);
    const corners = outline.map(([x, y, z]) =>
      new THREE.Vector3(x, y, z).applyAxisAngle(up, yaw)
    );
    for (let i = 0; i < corners.length; i++) {
      for (const point of [
        ridge,
        corners[i],
        corners[(i + 1) % corners.length],
      ]) {
        positions.push(point.x, point.y, point.z);
        centers.push(ridge.x, ridge.y, ridge.z);
        phases.push(phase);
        interiors.push(point === ridge ? 1 : 0);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute(
    'cellCenter',
    new THREE.Float32BufferAttribute(centers, 3)
  );
  geometry.setAttribute(
    'hoverPhase',
    new THREE.Float32BufferAttribute(phases, 1)
  );
  geometry.setAttribute(
    'interior',
    new THREE.Float32BufferAttribute(interiors, 1)
  );
  geometry.computeVertexNormals();
  return geometry;
}

const vertexShader = `
  attribute vec3 cellCenter;
  attribute float interior, hoverPhase;
  uniform vec3 hitAt;
  uniform vec2 travel;
  uniform float clock, rise, impact, strength, fracture;
  varying float vInterior, vRelease, vHitSide, vFacetLight;
  varying vec3 vSurface, vNormal, vEye;

  vec3 rock(vec3 v, vec3 axis, float s, float c) {
    return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1. - c);
  }

  void main() {
    vSurface = position;
    vInterior = interior;
    // Each panel peels away in the order the fracture reaches it.
    vec3 outward = normalize(vec3(cellCenter.x, 0., cellCenter.z));
    vHitSide = smoothstep(-.12, .84, dot(outward, hitAt));
    float distanceToHit = length(outward - hitAt);
    float release = clamp((fracture - .19 * distanceToHit) / .65, 0., 1.);
    float variation = .5 + .5 * sin(dot(cellCenter, vec3(25.1, 41.3, 18.7)));
    // Each kite floats about its own ridge. Radial travel reads from above,
    // while the lift and bank separate the shoulders in a lower camera.
    vec3 tangent = vec3(outward.z, 0., -outward.x);
    float sway = sin(1.88 * clock + hoverPhase);
    float lift = sin(2.32 * clock - hoverPhase);
    float hover = smoothstep(0., 1., rise);
    vec3 axis = normalize(tangent + .65 * cos(hoverPhase) * outward);
    float angle = hover * (.18 * sin(2.06 * clock + hoverPhase) + .05 * sway);
    float s = sin(angle), c = cos(angle);
    vec3 offset = outward * (.105 * sway) + tangent * (.048 * lift);
    offset.y = .09 + .105 * lift;
    vec3 p = cellCenter + hover * offset + rock(position - cellCenter, axis, s, c)
           * (1. - release * (.66 + .32 * variation));
    float flex = exp(-4. * dot(position - hitAt, position - hitAt))
                 * sin(impact * 13.) * exp(-5. * impact) * (1. - impact);
    p *= 1. - .13 * strength * flex;
    p += cellCenter * release * (.22 + .40 * variation);
    p.y -= release * release * (.18 + .38 * variation);
    p.xz *= 1. - .14 * (1. - rise) * (1. - rise);
    // The crown trails a moving Vanguard slightly while the base stays planted.
    p.xz -= travel * .045 * pow(.5 + .5 * position.y, 2.);
    vRelease = release;
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    vNormal = normalMatrix * rock(outward, axis, s, c);
    vec3 facet = normalize(normalMatrix * rock(normal, axis, s, c));
    vFacetLight = max(0., dot(facet, vec3(-.48, .70, .53)));
    vEye = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;

const fragmentShader = `
  uniform vec3 ivory, amber, hitAt;
  uniform float clock, rise, impact, strength, charge, fracture;
  varying float vInterior, vRelease, vHitSide, vFacetLight;
  varying vec3 vSurface, vNormal, vEye;

  void main() {
    vec3 surface = normalize(vSurface);
    float height = .5 + .5 * vSurface.y;
    // Resting plates read edge-on. Those crossing the body are almost clear.
    float facing = abs(dot(normalize(vNormal), normalize(vEye)));
    float profile = 1. - smoothstep(.24, .84, facing);
    float aa = max(.014, fwidth(vInterior));
    float seam = 1. - smoothstep(.012, .012 + 1.45 * aa, vInterior);
    float bevel = exp(-13. * vInterior);
    float shoulder = smoothstep(.21, .62, vSurface.y);
    float sheen = .5 + .5 * cos(5. * height - 1.9 * clock + surface.z);
    // A short shoulder glint keeps the charged state legible from above.
    float shoulderGlint = exp(-80. * (vSurface.y - .52) * (vSurface.y - .52));
    // A soft bevel carries the thin outline down to gameplay scale.
    float edge = seam * (.038 + profile * (.128 + .075 * shoulder + .22 * shoulderGlint + .025 * sheen));
    float ready = .002 + .008 * profile
                + (edge + bevel * (.009 + .038 * profile)) * (.7 + .3 * charge);
    // Only the tilted facets catching the light pick up a little ivory.
    ready += (.009 + .042 * profile) * vFacetLight * vFacetLight;

    float behind = 1.38 * rise - .07 - height;
    float formed = smoothstep(-.07, .025, behind);
    float ignite = exp(-140. * behind * behind) * (1. - smoothstep(.86, 1., rise));
    // Only the struck side lights up. The travelling line outlasts the brief impact flash.
    float gap = length(surface - hitAt);
    float front = gap - 2.35 * impact;
    float ripple = exp(-58. * front * front - 1.5 * gap * gap) * (1. - impact);
    float bruise = exp(-6. * gap * gap - 8. * impact) * (1. - impact);
    float hit = strength * vHitSide * (ripple * (.24 + .54 * seam) + .52 * bruise);
    float breaking = smoothstep(0., .10, fracture) * (1. - vRelease);
    float alpha = ready * formed + ignite * (.065 + .32 * seam + .055 * profile)
                + hit + breaking * (.038 + .25 * bevel + .075 * vHitSide);
    alpha *= 1. - smoothstep(.12, 1., vRelease);
    if (!gl_FrontFacing) alpha *= .16;
    vec3 tint = mix(ivory, amber, clamp(vHitSide * (ripple + bruise) + .49 * breaking + .17 * ignite, 0., .85));
    gl_FragColor = vec4(tint, clamp(alpha, 0., 1.));
    #include <colorspace_fragment>
  }`;

/** A body-centred field. Hit bearings and animation clocks are sampled from
 * the sim, including when the action viewer pauses or scrubs backwards. */
export function AegisField({ registry }: { registry: Set<Renderer> }) {
  const mesh =
    useRef<THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>>(null);
  const geometry = useMemo(fieldGeometry, []);
  const initialUniforms = useMemo(
    () => ({
      ivory: { value: new THREE.Color(colors.fg.DEFAULT) },
      amber: { value: new THREE.Color(colors.accent.soft) },
      clock: { value: 0 },
      rise: { value: 0 },
      impact: { value: 1 },
      strength: { value: 1 },
      charge: { value: 1 },
      fracture: { value: 0 },
      hitAt: { value: new THREE.Vector3() },
      travel: { value: new THREE.Vector2() },
    }),
    []
  );
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const velocity = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useRenderer(registry, ({ run, alpha, radius, normal, forward, right }) => {
    const field = mesh.current;
    if (!field) return;
    const aegis = run.player.aegis;
    const time = run.time - (1 - alpha) / SIM_HZ;
    field.visible =
      !!aegis &&
      run.status !== 'fallen' &&
      (aegis.segments >= 1 || time - aegis.brokeAt < BREAK_SECONDS);
    if (!field.visible || !aegis) return;

    toVector(field.position, normal);
    surfaceRotation(field.quaternion, field.position, toVector(ahead, forward));
    field.position.multiplyScalar(radius + 0.234);
    const uniforms = field.material.uniforms;
    const { n, prev } = run.player;
    velocity
      .set(n.x - prev.x, n.y - prev.y, n.z - prev.z)
      .multiplyScalar(radius * SIM_HZ);
    uniforms.travel.value.set(-velocity.dot(right), velocity.dot(forward));
    uniforms.clock.value = time;
    uniforms.charge.value = aegis.segments / aegis.max;
    uniforms.rise.value = THREE.MathUtils.clamp(
      (time - aegis.raisedAt) / RAISE_SECONDS,
      0,
      1
    );
    uniforms.impact.value = THREE.MathUtils.clamp(
      (time - aegis.blockedAt) / IMPACT_SECONDS,
      0,
      1
    );
    uniforms.fracture.value =
      aegis.segments >= 1
        ? 0
        : THREE.MathUtils.clamp((time - aegis.brokeAt) / BREAK_SECONDS, 0, 1);
    uniforms.strength.value = aegis.heavyHit ? 1.55 : 1;
    uniforms.hitAt.value
      .set(Math.sin(aegis.hitBearing), 0.16, Math.cos(aegis.hitBearing))
      .normalize();
  });

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      visible={false}
      scale={[0.282, 0.258, 0.25]}
      frustumCulled={false}
      renderOrder={3}
      raycast={() => undefined}
    >
      <shaderMaterial
        uniforms={initialUniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        forceSinglePass
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}
