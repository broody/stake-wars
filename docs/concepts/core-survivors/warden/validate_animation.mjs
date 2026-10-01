import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)),
  root = resolve(here, '../../../..');
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
  resolve(root, 'apps/web/public/models/hollow-legion/warden.glb')
);
const prior = await load(resolve(here, 'revisions/pre-animation/warden.glb'));
const meshes = [],
  bones = new Map(),
  oldMeshes = [];
asset.scene.traverse((o) => {
  if (o.isSkinnedMesh) meshes.push(o);
  if (o.isBone) bones.set(o.name, o);
});
prior.scene.traverse((o) => {
  if (o.isSkinnedMesh) oldMeshes.push(o);
});
assert.equal(meshes.length, oldMeshes.length);
for (let i = 0; i < meshes.length; i++) {
  const a = meshes[i].geometry,
    b = oldMeshes[i].geometry;
  assert.deepEqual(a.index.array, b.index.array, 'Mesh topology preserved');
  for (const name of Object.keys(a.attributes))
    assert.deepEqual(
      a.attributes[name].array,
      b.attributes[name].array,
      'Preserve geometry ' + name
    );
}
const guard = asset.animations.find((c) => c.name === 'Guard'),
  oldGuard = prior.animations.find((c) => c.name === 'Guard');
assert.equal(guard.tracks.length, oldGuard.tracks.length);
for (let i = 0; i < guard.tracks.length; i++) {
  assert.equal(guard.tracks[i].name, oldGuard.tracks[i].name);
  assert.deepEqual(
    guard.tracks[i].values,
    oldGuard.tracks[i].values,
    'Guard preserved'
  );
}
const refresh = () => {
  asset.scene.updateMatrixWorld(true);
  meshes.forEach((m) => m.skeleton.update());
};
const point = (m, i) =>
  m.getVertexPosition(i, new Vector3()).applyMatrix4(m.matrixWorld);
const at = (n) => bones.get(n).getWorldPosition(new Vector3());
refresh();
const all = [],
  staff = [],
  feet = [];
for (const m of meshes)
  for (let i = 0; i < m.geometry.attributes.position.count; i++) {
    const n = m.skeleton.bones[m.geometry.attributes.skinIndex.getX(i)].name;
    const s = { m, i, n };
    all.push(s);
    if (n === 'REquipmentSocket') staff.push(s);
    if (n === 'RFoot' || n === 'LFoot') feet.push(s);
  }
const chains = ['R', 'L'].flatMap((s) => [
  [s + 'UpperArm', s + 'Forearm'],
  [s + 'Forearm', s + 'Hand'],
  [s + 'UpperLeg', s + 'LowerLeg'],
  [s + 'LowerLeg', s + 'Foot'],
]);
const lengths = chains.map(([a, b]) => at(a).distanceTo(at(b)));
const socket = bones.get('REquipmentSocket');
const localStaff = staff.map((s) =>
  point(s.m, s.i).applyMatrix4(socket.matrixWorld.clone().invert())
);
const mixer = new AnimationMixer(asset.scene);
function play(clip) {
  mixer.stopAllAction();
  const action = mixer.clipAction(clip);
  action.reset().setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  mixer.setTime(0);
  refresh();
}
play(guard);
const guardMatrices = [...bones.values()].flatMap((b) =>
  b.matrixWorld.toArray()
);
const planted = feet.map((s) => point(s.m, s.i));
const reports = [];
for (const name of ['Walk', 'Run', 'StaffSlam']) {
  const clip = asset.animations.find((c) => c.name === name);
  play(clip);
  let minGround = Infinity,
    maxGripError = 0,
    maxStretch = 0,
    maxFeetMovement = 0,
    maxStaffHeight = 0,
    maxGuardError = 0;
  const sampleAt = (t) => {
    mixer.setTime(t);
    refresh();
  };
  for (let k = 0; k <= 192; k++) {
    sampleAt((k / 192) * clip.duration);
    assert.ok(at('Root').length() < 1e-6, 'Fixed root');
    for (const s of all) {
      const p = point(s.m, s.i);
      assert.ok(p.toArray().every(Number.isFinite));
      minGround = Math.min(minGround, p.y);
    }
    const inverse = socket.matrixWorld.clone().invert();
    staff.forEach((s, i) => {
      maxGripError = Math.max(
        maxGripError,
        point(s.m, s.i).applyMatrix4(inverse).distanceTo(localStaff[i])
      );
    });
    chains.forEach(([a, b], i) => {
      maxStretch = Math.max(
        maxStretch,
        Math.abs(at(a).distanceTo(at(b)) - lengths[i])
      );
    });
    if (name === 'StaffSlam') {
      feet.forEach((s, i) => {
        maxFeetMovement = Math.max(
          maxFeetMovement,
          point(s.m, s.i).distanceTo(planted[i])
        );
      });
      const staffHeight = Math.min(...staff.map((s) => point(s.m, s.i).y));
      maxStaffHeight = Math.max(maxStaffHeight, staffHeight);
      if (k === 0 || k === 192) {
        const values = [...bones.values()].flatMap((b) =>
          b.matrixWorld.toArray()
        );
        maxGuardError = Math.max(
          maxGuardError,
          ...values.map((v, i) => Math.abs(v - guardMatrices[i]))
        );
      }
    }
  }
  assert.ok(minGround > 0, name + ' floor clearance');
  assert.ok(maxGripError < 1e-5, name + ' rigid staff grip');
  assert.ok(maxStretch < 1e-5, name + ' mechanical limb lengths');
  const report = {
    name,
    min_ground_m: minGround,
    max_grip_error_m: maxGripError,
    max_limb_length_error_m: maxStretch,
  };
  if (name === 'StaffSlam') {
    assert.equal(clip.duration, 2);
    assert.ok(maxFeetMovement < 0.005, 'Planted slam feet');
    assert.ok(maxGuardError < 1e-4, 'Returns to Guard');
    assert.ok(
      maxStaffHeight > 0.63 && maxStaffHeight < 0.66,
      'Staff raised 64cm'
    );
    sampleAt(26 / 24);
    const impactHeight = Math.min(...staff.map((s) => point(s.m, s.i).y));
    assert.ok(
      impactHeight > 0 && impactHeight < 0.012,
      'Staff meets floor at impact'
    );
    Object.assign(report, {
      max_feet_movement_m: maxFeetMovement,
      guard_endpoint_error: maxGuardError,
      raised_staff_tip_m: maxStaffHeight,
      impact_seconds: 26 / 24,
      impact_tip_m: impactHeight,
    });
  }
  reports.push(report);
}
fs.writeFileSync(
  resolve(here, 'animation-validation.json'),
  JSON.stringify(
    {
      loader: 'Three.js GLTFLoader',
      samples_per_clip: 193,
      geometry_preserved: true,
      guard_preserved: true,
      reports,
    },
    null,
    2
  ) + '\n'
);
console.log(JSON.stringify(reports, null, 2));
console.log(
  'PASS: preserved model and Guard, rigid grip/limbs, ground clearance, planted slam, raised tip and impact timing.'
);
