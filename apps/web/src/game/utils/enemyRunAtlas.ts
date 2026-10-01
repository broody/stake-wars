import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const RUN_FRAMES = 24;

export interface EnemyRunPart {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  texture: THREE.DataTexture;
}

/** Sample the authored rig once; the GPU interpolates poses for every instance. */
export function bakeEnemyLocomotion(
  source: THREE.Object3D,
  animations: THREE.AnimationClip[],
  time: THREE.IUniform<number>,
  clipName: 'Walk' | 'Run' = 'Run',
  attackName?: 'ShieldThrust' | 'Defeated'
): EnemyRunPart[] {
  const scene = clone(source);
  const run = animations.find((clip) => clip.name === clipName);
  if (!run) throw new Error(`Enemy asset is missing its ${clipName} animation`);
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) meshes.push(object);
  });
  if (meshes.length === 0)
    throw new Error('Enemy asset has no skinned material primitives');
  const attack = attackName
    ? animations.find((clip) => clip.name === attackName)
    : undefined;
  if (attackName && !attack)
    throw new Error(`Enemy asset is missing its ${attackName} animation`);
  const defeated = attackName === 'Defeated';
  const attackFrames = attack ? Math.round(attack.duration * 24) + 1 : 0;
  const totalFrames = RUN_FRAMES + attackFrames;
  const root = scene.getObjectByName('Root');
  if (attack && !root) throw new Error('Attack asset is missing its Root bone');
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(run).play();
  const vertex = new THREE.Vector3();
  const parts = meshes.map((mesh) => {
    const geometry = mesh.geometry.clone();
    const count = geometry.getAttribute('position').count;
    const pixels = new Float32Array(count * totalFrames * 2 * 4);
    const texture = new THREE.DataTexture(
      pixels,
      count,
      totalFrames * 2,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    const material = (mesh.material as THREE.MeshStandardMaterial).clone();
    if (defeated) {
      material.transparent = true;
      material.depthWrite = false;
    }
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
    // Reuse instancing for independently timed one-shot attacks and locomotion.
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
        ${attack ? 'attribute vec3 enemyAttack; varying float vEnemySignal;' : ''}
        vec3 readEnemyPose(float normalRow, float frame, float nextFrame, float blend) {
          float rowA = (frame + normalRow * ${totalFrames.toFixed(1)} + 0.5) / ${(totalFrames * 2).toFixed(1)};
          float rowB = (nextFrame + normalRow * ${totalFrames.toFixed(1)} + 0.5) / ${(totalFrames * 2).toFixed(1)};
          return mix(texture2D(enemyRun, vec2(enemyVertex, rowA)).xyz,
                     texture2D(enemyRun, vec2(enemyVertex, rowB)).xyz, blend);
        }
        vec3 sampleEnemyPose(float normalRow) {
          float phase = fract(enemyTime * enemyGait.y / enemyDuration + enemyGait.x) * ${RUN_FRAMES.toFixed(1)};
          float currentFrame = floor(phase);
          vec3 walking = readEnemyPose(normalRow, currentFrame, mod(currentFrame + 1.0, ${RUN_FRAMES.toFixed(1)}), fract(phase));
          ${
            attack
              ? `
          float attackPhase = clamp(enemyAttack.x / ${attack.duration.toFixed(8)}, 0.0, 1.0) * ${(attackFrames - 1).toFixed(1)};
          float attackFrame = floor(attackPhase);
          vec3 striking = readEnemyPose(normalRow, ${RUN_FRAMES.toFixed(1)} + attackFrame,
            ${RUN_FRAMES.toFixed(1)} + min(attackFrame + 1.0, ${(attackFrames - 1).toFixed(1)}), fract(attackPhase));
          return mix(walking, striking, enemyAttack.y);`
              : 'return walking;'
          }
        }
      ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <beginnormal_vertex>',
          'vec3 objectNormal = normalize(sampleEnemyPose(1.0));'
        )
        .replace(
          '#include <begin_vertex>',
          'vec3 transformed = sampleEnemyPose(0.0);' +
            (attack ? 'vEnemySignal = enemyAttack.z;' : '')
        );
      if (attack) {
        shader.fragmentShader =
          'varying float vEnemySignal;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          defeated
            ? '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vEnemySignal;'
            : '#include <emissivemap_fragment>\n totalEmissiveRadiance *= 1.0 + vEnemySignal;'
        );
        if (defeated)
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            '#include <color_fragment>\n diffuseColor.a *= vEnemySignal;'
          );
      }
    };
    material.customProgramCacheKey = () =>
      `enemy-locomotion-${totalFrames}-${attackName ?? 'none'}-body-signal`;
    return { geometry, material, texture };
  });

  for (let frame = 0; frame < totalFrames; frame++) {
    if (attack && frame === RUN_FRAMES) {
      mixer.stopAllAction();
      const action = mixer.clipAction(attack);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
    }
    mixer.setTime(
      frame < RUN_FRAMES
        ? (frame / RUN_FRAMES) * run.duration
        : ((frame - RUN_FRAMES) / (attackFrames - 1)) * attack!.duration
    );
    // Simulation consumes root translation; stripping it prevents double movement.
    if (attack && frame >= RUN_FRAMES) root!.position.set(0, 0, 0);
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
        const offset = ((totalFrames + frame) * positions.count + i) * 4;
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
