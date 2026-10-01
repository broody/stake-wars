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
  const b = fs.readFileSync(path);
  return new GLTFLoader().parseAsync(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.length),
    ''
  );
}
const asset = await load(
  resolve(root, 'apps/web/public/models/hollow-legion/bulwark.glb')
);
const before = await load(resolve(here, 'revisions/v6/bulwark.glb'));
const collect = (a) => {
  const m = [];
  a.scene.traverse((o) => {
    if (o.isSkinnedMesh) m.push(o);
  });
  return m;
};
const meshes = collect(asset),
  oldMeshes = collect(before);
assert.equal(meshes.length, 4);
assert.equal(
  meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0),
  892
);
for (let i = 0; i < meshes.length; i++) {
  for (const key of Object.keys(oldMeshes[i].geometry.attributes))
    assert.deepEqual(
      meshes[i].geometry.attributes[key].array,
      oldMeshes[i].geometry.attributes[key].array,
      `Preserve ${key}`
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
for (const name of ['Walk', 'Run']) {
  const a = asset.animations.find((c) => c.name === name),
    b = before.animations.find((c) => c.name === name);
  assert.equal(a.duration, b.duration);
  assert.equal(a.tracks.length, b.tracks.length);
  for (let i = 0; i < a.tracks.length; i++) {
    assert.equal(a.tracks[i].name, b.tracks[i].name);
    // Centering changes only the left arm pose; locomotion timing/body stay intact.
    if (!/^L(UpperArm|Forearm|Hand|EquipmentSocket)\./.test(a.tracks[i].name)) {
      assert.deepEqual(a.tracks[i].times, b.tracks[i].times);
      // Disconnected edit bones permit breakup; old pose keys differ only by
      // floating-point rounding when Blender resamples the same motion.
      assert.equal(a.tracks[i].values.length, b.tracks[i].values.length);
      a.tracks[i].values.forEach((v, j) =>
        assert.ok(Math.abs(v - b.tracks[i].values[j]) < 1e-5)
      );
    }
  }
}
const bones = new Map();
asset.scene.traverse((o) => {
  if (o.isBone) bones.set(o.name, o);
});
const feet = [],
  shield = [];
for (const m of meshes)
  for (let i = 0; i < m.geometry.attributes.position.count; i++) {
    const name = m.skeleton.bones[m.geometry.attributes.skinIndex.getX(i)].name;
    if (name === 'RFoot' || name === 'LFoot') feet.push([m, i]);
    if (name === 'LEquipmentSocket') shield.push([m, i]);
  }
function refresh() {
  asset.scene.updateMatrixWorld(true);
  meshes.forEach((m) => m.skeleton.update());
}
const vertex = ([m, i]) =>
  m.getVertexPosition(i, new Vector3()).applyMatrix4(m.matrixWorld);
refresh();
const shieldBind = shield.map((v) =>
  vertex(v).applyMatrix4(
    bones.get('LEquipmentSocket').matrixWorld.clone().invert()
  )
);
const clip = asset.animations.find((c) => c.name === 'ShieldThrust');
assert.equal(clip.duration, 1.75);
const mixer = new AnimationMixer(asset.scene),
  action = mixer.clipAction(clip);
action.setLoop(LoopOnce, 1);
action.clampWhenFinished = true;
action.play();
mixer.setTime(0);
refresh();
const planted = feet.map(vertex);
const start = meshes.map((m) =>
  Array.from({ length: m.geometry.attributes.position.count }, (_, i) =>
    vertex([m, i])
  )
);
const lengths = [];
for (const side of ['R', 'L'])
  for (const chain of [
    ['UpperArm', 'Forearm'],
    ['Forearm', 'Hand'],
    ['UpperLeg', 'LowerLeg'],
    ['LowerLeg', 'Foot'],
  ]) {
    const a = bones.get(side + chain[0]),
      b = bones.get(side + chain[1]);
    lengths.push([
      a,
      b,
      a
        .getWorldPosition(new Vector3())
        .distanceTo(b.getWorldPosition(new Vector3())),
    ]);
  }
let minGround = Infinity,
  footDrift = 0,
  attachmentError = 0,
  jointLengthError = 0,
  seam = 0,
  previousRootZ = 0;
const rootPositions = [];
const shieldZ = [];
for (let s = 0; s <= 420; s++) {
  mixer.setTime((s / 420) * clip.duration);
  refresh();
  const rootPosition = bones.get('Root').getWorldPosition(new Vector3());
  rootPositions.push(rootPosition.z);
  assert.ok(
    Math.abs(rootPosition.x) < 1e-6 && Math.abs(rootPosition.y) < 1e-6,
    'Root only moves forward'
  );
  assert.ok(rootPosition.z >= previousRootZ - 1e-6, 'No root snap-back');
  previousRootZ = rootPosition.z;
  const frame = (s / 420) * 42;
  if (frame <= 13 || frame >= 22) {
    const landedOffset = new Vector3(0, 0, frame >= 22 ? 1.2 : 0);
    feet.forEach(
      (v, i) =>
        (footDrift = Math.max(
          footDrift,
          vertex(v).distanceTo(planted[i].clone().add(landedOffset))
        ))
    );
  }
  if (frame <= 13)
    assert.ok(Math.abs(rootPosition.z) < 1e-6, 'Hold position through windup');
  if (frame >= 22)
    assert.ok(
      Math.abs(rootPosition.z - 1.2) < 1e-6,
      'Retain landing position through recovery'
    );
  const inverse = bones.get('LEquipmentSocket').matrixWorld.clone().invert();
  shield.forEach(
    (v, i) =>
      (attachmentError = Math.max(
        attachmentError,
        vertex(v).applyMatrix4(inverse).distanceTo(shieldBind[i])
      ))
  );
  lengths.forEach(
    ([a, b, d]) =>
      (jointLengthError = Math.max(
        jointLengthError,
        Math.abs(
          a
            .getWorldPosition(new Vector3())
            .distanceTo(b.getWorldPosition(new Vector3())) - d
        )
      ))
  );
  for (let j = 0; j < meshes.length; j++)
    for (let i = 0; i < meshes[j].geometry.attributes.position.count; i++) {
      const v = vertex([meshes[j], i]);
      assert.ok(v.toArray().every(Number.isFinite));
      minGround = Math.min(minGround, v.y);
      if (s === 420)
        seam = Math.max(
          seam,
          v
            .clone()
            .sub(new Vector3(0, 0, 1.2))
            .distanceTo(start[j][i])
        );
    }
  shieldZ.push(shield.reduce((n, v) => n + vertex(v).z, 0) / shield.length);
}
assert.ok(minGround > 0, 'All mesh vertices stay above ground');
assert.ok(
  footDrift < 0.003,
  'Feet stay planted during windup and after landing, including interpolated frames'
);
assert.ok(attachmentError < 1e-5, 'Shield is rigid on its socket');
assert.ok(jointLengthError < 0.003, 'No joint stretching');
assert.ok(seam < 1e-5, 'Return to guard at the new position');
const forwardStroke = Math.max(...shieldZ) - Math.min(...shieldZ);
assert.ok(forwardStroke > 1.2, 'Clear forward thrust');
const report = {
  clip: clip.name,
  duration: clip.duration,
  impactSeconds: 0.75,
  samples: 421,
  triangles: 892,
  bones: bones.size,
  minGround,
  contactFootDrift: footDrift,
  attachmentError,
  jointLengthError,
  rebasedGuardError: seam,
  forwardStroke,
  rootTravel: rootPositions.at(-1),
  retainsLandingPosition: true,
  locomotionBodyAndTimingUnchanged: true,
  geometryUnchanged: true,
};
fs.writeFileSync(
  resolve(here, 'shield-thrust-validation.json'),
  JSON.stringify(report, null, 2) + '\n'
);
console.log(report);
