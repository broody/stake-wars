import * as THREE from 'three';
import { colors } from '../../ui/tokens';

/**
 * An edge glow for the dark Hollow Legion: surfaces turning away from the
 * camera light up, so each body reads as a clear silhouette against the black
 * Core while its faces stay dark.
 */
export const RIM_LIGHT = {
  color: colors.fg.secondary,
  /** Peak glow, as a fraction of `color`. */
  strength: 0.75,
  /** Higher keeps the glow to a thinner edge. */
  power: 2.6,
} as const;

/** Add the rim to a lit material, keeping any shader changes it already has. */
export function addRimLight(material: THREE.Material) {
  if (!(material instanceof THREE.MeshStandardMaterial)) return material;
  if (material.userData.rimLight) return material;
  material.userData.rimLight = true;
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey.bind(material);
  const color = new THREE.Color(RIM_LIGHT.color).multiplyScalar(
    RIM_LIGHT.strength
  );
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.rimColor = { value: color };
    shader.uniforms.rimPower = { value: RIM_LIGHT.power };
    shader.fragmentShader =
      'uniform vec3 rimColor;\nuniform float rimPower;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimFacing = 1.0 - abs(dot(normal, normalize(vViewPosition)));
        totalEmissiveRadiance += rimColor * pow(rimFacing, rimPower);`
      );
  };
  material.customProgramCacheKey = () => `${key()}-rim`;
  material.needsUpdate = true;
  return material;
}
