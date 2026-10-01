import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const require = createRequire(resolve(root, 'apps/web/package.json'));
const { AnimationMixer, LoopOnce, Vector3 } = await import(
  resolve(dirname(require.resolve('three')), 'three.module.js')
);
const { GLTFLoader } = await import(
  require.resolve('three/examples/jsm/loaders/GLTFLoader.js')
);
async function load(path) {
  const bytes = fs.readFileSync(path);
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    ''
  );
}
const asset = await load(
  resolve(root, 'apps/web/public/models/hollow-legion/mite.glb')
);
const before = await load(resolve(here, 'revisions/pre-defeated/mite.glb'));
for (const old of before.animations) {
  const clip = asset.animations.find((c) => c.name === old.name);
  assert.equal(clip.duration, old.duration);
  assert.equal(clip.tracks.length, old.tracks.length);
  for (let i = 0; i < old.tracks.length; i++) {
    assert.equal(clip.tracks[i].name, old.tracks[i].name);
    assert.deepEqual(clip.tracks[i].times, old.tracks[i].times);
    assert.deepEqual(clip.tracks[i].values, old.tracks[i].values);
  }
}
const meshes = [],
  oldMeshes = [],
  bones = new Map();
asset.scene.traverse((o) => {
  if (o.isSkinnedMesh) meshes.push(o);
  if (o.isBone) bones.set(o.name, o);
});
before.scene.traverse((o) => {
  if (o.isSkinnedMesh) oldMeshes.push(o);
});
assert.equal(bones.size, 10);
assert.equal(
  meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0),
  394
);
for (let i = 0; i < meshes.length; i++) {
  for (const attr of Object.keys(oldMeshes[i].geometry.attributes))
    assert.deepEqual(
      meshes[i].geometry.attributes[attr].array,
      oldMeshes[i].geometry.attributes[attr].array
    );
  assert.deepEqual(
    meshes[i].geometry.index.array,
    oldMeshes[i].geometry.index.array
  );
  assert.deepEqual(
    meshes[i].skeleton.boneInverses.map((m) => m.elements),
    oldMeshes[i].skeleton.boneInverses.map((m) => m.elements)
  );
}
const clip = asset.animations.find((c) => c.name === 'Defeated');
assert.equal(clip.duration, 1.25);
const mixer = new AnimationMixer(asset.scene),
  action = mixer.clipAction(clip);
action.setLoop(LoopOnce, 1);
action.clampWhenFinished = true;
action.play();
let minGround = Infinity,
  maxLengthError = 0,
  initialBody,
  finalBody,
  initialWidth,
  finalWidth,
  settled,
  holdError = 0;
const lengths = new Map();
for (let sample = 0; sample <= 150; sample++) {
  const time = sample / 120;
  mixer.setTime(time);
  asset.scene.updateMatrixWorld(true);
  meshes.forEach((m) => m.skeleton.update());
  const points = [];
  for (const m of meshes)
    for (let i = 0; i < m.geometry.attributes.position.count; i++) {
      const v = m
        .getVertexPosition(i, new Vector3())
        .applyMatrix4(m.matrixWorld);
      assert.ok(v.toArray().every(Number.isFinite));
      minGround = Math.min(minGround, v.y);
      points.push(v);
    }
  for (const b of bones.values())
    if (b.parent?.isBone) {
      const d = b
        .getWorldPosition(new Vector3())
        .distanceTo(b.parent.getWorldPosition(new Vector3()));
      if (sample === 0) lengths.set(b.name, d);
      // Body's translation is intentionally animated; all leg segments stay rigid.
      if (b.name !== 'Body')
        maxLengthError = Math.max(
          maxLengthError,
          Math.abs(d - lengths.get(b.name))
        );
    }
  assert.ok(bones.get('Root').getWorldPosition(new Vector3()).length() < 1e-6);
  const body = bones.get('Body').getWorldPosition(new Vector3()).y;
  const width =
    Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
  if (sample === 0) {
    initialBody = body;
    initialWidth = width;
  }
  if (sample === 100) settled = points;
  if (sample > 100)
    points.forEach(
      (p, i) => (holdError = Math.max(holdError, p.distanceTo(settled[i])))
    );
  if (sample === 150) {
    finalBody = body;
    finalWidth = width;
  }
}
assert.ok(minGround > -0.0005, `Ground penetration: ${minGround}`);
assert.ok(maxLengthError < 0.001, `Joint stretch: ${maxLengthError}`);
assert.ok(initialBody - finalBody > 0.12, 'Body should collapse visibly');
assert.ok(finalWidth > initialWidth * 1.18, 'Legs should spread wider');
assert.ok(holdError < 1e-5, 'Hold the final fallen pose');
const report = {
  clip: 'Defeated',
  duration: clip.duration,
  samples: 151,
  minGround,
  maxLengthError,
  bodyDrop: initialBody - finalBody,
  initialWidth,
  finalWidth,
  holdError,
  priorClipsUnchanged: true,
  geometryUnchanged: true,
};
fs.writeFileSync(
  resolve(here, 'defeated-validation.json'),
  JSON.stringify(report, null, 2) + '\n'
);
console.log(report);
