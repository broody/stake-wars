import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AnimationMixer, LoopOnce, Vector3, type SkinnedMesh } from 'three';
import { bakeEnemyLocomotion } from '../utils/enemyRunAtlas';
import { BULWARK_ATTACK } from './bulwarkAttack';

it('matches gameplay samples to the GLB and removes root travel from all GPU attack poses', async () => {
  const bytes = readFileSync(
    new URL('../../../public/models/hollow-legion/bulwark.glb', import.meta.url)
  );
  const asset = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    ''
  );
  const meshes: SkinnedMesh[] = [];
  asset.scene.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) meshes.push(o as SkinnedMesh);
  });
  const parts = bakeEnemyLocomotion(
    asset.scene,
    asset.animations,
    { value: 0 },
    'Walk',
    'ShieldThrust'
  );
  const attack = asset.animations.find((c) => c.name === 'ShieldThrust')!;
  expect(attack.duration).toBe(BULWARK_ATTACK.duration);
  const mixer = new AnimationMixer(asset.scene),
    action = mixer.clipAction(attack);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  for (let frame = 0; frame <= 42; frame++) {
    mixer.setTime(frame / 24);
    asset.scene.updateMatrixWorld(true);
    const root = asset.scene
      .getObjectByName('Root')!
      .getWorldPosition(new Vector3());
    expect(root.z).toBeCloseTo(BULWARK_ATTACK.samples[frame][0], 6);
    let left = Infinity,
      right = -Infinity,
      near = Infinity,
      far = -Infinity;
    for (let j = 0; j < meshes.length; j++) {
      const mesh = meshes[j],
        part = parts[j];
      mesh.skeleton.update();
      const shield =
        mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.getX(0)].name ===
        'LEquipmentSocket';
      expect(part.texture.image.height).toBe(134);
      const count = mesh.geometry.attributes.position.count,
        pixels = part.texture.image.data as Float32Array;
      for (let i = 0; i < count; i++) {
        const position = mesh
          .getVertexPosition(i, new Vector3())
          .applyMatrix4(mesh.matrixWorld);
        if (shield) {
          left = Math.min(left, position.x);
          right = Math.max(right, position.x);
          near = Math.min(near, position.z);
          far = Math.max(far, position.z);
        }
        position.sub(root);
        const offset = ((24 + frame) * count + i) * 4;
        for (const [k, value] of position.toArray().entries())
          expect(pixels[offset + k]).toBeCloseTo(value, 5);
      }
    }
    for (const [i, value] of [left, right, near, far].entries())
      expect(value).toBeCloseTo(BULWARK_ATTACK.samples[frame][i + 1], 6);
  }
  parts.forEach((p) => {
    p.geometry.dispose();
    p.material.dispose();
    p.texture.dispose();
  });
});
