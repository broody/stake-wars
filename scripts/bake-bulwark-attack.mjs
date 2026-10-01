// Extract gameplay motion and shield bounds from the same GLB used to draw it.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'apps/web/package.json'));
const { GLTFLoader } = await import(
  require.resolve('three/examples/jsm/loaders/GLTFLoader.js')
);
const { AnimationMixer, LoopOnce, Vector3, Box3 } = await import(
  resolve(dirname(require.resolve('three')), 'three.module.js')
);
const bytes = fs.readFileSync(
  resolve(root, 'apps/web/public/models/hollow-legion/bulwark.glb')
);
const asset = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
  ''
);
const clip = asset.animations.find((c) => c.name === 'ShieldThrust');
const mixer = new AnimationMixer(asset.scene),
  action = mixer.clipAction(clip);
action.setLoop(LoopOnce, 1);
action.clampWhenFinished = true;
action.play();
const meshes = [];
let rootBone;
asset.scene.traverse((o) => {
  if (
    o.isSkinnedMesh &&
    o.skeleton.bones[o.geometry.attributes.skinIndex.getX(0)].name ===
      'LEquipmentSocket'
  )
    meshes.push(o);
  if (o.isBone && o.name === 'Root') rootBone = o;
});
if (meshes.length !== 2 || !rootBone)
  throw new Error('Missing shield primitives or Root');
const samples = [];
for (let f = 0; f <= 42; f++) {
  mixer.setTime(f / 24);
  asset.scene.updateMatrixWorld(true);
  const bounds = new Box3();
  for (const m of meshes) {
    m.skeleton.update();
    for (let i = 0; i < m.geometry.attributes.position.count; i++)
      bounds.expandByPoint(
        m.getVertexPosition(i, new Vector3()).applyMatrix4(m.matrixWorld)
      );
  }
  samples.push(
    [
      rootBone.getWorldPosition(new Vector3()).z,
      bounds.min.x,
      bounds.max.x,
      bounds.min.z,
      bounds.max.z,
    ].map((x) => Number(x.toFixed(7)))
  );
}
fs.writeFileSync(
  resolve(root, 'apps/web/src/game/survivors/bulwarkAttackData.json'),
  JSON.stringify(
    {
      fps: 24,
      duration: clip.duration,
      driveStart: 13 / 24,
      driveEnd: 22 / 24,
      activeStart: 16 / 24,
      activeEnd: 20 / 24,
      samples,
    },
    null,
    2
  ) + '\n'
);
console.log(
  'Baked 43 ShieldThrust samples: [rootZ, shield minX, maxX, minZ, maxZ]'
);
