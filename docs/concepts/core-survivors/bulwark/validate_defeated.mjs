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
  resolve(root, 'apps/web/public/models/hollow-legion/bulwark.glb')
);
const before = await load(resolve(here, 'revisions/pre-defeated/bulwark.glb'));
for (const old of before.animations) {
  const clip = asset.animations.find((c) => c.name === old.name);
  assert.equal(clip.duration, old.duration);
  assert.equal(clip.tracks.length, old.tracks.length);
  for (let i = 0; i < old.tracks.length; i++) {
    assert.equal(clip.tracks[i].name, old.tracks[i].name);
    assert.deepEqual(clip.tracks[i].times, old.tracks[i].times);
    assert.equal(clip.tracks[i].values.length, old.tracks[i].values.length);
    clip.tracks[i].values.forEach((v, j) =>
      assert.ok(
        Math.abs(v - old.tracks[i].values[j]) < 1e-5,
        `Prior clip drift ${old.name} ${clip.tracks[i].name}`
      )
    );
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
assert.equal(bones.size, 18);
assert.equal(
  meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0),
  892
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
const groups = new Map();
for (const mesh of meshes) {
  const weights = mesh.geometry.getAttribute('skinWeight'),
    indices = mesh.geometry.getAttribute('skinIndex');
  for (let i = 0; i < weights.count; i++) {
    assert.ok(weights.getX(i) > 0.999 && weights.getY(i) === 0);
    const name = mesh.skeleton.bones[indices.getX(i)].name;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push([mesh, i]);
  }
}
assert.equal(groups.size, 16);
let minGround = Infinity,
  maxRigidError = 0,
  holdError = 0,
  finalHeight = 0;
const lengths = new Map(),
  initialCenters = new Map();
let settled;
for (let sample = 0; sample <= 150; sample++) {
  mixer.setTime(sample / 120);
  asset.scene.updateMatrixWorld(true);
  meshes.forEach((m) => m.skeleton.update());
  const all = [];
  for (const [name, entries] of groups) {
    const points = entries.map(([mesh, i]) =>
      mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld)
    );
    const center = points
      .reduce((c, p) => c.add(p), new Vector3())
      .divideScalar(points.length);
    if (sample === 0) initialCenters.set(name, center.clone());
    points.forEach((p, i) => {
      assert.ok(p.toArray().every(Number.isFinite));
      minGround = Math.min(minGround, p.y);
      const key = name + ':' + i,
        d = p.distanceTo(points[0]);
      if (sample === 0) lengths.set(key, d);
      maxRigidError = Math.max(maxRigidError, Math.abs(d - lengths.get(key)));
      if (sample === 150) finalHeight = Math.max(finalHeight, p.y);
      all.push(p);
    });
    if (sample === 150 && name !== 'LFoot' && name !== 'RFoot')
      assert.ok(
        center.distanceTo(initialCenters.get(name)) > 0.25,
        `${name} must fall away`
      );
  }
  assert.ok(bones.get('Root').getWorldPosition(new Vector3()).length() < 1e-6);
  if (sample === 130) settled = all;
  if (sample > 130)
    all.forEach(
      (p, i) => (holdError = Math.max(holdError, p.distanceTo(settled[i])))
    );
  if (sample === 150) {
    const shield = bones
      .get('LEquipmentSocket')
      .getWorldPosition(new Vector3());
    const hand = bones.get('LHand').getWorldPosition(new Vector3());
    assert.ok(shield.distanceTo(hand) > 1, 'Shield should separate from hand');
  }
}
assert.ok(minGround > -0.005, `Ground penetration ${minGround}`);
assert.ok(maxRigidError < 0.0001, `Deformed chunks ${maxRigidError}`);
assert.ok(holdError < 0.0001, `Moving final debris ${holdError}`);
assert.ok(finalHeight < 0.85, `Debris should fall to floor ${finalHeight}`);
const report = {
  clip: 'Defeated',
  duration: clip.duration,
  samples: 151,
  pieces: groups.size,
  minGround,
  maxRigidError,
  holdError,
  finalHeight,
  priorClipsPreservedWithinTolerance: 1e-5,
  geometryUnchanged: true,
};
fs.writeFileSync(
  resolve(here, 'defeated-validation.json'),
  JSON.stringify(report, null, 2) + '\n'
);
console.log(report);
