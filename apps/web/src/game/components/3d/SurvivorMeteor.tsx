import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { colors } from '../../../ui/tokens';
import { dropDistance, OPENING_CAMERA } from '../../survivors/openingCamera';
import { METEOR_RADIUS, MeteorShell } from '../../survivors/meteorShell';
import {
  surfaceRotation,
  useRenderer,
  type Renderer,
} from '../../survivors/renderFrame';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // The nose sits behind the shell, and +Y extends back up the flight path.
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, uv.y - 0.12, 0., 1.);
  }
`;

const fragmentShader = `
  uniform vec3 ember;
  uniform vec3 hot;
  uniform float age;
  uniform float glow;
  varying vec2 vUv;
  void main() {
    float tail = max(0., (vUv.y - 0.12) / 0.88);
    float drift = tail * (0.085 * sin(19. * tail - 11. * age) + 0.04 * sin(31. * tail + 7. * age));
    float width = mix(0.38, 0.025, tail);
    float x = (vUv.x - 0.5 - drift) / width;
    float nose = min(0., (vUv.y - 0.12) / 0.12);
    float r2 = x*x + nose*nose;
    float flame = exp(-3. * r2) * (1. - smoothstep(0., 1., tail)) * smoothstep(0., 0.065, vUv.y);
    float core = exp(-13. * r2 - 5. * tail);
    gl_FragColor = vec4(mix(ember, hot, core), glow * flame);
    #include <colorspace_fragment>
  }
`;

const planeNormal = new THREE.Vector3(0, 0, 1);
const eye = new THREE.Vector3(),
  side = new THREE.Vector3(),
  face = new THREE.Vector3();
const basis = new THREE.Matrix4();

/** A sealed fragment of the Core carries the hero down and fractures on landing. */
export function SurvivorMeteor({ registry }: { registry: Set<Renderer> }) {
  const shell = useMemo(() => new MeteorShell(), []);
  useEffect(() => () => shell.dispose(), [shell]);
  const plume =
    useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>>(null);
  const wave =
    useRef<THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>(null);
  const uniforms = useMemo(
    () => ({
      ember: { value: new THREE.Color(colors.accent.DEFAULT) },
      hot: { value: new THREE.Color(colors.warning.faint) },
      age: { value: 0 },
      glow: { value: 0 },
    }),
    []
  );

  useRenderer(registry, ({ orbit, openingAge: age = 0, radius, camera }) => {
    const flame = plume.current,
      ring = wave.current;
    if (!flame || !ring) return;
    const sinceImpact = age - OPENING_CAMERA.impact;
    flame.visible =
      !!orbit && age >= OPENING_CAMERA.release && sinceImpact < 0.18;
    ring.visible = !!orbit && sinceImpact >= 0 && sinceImpact < 0.68;
    if (!orbit) {
      shell.root.visible = false;
      return;
    }
    shell.pose(age);
    if (shell.root.visible) {
      surfaceRotation(shell.root.quaternion, orbit.normal, orbit.forward);
      shell.root.position
        .copy(orbit.normal)
        .multiplyScalar(radius + METEOR_RADIUS)
        .addScaledVector(orbit.trail, dropDistance(age, orbit, radius));
    }
    if (flame.visible) {
      const burn = THREE.MathUtils.smoothstep(
        age,
        OPENING_CAMERA.release,
        OPENING_CAMERA.impact
      );
      const quench = 1 - THREE.MathUtils.smoothstep(sinceImpact, 0, 0.18);
      flame.position
        .copy(shell.root.position)
        .addScaledVector(orbit.trail, METEOR_RADIUS * 0.8);
      eye.subVectors(camera.position, flame.position);
      side.crossVectors(orbit.trail, eye).normalize();
      face.crossVectors(side, orbit.trail);
      flame.quaternion.setFromRotationMatrix(
        basis.makeBasis(side, orbit.trail, face)
      );
      flame.scale.set(0.52 + 0.35 * burn, (0.8 + 1.8 * burn) * quench, 1);
      flame.material.uniforms.age.value = age;
      flame.material.uniforms.glow.value =
        quench *
        THREE.MathUtils.smoothstep(
          age,
          OPENING_CAMERA.release,
          OPENING_CAMERA.release + 0.16
        );
    }
    if (ring.visible) {
      const t = sinceImpact / 0.68;
      const reach = 0.08 + 1.15 * (1 - (1 - t) ** 2);
      // Keep the expanding circle on the curved ground.
      ring.position
        .copy(orbit.normal)
        .multiplyScalar(Math.sqrt(radius * radius - reach * reach) + 0.012);
      ring.quaternion.setFromUnitVectors(planeNormal, orbit.normal);
      ring.scale.setScalar(reach);
      ring.material.opacity = (1 - t) ** 2;
    }
  });

  return (
    <>
      <primitive object={shell.root} />
      <mesh ref={plume} visible={false} frustumCulled={false} renderOrder={5}>
        <planeGeometry />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={wave} visible={false} renderOrder={3}>
        <ringGeometry args={[0.93, 1, 80]} />
        <meshBasicMaterial
          color={colors.accent.soft}
          side={THREE.DoubleSide}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}
