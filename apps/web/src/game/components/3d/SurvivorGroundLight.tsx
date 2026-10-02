import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { colors } from '../../../ui/tokens';
import { CORE_RADIUS } from '../../utils/sectorGeometry';
import { useRenderer, type Renderer } from '../../survivors/renderFrame';

/** A soft pool of light on the Core around the trooper. */
const GROUND_LIGHT = {
  /** Ground distance at which the light has faded out. */
  radius: 2.8,
  /** Brightness at the trooper, as a fraction of `color`. */
  strength: 0.16,
  color: colors.fg.DEFAULT,
} as const;

/** Just above the Core's faces, under everything that stands on it. */
const SHELL = CORE_RADIUS + 0.004;

const vertexShader = `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 center;
  uniform float arc;
  uniform vec3 color;
  varying vec3 vDirection;
  void main() {
    float angle = acos(clamp(dot(normalize(vDirection), center), -1.0, 1.0));
    float fade = 1.0 - smoothstep(0.0, 1.0, angle / arc);
    gl_FragColor = vec4(color * fade * fade, 1.0);
  }
`;

/** Lights the ground near the trooper so dark units stand out against it. */
export function SurvivorGroundLight({ registry }: { registry: Set<Renderer> }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          center: { value: new THREE.Vector3(0, 1, 0) },
          arc: { value: GROUND_LIGHT.radius / SHELL },
          color: {
            value: new THREE.Color(GROUND_LIGHT.color).multiplyScalar(
              GROUND_LIGHT.strength
            ),
          },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);

  useRenderer(registry, ({ normal }) => {
    material.uniforms.center.value.set(normal.x, normal.y, normal.z);
  });

  return (
    <mesh material={material} renderOrder={-1} raycast={() => undefined}>
      <sphereGeometry args={[SHELL, 96, 64]} />
    </mesh>
  );
}
