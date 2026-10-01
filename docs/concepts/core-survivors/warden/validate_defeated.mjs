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
const old = await load(resolve(here, 'revisions/pre-defeated/warden.glb'));
assert.deepEqual(
  asset.animations.map((c) => c.name),
  ['Guard', 'Walk', 'Run', 'StaffSlam', 'Defeated']
);
for (const prior of old.animations) {
  const now = asset.animations.find((c) => c.name === prior.name);
  assert.equal(now.duration, prior.duration);
  assert.equal(now.tracks.length, prior.tracks.length);
  for (let i = 0; i < prior.tracks.length; i++) {
    assert.equal(now.tracks[i].name, prior.tracks[i].name);
    assert.deepEqual(now.tracks[i].times, prior.tracks[i].times);
    assert.deepEqual(now.tracks[i].values, prior.tracks[i].values);
  }
}
const meshes = [],
  bones = new Map(),
  priorMeshes = [];
asset.scene.traverse((o) => {
  if (o.isSkinnedMesh) meshes.push(o);
  if (o.isBone) bones.set(o.name, o);
});
old.scene.traverse((o) => {
  if (o.isSkinnedMesh) priorMeshes.push(o);
});
assert.equal(bones.size, 25);
for (let i = 0; i < meshes.length; i++) {
  const a = meshes[i].geometry,
    b = priorMeshes[i].geometry;
  assert.deepEqual(a.index.array, b.index.array);
  for (const name of Object.keys(b.attributes))
    assert.deepEqual(
      a.attributes[name].array,
      b.attributes[name].array,
      'Original ' + name
    );
}
const refresh = () => {
  asset.scene.updateMatrixWorld(true);
  meshes.forEach((m) => m.skeleton.update());
};
const at = (n) => bones.get(n).getWorldPosition(new Vector3());
const point = (m, i) =>
  m.getVertexPosition(i, new Vector3()).applyMatrix4(m.matrixWorld);
const snapshot = () =>
  [...bones.values()]
    .flatMap((b) => b.matrixWorld.toArray())
    .concat(meshes.flatMap((m) => m.morphTargetInfluences ?? []));
const mixer = new AnimationMixer(asset.scene);
function play(name) {
  mixer.stopAllAction();
  const clip = asset.animations.find((c) => c.name === name),
    a = mixer.clipAction(clip);
  a.reset().setLoop(LoopOnce, 1);
  a.clampWhenFinished = true;
  a.play();
  mixer.setTime(0);
  refresh();
  return clip;
}
play('Guard');
const initial = snapshot();
const chains = ['R', 'L'].flatMap((s) => [
  [s + 'UpperArm', s + 'Forearm'],
  [s + 'Forearm', s + 'Hand'],
  [s + 'UpperLeg', s + 'LowerLeg'],
  [s + 'LowerLeg', s + 'Foot'],
]);
const lengths = chains.map(([a, b]) => at(a).distanceTo(at(b)));
const staff = meshes.filter(
  (m) =>
    m.skeleton.bones[m.geometry.attributes.skinIndex.getX(0)].name ===
    'REquipmentSocket'
);
const socket = bones.get('REquipmentSocket'),
  inverse = socket.matrixWorld.clone().invert();
const base = new Map();
for (const m of staff)
  for (let i = 0; i < m.geometry.attributes.position.count; i++) {
    const p = point(m, i);
    if (p.y < 0.0081)
      base.set(
        p
          .toArray()
          .map((x) => x.toFixed(5))
          .join(','),
        p
      );
  }
assert.ok(base.size > 3);
const tip = [...base.values()]
  .reduce((p, v) => p.add(v), new Vector3())
  .divideScalar(base.size);
const tipLocal = tip.clone().applyMatrix4(inverse);
const startHand = at('RHand').applyMatrix4(inverse);
const staffAxis = new Vector3(0, 1, 0).transformDirection(inverse);
const clip = play('Defeated');
assert.equal(clip.duration, 1.75);
assert.ok(
  Math.max(...snapshot().map((v, i) => Math.abs(v - initial[i]))) < 1e-5,
  'Begins at Guard'
);
let minGround = Infinity,
  maxStretch = 0,
  maxTipTravel = 0,
  maxLateralGripSlip = 0,
  hold = null,
  final = null;
