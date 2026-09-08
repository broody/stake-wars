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
const bytes = fs.readFileSync(
  resolve(root, 'apps/web/public/models/hollow-legion/lancer.glb')
);
const asset = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
  ''
);
const configs = JSON.parse(
  fs.readFileSync(resolve(here, 'asset-stats.json'))
).locomotion;
const meshes = [],
  bones = new Map(),
  feet = { R: [], L: [] };
asset.scene.traverse((object) => {
  if (object.isSkinnedMesh) meshes.push(object);
  if (object.isBone) bones.set(object.name, object);
});
const refresh = () => {
  asset.scene.updateMatrixWorld(true);
  for (const mesh of meshes) mesh.skeleton.update();
};
refresh();
for (const mesh of meshes)
  for (
    let index = 0;
    index < mesh.geometry.attributes.position.count;
    index++
  ) {
    const bone =
      mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.getX(index)].name;
    if (bone === 'RFoot' || bone === 'LFoot') feet[bone[0]].push([mesh, index]);
  }
const position = (name) => bones.get(name).getWorldPosition(new Vector3());
const lengths = Object.fromEntries(
  ['R', 'L'].map((side) => [
    side,
    [
      position(side + 'UpperLeg').distanceTo(position(side + 'LowerLeg')),
      position(side + 'LowerLeg').distanceTo(position(side + 'Foot')),
    ],
  ])
);
const mixer = new AnimationMixer(asset.scene);
const reports = [];
for (const name of ['Walk', 'Run']) {
  const clip = asset.animations.find((clip) => clip.name === name);
  const config = configs[name];
  assert.ok(clip && Math.abs(clip.duration - config.duration_seconds) < 1e-6);
  mixer.stopAllAction();
  const action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const contacts = new Map(),
    endpoints = [];
  let minGround = Infinity,
    maxContactHeightError = 0,
    maxSlide = 0,
    maxStretch = 0,
    flightSamples = 0;
  const maxLift = { R: 0, L: 0 };
  for (let sample = 0; sample <= 256; sample++) {
    const normalizedTime = sample / 256;
    const time = normalizedTime * clip.duration;
    mixer.setTime(time);
    refresh();
    assert.ok(
      position('Root').length() < 1e-6,
      'Locomotion must remain in place'
    );
    for (const mesh of meshes)
      for (
        let index = 0;
        index < mesh.geometry.attributes.position.count;
        index++
      ) {
        const v = mesh
          .getVertexPosition(index, new Vector3())
          .applyMatrix4(mesh.matrixWorld);
        assert.ok(v.toArray().every(Number.isFinite));
        minGround = Math.min(minGround, v.y);
      }
    let airborne = 0;
    for (const side of ['R', 'L']) {
      maxStretch = Math.max(
        maxStretch,
        Math.abs(
          position(side + 'UpperLeg').distanceTo(position(side + 'LowerLeg')) -
            lengths[side][0]
        ),
        Math.abs(
          position(side + 'LowerLeg').distanceTo(position(side + 'Foot')) -
            lengths[side][1]
        )
      );
      const verts = feet[side].map(([mesh, index]) =>
        mesh
          .getVertexPosition(index, new Vector3())
          .applyMatrix4(mesh.matrixWorld)
      );
      const minY = Math.min(...verts.map((v) => v.y));
      maxLift[side] = Math.max(maxLift[side], minY - 0.006);
      if (minY > 0.016) airborne++;
      const globalPhase = normalizedTime + (side === 'L' ? 0.5 : 0);
      const phase = globalPhase % 1;
      // Exclude one export frame adjacent to lift/landing transitions.
      const margin = 1 / (clip.duration * 24);
      if (phase >= margin && phase <= config.stance_fraction - margin) {
        maxContactHeightError = Math.max(
          maxContactHeightError,
          Math.abs(minY - 0.006)
        );
        const key = `${side}:${Math.floor(globalPhase)}`;
        const world = verts.map((v) =>
          v.add(new Vector3(0, 0, time * config.speed_mps))
        );
        if (!contacts.has(key)) contacts.set(key, world);
        else
          world.forEach((v, index) => {
            maxSlide = Math.max(
              maxSlide,
              v.distanceTo(contacts.get(key)[index])
            );
          });
      }
    }
    if (airborne === 2) flightSamples++;
    if (sample === 0 || sample === 256)
      endpoints.push(
        [...bones.values()].flatMap((bone) => bone.matrixWorld.toArray())
      );
  }
  const seam = Math.max(
    ...endpoints[0].map((value, index) => Math.abs(value - endpoints[1][index]))
  );
  const report = {
    name,
    duration: clip.duration,
    speed_mps: config.speed_mps,
    minimum_ground_m: minGround,
    max_contact_height_error_m: maxContactHeightError,
    max_contact_slide_m: maxSlide,
    max_leg_length_error_m: maxStretch,
    max_lift_m: maxLift,
    flight_samples: flightSamples,
    seam_error: seam,
  };
  reports.push(report);
  console.log(JSON.stringify(report));
  assert.ok(minGround >= 0, name + ' intersects the floor');
  assert.ok(maxContactHeightError < 0.005, name + ' has poor foot contact');
  assert.ok(maxSlide < 0.008, name + ' slides during planted stance');
  assert.ok(maxStretch < 0.00001, name + ' stretches its mechanical legs');
  assert.ok(seam < 0.00001, name + ' has an open loop seam');
  assert.ok(
    maxLift.R > config.foot_lift_m * 0.8 && maxLift.L > config.foot_lift_m * 0.8
  );
  if (name === 'Walk')
    assert.equal(flightSamples, 0, 'Walk loses both contacts');
  else assert.ok(flightSamples > 0, 'Run has no flight phase');
}
fs.writeFileSync(
  resolve(here, 'locomotion-validation.json'),
  JSON.stringify(
    { loader: 'Three.js GLTFLoader', samples_per_clip: 257, reports },
    null,
    2
  ) + '\n'
);
console.log(
  'PASS: in-place loops, planted contact, ground clearance, rigid leg lengths, and run flight phase.'
);
