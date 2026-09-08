// Run from any directory: node /absolute/path/to/validate_animation.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const require = createRequire(resolve(root, 'apps/web/package.json'));
const { AnimationMixer, LoopOnce, Vector3, Box3 } = await import(
  resolve(dirname(require.resolve('three')), 'three.module.js')
);
const { GLTFLoader } = await import(
  require.resolve('three/examples/jsm/loaders/GLTFLoader.js')
);
const bytes = fs.readFileSync(
  resolve(root, 'apps/web/public/models/hollow-legion/mite.glb')
);
const asset = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
  ''
);
const meshes = [],
  bones = new Map();
asset.scene.traverse((o) => {
  if (o.isSkinnedMesh) meshes.push(o);
  if (o.isBone) bones.set(o.name, o);
});
assert.equal(
  meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0),
  394
);
assert.equal(meshes.length, 2);
assert.equal(bones.size, 10);
assert.deepEqual(asset.animations.map((a) => a.name).sort(), [
  'Idle',
  'LeapAttack',
  'Run',
  'Walk',
]);
asset.scene.updateMatrixWorld(true);
for (const mesh of meshes) mesh.skeleton.update();
const size = new Box3().setFromObject(asset.scene).getSize(new Vector3());
assert.ok(size.y > 0.6 && size.y < 0.65, `Scale mismatch: ${size.y}`);

// POSITION is bind-pose geometry in meters. Skeleton.pose() is unnecessary and
// can change an unanimated root beneath the exported scaled non-bone parent.
const toes = {
  FL: [-0.98, 0.045, 0.965],
  FR: [0.98, 0.045, 0.965],
  RL: [-0.8, 0.045, -0.965],
  RR: [0.8, 0.045, -0.965],
};
const tips = Object.fromEntries(
  Object.entries(toes).map(([name, xyz]) => {
    const center = new Vector3(...xyz).multiplyScalar(0.45),
      vertices = [];
    for (const mesh of meshes)
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        const p = new Vector3().fromBufferAttribute(
          mesh.geometry.attributes.position,
          i
        );
        if (p.distanceTo(center) < 0.065 * 0.45) vertices.push([mesh, i]);
      }
    assert.ok(vertices.length >= 6, `${name} tip vertices missing`);
    return [name, vertices];
  })
);

const mixer = new AnimationMixer(asset.scene),
  checks = [];
for (const clip of asset.animations) {
  mixer.stopAllAction();
  const action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const isLeap = clip.name === 'LeapAttack';
  assert.equal(
    clip.duration,
    { Idle: 2, Walk: 1, Run: 0.5, LeapAttack: 1.25 }[clip.name]
  );
  const extrema = Object.fromEntries(
    Object.keys(tips).map((n) => [n, { min: Infinity, max: -Infinity }])
  );
  const snapshots = [];
  const rootSamples = [];
  const landingTips = [];
  const allFeetHeight = [];
  for (let i = 0; i <= 96; i++) {
    mixer.setTime((clip.duration * i) / 96);
    asset.scene.updateMatrixWorld(true);
    for (const mesh of meshes) mesh.skeleton.update();
    for (const [name, vertices] of Object.entries(tips)) {
      const ys = vertices.map(
        ([mesh, index]) =>
          mesh
            .getVertexPosition(index, new Vector3())
            .applyMatrix4(mesh.matrixWorld).y
      );
      assert.ok(ys.every(Number.isFinite));
      const lowest = Math.min(...ys);
      extrema[name].min = Math.min(extrema[name].min, lowest);
      extrema[name].max = Math.max(extrema[name].max, lowest);
      if (isLeap && i === 96) landingTips.push(lowest);
    }
    if (isLeap) {
      rootSamples.push(bones.get('Root').getWorldPosition(new Vector3()));
      allFeetHeight.push(
        Math.min(
          ...Object.values(tips).flatMap((vertices) =>
            vertices.map(
              ([mesh, index]) =>
                mesh
                  .getVertexPosition(index, new Vector3())
                  .applyMatrix4(mesh.matrixWorld).y
            )
          )
        )
      );
    }
    if (i === 0 || i === 96) {
      const rootPosition = isLeap
        ? bones.get('Root').getWorldPosition(new Vector3())
        : new Vector3();
      snapshots.push(
        [...bones.values()].flatMap((b) => {
          const matrix = b.matrixWorld.clone();
          matrix.elements[12] -= rootPosition.x;
          matrix.elements[13] -= rootPosition.y;
          matrix.elements[14] -= rootPosition.z;
          return matrix.toArray();
        })
      );
    }
  }
  const seamError = Math.max(
    ...snapshots[0].map((n, i) => Math.abs(n - snapshots[1][i]))
  );
  assert.ok(
    seamError < 1e-5,
    `${isLeap ? 'Recovered pose' : 'Loop seam'}: ${seamError}`
  );
  for (const foot of Object.values(extrema)) {
    assert.ok(foot.min > 0, 'Foot penetrates the floor');
    if (clip.name === 'Walk') assert.ok(foot.max > 0.075, 'Foot does not lift');
    else if (clip.name === 'Run')
      assert.ok(foot.max > 0.095, 'Running foot does not lift');
    else if (isLeap)
      assert.ok(foot.max > 0.22, 'Leaping foot does not clear the floor');
    else assert.ok(foot.max - foot.min < 0.001, 'Idle foot moves vertically');
  }
  let rootMotion;
  if (isLeap) {
    const delta = rootSamples.at(-1).clone().sub(rootSamples[0]);
    assert.ok(
      delta.distanceTo(new Vector3(0, 0, 1.2)) < 1e-5,
      'Wrong forward leap distance'
    );
    const apex = Math.max(...rootSamples.map((p) => p.y));
    assert.ok(apex > 0.175 && apex < 0.185, 'Wrong lunge height');
    assert.ok(
      Math.max(...allFeetHeight) > 0.22,
      'Feet are not airborne together'
    );
    assert.ok(
      landingTips.every((y) => Math.abs(y - 0.0036) < 0.001),
      'Feet did not settle after landing'
    );
    for (let i = 1; i < rootSamples.length; i++)
      assert.ok(
        rootSamples[i].z >= rootSamples[i - 1].z - 1e-6,
        'Leap moves backward'
      );
    rootMotion = {
      displacementYUp: delta.toArray(),
      apexMeters: apex,
      endpointHeld: true,
    };
  }
  checks.push({
    clip: clip.name,
    duration: clip.duration,
    tracks: clip.tracks.length,
    seamError,
    feet: extrema,
    ...(rootMotion && { rootMotion }),
  });
}
fs.writeFileSync(
  resolve(here, 'animation-validation.json'),
  JSON.stringify(
    {
      loader: 'Three.js GLTFLoader',
      triangles: 394,
      materials: 2,
      bones: 10,
      checks,
    },
    null,
    2
  ) + '\n'
);
console.log(
  'PASS: Idle + Walk + Run + LeapAttack; 394 triangles, 10 bones, ground clearance, loop seams, and a 1.2 m forward leap with landing recovery.'
);