const kneeHeights = [],
  sensorValues = [];
for (let k = 0; k <= 336; k++) {
  const t = k / 192;
  mixer.setTime(t);
  refresh();
  assert.ok(at('Root').length() < 1e-6, 'Root stays fixed');
  for (const m of meshes)
    for (let i = 0; i < m.geometry.attributes.position.count; i++) {
      const p = point(m, i);
      assert.ok(p.toArray().every(Number.isFinite));
      minGround = Math.min(minGround, p.y);
    }
  chains.forEach(([a, b], i) => {
    maxStretch = Math.max(
      maxStretch,
      Math.abs(at(a).distanceTo(at(b)) - lengths[i])
    );
  });
  maxTipTravel = Math.max(
    maxTipTravel,
    tipLocal.clone().applyMatrix4(socket.matrixWorld).distanceTo(tip)
  );
  const delta = at('RHand')
    .applyMatrix4(socket.matrixWorld.clone().invert())
    .sub(startHand);
  maxLateralGripSlip = Math.max(
    maxLateralGripSlip,
    delta.clone().addScaledVector(staffAxis, -delta.dot(staffAxis)).length()
  );
  if (k === 144)
    kneeHeights.push({
      time: t,
      right: at('RLowerLeg').y,
      left: at('LLowerLeg').y,
    });
  if (k === 288) hold = snapshot();
  if (k === 336) final = snapshot();
  const emissive = meshes.filter((m) => m.material.emissive.r > 0);
  assert.equal(emissive.length, 2);
  sensorValues.push(emissive.map((m) => m.morphTargetInfluences[0]));
  if (t >= 1.25)
    for (const m of emissive) {
      assert.ok(m.morphTargetInfluences[0] > 0.9999);
      const idx = m.geometry.index;
      for (let i = 0; i < idx.count; i += 3) {
        const a = point(m, idx.getX(i)),
          b = point(m, idx.getX(i + 1)),
          c = point(m, idx.getX(i + 2));
        assert.ok(
          b.sub(a).cross(c.sub(a)).length() < 1e-7,
          'Sensors fully extinguished'
        );
      }
    }
}
const settledError = Math.max(...hold.map((v, i) => Math.abs(v - final[i])));
const hipDrop = 1.52 - at('Hips').y;
console.log({
  minGround,
  maxStretch,
  maxTipTravel,
  maxLateralGripSlip,
  settledError,
  hipDrop,
  kneeHeights,
});
assert.ok(minGround >= 0, 'No floor penetration');
assert.ok(maxStretch < 1e-5, 'Rigid limb lengths');
assert.ok(maxTipTravel < 0.003, 'Staff base stays planted');
assert.ok(maxLateralGripSlip < 0.002, 'Fingers slide only along the shaft');
assert.ok(settledError < 1e-5, 'Stable final hold');
assert.ok(hipDrop > 0.65, 'Deep kneeling collapse');
assert.ok(
  kneeHeights[0].right < kneeHeights[0].left - 0.08,
  'Right knee buckles first'
);
assert.ok(
  sensorValues.some((v) => v.every((x) => x > 0.99)) &&
    sensorValues[0].every((x) => x === 0),
  'Sensor animation exported'
);
const report = {
  loader: 'Three.js GLTFLoader',
  samples: 337,
  duration_seconds: clip.duration,
  previous_clips_preserved: true,
  base_geometry_preserved: true,
  bones: 25,
  minimum_ground_m: minGround,
  max_limb_length_error_m: maxStretch,
  max_staff_tip_travel_m: maxTipTravel,
  max_lateral_grip_slip_m: maxLateralGripSlip,
  settled_pose_error: settledError,
  hip_drop_m: hipDrop,
  first_knee: kneeHeights[0],
  sensors_off_seconds: 1.25,
};
fs.writeFileSync(
  resolve(here, 'defeated-validation.json'),
  JSON.stringify(report, null, 2) + '\n'
);
console.log(
  'PASS: Warden defeat, previous clips, planted staff, rigid limbs, sequential knees, stable final hold, exported sensor shutoff.'
);
