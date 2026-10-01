import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  type InstancedMesh,
  type Material,
} from 'three';
import type { Run } from '../survivors/sim';
import { chord, type Vec3 } from '../survivors/sphere';

export const DEFEAT_ENEMY_OPACITY = 0.2;

/** Transparent enemies must not write depth over the opaque player corpse. */
export function setEnemyOpacity(
  material: Material | Material[],
  opacity: number,
  keepTransparent = false
) {
  for (const m of Array.isArray(material) ? material : [material]) {
    const transparent = keepTransparent || opacity < 1;
    if (m.transparent !== transparent) {
      m.transparent = transparent;
      m.needsUpdate = true;
    }
    m.depthWrite = !transparent;
    m.opacity = opacity;
  }
}

/** Only units overlapping the space occupied by the fallen trooper become ghosts. */
export function enemyDeathOpacity(
  run: Run,
  position: Vec3,
  bodyRadius: number
) {
  return run.status === 'fallen' &&
    chord(position, run.player.n) * run.groundRadius < 0.5 + bodyRadius
    ? DEFEAT_ENEMY_OPACITY
    : 1;
}

/** Per-instance alpha keeps distant units in the same draw batch fully visible. */
export function setEnemyInstanceOpacity(
  mesh: InstancedMesh,
  index: number,
  opacity: number
) {
  let attribute = mesh.geometry.getAttribute('enemySceneOpacity') as
    | InstancedBufferAttribute
    | undefined;
  if (!attribute) {
    attribute = new InstancedBufferAttribute(
      new Float32Array(mesh.instanceMatrix.count).fill(1),
      1
    );
    attribute.setUsage(DynamicDrawUsage);
    mesh.geometry.setAttribute('enemySceneOpacity', attribute);
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]) {
      const compile = material.onBeforeCompile;
      const key = material.customProgramCacheKey.bind(material);
      const previousKey = key();
      material.onBeforeCompile = (shader, renderer) => {
        compile.call(material, shader, renderer);
        shader.vertexShader =
          'attribute float enemySceneOpacity; varying float vEnemySceneOpacity;\n' +
          shader.vertexShader;
        // The atlas replaces begin_vertex itself, so assign at main entry instead.
        shader.vertexShader = shader.vertexShader.replace(
          'void main() {',
          'void main() {\n vEnemySceneOpacity = enemySceneOpacity;'
        );
        shader.fragmentShader =
          'varying float vEnemySceneOpacity;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          '#include <color_fragment>\n diffuseColor.a *= vEnemySceneOpacity;'
        );
      };
      material.customProgramCacheKey = () =>
        previousKey + '-local-defeat-opacity';
      material.needsUpdate = true;
    }
  }
  attribute.setX(index, opacity);
  attribute.needsUpdate = true;
}
