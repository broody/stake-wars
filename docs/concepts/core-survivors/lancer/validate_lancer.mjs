import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const require = createRequire(resolve(root, 'apps/web/package.json'));
const { AnimationMixer, LoopOnce, Vector3, Box3, InstancedMesh } = await import(
  resolve(dirname(require.resolve('three')), 'three.module.js')
);
const { GLTFLoader } = await import(
  require.resolve('three/examples/jsm/loaders/GLTFLoader.js')
);
const reports = [],
  bounds = [];
for (const filename of ['lancer.glb', 'lancer-instanced.glb']) {
  const bytes = fs.readFileSync(
    resolve(root, 'apps/web/public/models/hollow-legion', filename)
  );
  const json = JSON.parse(
    bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()
  );
  const asset = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    ''
  );
  const meshes = [],
    bones = new Map();
  asset.scene.traverse((o) => {
    if (o.isMesh) meshes.push(o);
    if (o.isBone) bones.set(o.name, o);
  });
  assert.equal(json.scenes.length, 1);
  assert.equal(json.meshes.length, 1);
  assert.equal(meshes.length, 2);
  assert.equal(
    meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0),
    722
  );
  assert.ok(
    meshes.find((m) => m.material.vertexColors && m.geometry.attributes.color)
  );
  assert.ok(meshes.find((m) => m.material.emissive.r > 0));
  for (const m of meshes)
    assert.ok(
      Array.from(m.geometry.attributes.position.array).every(Number.isFinite)
    );
  asset.scene.updateMatrixWorld(true);
  for (const m of meshes) if (m.skeleton) m.skeleton.update();
  const box = new Box3().setFromObject(asset.scene),
    size = box.getSize(new Vector3());
  assert.ok(size.y > 1.91 && size.y < 1.93);
  assert.ok(box.min.y > 0.001 && box.min.y < 0.003);
  bounds.push(size);
  if (filename === 'lancer.glb') {
    assert.equal(bones.size, 17);
    assert.ok(meshes.every((m) => m.isSkinnedMesh));
    assert.deepEqual(
      asset.animations.map((a) => a.name),
      ['Idle']
    );
    assert.equal(asset.animations[0].duration, 2);
    assert.ok(
      bones
        .get('Muzzle')
        .getWorldPosition(new Vector3())
        .distanceTo(new Vector3(-0.385, 0.56, 0.3)) < 0.00001
    );
    const feet = [];
    for (const m of meshes)
      for (let i = 0; i < m.geometry.attributes.position.count; i++) {
        const boneName =
          m.skeleton.bones[m.geometry.attributes.skinIndex.getX(i)].name;
        if (boneName === 'RFoot' || boneName === 'LFoot')
          feet.push([
            m,
            i,
            m.getVertexPosition(i, new Vector3()).applyMatrix4(m.matrixWorld),
          ]);
      }
    assert.ok(feet.length > 10);
    const mixer = new AnimationMixer(asset.scene),
      action = mixer.clipAction(asset.animations[0]);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    const endpoints = [];
    for (const t of [0, 0.25, 0.5, 1, 1.5, 2]) {
      mixer.setTime(t);
      asset.scene.updateMatrixWorld(true);
      for (const m of meshes) m.skeleton.update();
      for (const [m, i, rest] of feet)
        assert.ok(
          m
            .getVertexPosition(i, new Vector3())
            .applyMatrix4(m.matrixWorld)
            .distanceTo(rest) < 0.00001
        );
      if (t === 0 || t === 2)
        endpoints.push(
          [...bones.values()].flatMap((b) => b.matrixWorld.toArray())
        );
    }
    assert.ok(
      Math.max(...endpoints[0].map((v, i) => Math.abs(v - endpoints[1][i]))) <
        0.00001
    );
  } else {
    assert.equal(bones.size, 0);
    assert.equal(asset.animations.length, 0);
    assert.ok(!json.skins?.length);
    for (const m of meshes) {
      assert.ok(!m.geometry.attributes.skinIndex);
      const batch = new InstancedMesh(
        m.geometry.clone().applyMatrix4(m.matrixWorld),
        m.material,
        300
      );
      batch.computeBoundingBox();
      assert.ok(
        [...batch.boundingBox.min, ...batch.boundingBox.max].every(
          Number.isFinite
        )
      );
    }
  }
  reports.push({
    filename,
    bytes: bytes.length,
    triangles: 722,
    materials: 2,
    bones: bones.size,
    dimensionsYUp: size.toArray(),
    clips: asset.animations.map((a) => a.name),
  });
}
assert.ok(bounds[0].distanceTo(bounds[1]) < 0.00001);
fs.writeFileSync(
  resolve(here, 'validation.json'),
  JSON.stringify(
    {
      loader: 'Three.js GLTFLoader',
      reports,
      checks: [
        'matching export bounds',
        'planted feet throughout Idle',
        'Idle seam',
        'muzzle socket',
        'vertex colors',
        'emissive sensors',
        'static instancing compatibility',
      ],
    },
    null,
    2
  ) + '\n'
);
console.log(
  'PASS: 722 triangles, two materials, matching static/rigged bounds, 17 bones, muzzle socket, planted-foot Idle, and instancing compatibility.'
);
