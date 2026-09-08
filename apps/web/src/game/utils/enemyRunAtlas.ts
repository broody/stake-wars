import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const RUN_FRAMES = 24;

export interface EnemyRunPart {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  texture: THREE.DataTexture;
}

/** Sample the authored rig once; the GPU interpolates poses for every instance. */
export function bakeEnemyRun(
  source: THREE.Object3D,
  animations: THREE.AnimationClip[],
  time: THREE.IUniform<number>
): EnemyRunPart[] {
  const scene = clone(source);
  const run = animations.find((clip) => clip.name === 'Run');
  if (!run) throw new Error('Enemy asset is missing its Run animation');
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) meshes.push(object);
  });
  if (meshes.length !== 2)
    throw new Error('Expected two Enemy material primitives');
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(run).play();
  const vertex = new THREE.Vector3();
  const parts = meshes.map((mesh) => {
    const geometry = mesh.geometry.clone();
    const count = geometry.getAttribute('position').count;
    const pixels = new Float32Array(count * RUN_FRAMES * 2 * 4);
    const texture = new THREE.DataTexture(
      pixels,
      count,
      RUN_FRAMES * 2,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    const material = (mesh.material as THREE.MeshStandardMaterial).clone();
    geometry.deleteAttribute('skinIndex');
    geometry.deleteAttribute('skinWeight');
    geometry.setAttribute(
      'enemyVertex',
      new THREE.Float32BufferAttribute(
        Float32Array.from(
          { length: count },
          (_, index) => (index + 0.5) / count
        ),
        1
      )
    );
    // The surface shader keeps the asset's vertex colors and emissive visor.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.enemyTime = time;
      shader.uniforms.enemyDuration = { value: run.duration };
      shader.uniforms.enemyRun = { value: texture };
      shader.vertexShader =
        `
        uniform float enemyTime;
        uniform float enemyDuration;
        uniform sampler2D enemyRun;
        attribute float enemyVertex;
        attribute vec2 enemyGait;
        vec3 sampleEnemyPose(float normalRow) {
          float phase = fract(enemyTime * enemyGait.y / enemyDuration + enemyGait.x) * ${RUN_FRAMES.toFixed(1)};
          float currentFrame = floor(phase);
          float nextFrame = mod(currentFrame + 1.0, ${RUN_FRAMES.toFixed(1)});
          float rowA = (currentFrame + normalRow * ${RUN_FRAMES.toFixed(1)} + 0.5) / ${(RUN_FRAMES * 2).toFixed(1)};
          float rowB = (nextFrame + normalRow * ${RUN_FRAMES.toFixed(1)} + 0.5) / ${(RUN_FRAMES * 2).toFixed(1)};
          return mix(texture2D(enemyRun, vec2(enemyVertex, rowA)).xyz,
                     texture2D(enemyRun, vec2(enemyVertex, rowB)).xyz, fract(phase));
        }
      ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <beginnormal_vertex>',
          'vec3 objectNormal = normalize(sampleEnemyPose(1.0));'
        )
        .replace(
          '#include <begin_vertex>',
          'vec3 transformed = sampleEnemyPose(0.0);'
        );
    };
    material.customProgramCacheKey = () => 'enemy-run-atlas-v1';
    return { geometry, material, texture };
  });

  for (let frame = 0; frame < RUN_FRAMES; frame++) {
    mixer.setTime((frame / RUN_FRAMES) * run.duration);
    scene.updateMatrixWorld(true);
    for (let part = 0; part < meshes.length; part++) {
      const mesh = meshes[part];
      mesh.skeleton.update();
      const { geometry, texture } = parts[part];
      const positions = geometry.getAttribute('position');
      const pixels = texture.image.data as Float32Array;
      for (let i = 0; i < positions.count; i++) {
        mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
        positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
        const offset = (frame * positions.count + i) * 4;
        pixels[offset] = vertex.x;
        pixels[offset + 1] = vertex.y;
        pixels[offset + 2] = vertex.z;
        pixels[offset + 3] = 1;
      }
      geometry.computeVertexNormals();
      const normals = geometry.getAttribute('normal');
      for (let i = 0; i < positions.count; i++) {
        const offset = ((RUN_FRAMES + frame) * positions.count + i) * 4;
        pixels[offset] = normals.getX(i);
        pixels[offset + 1] = normals.getY(i);
        pixels[offset + 2] = normals.getZ(i);
      }
    }
  }
  for (const part of parts) {
    part.texture.needsUpdate = true;
    part.geometry.computeBoundingSphere();
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
  for (const skeleton of new Set(meshes.map((mesh) => mesh.skeleton))) {
    skeleton.dispose();
  }
  return parts;
}
