import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const require = createRequire(resolve(root, 'apps/web/package.json'));
const { Vector3, Box3, InstancedMesh } = await import(
  resolve(dirname(require.resolve('three')), 'three.module.js')
);
const { GLTFLoader } = await import(
  require.resolve('three/examples/jsm/loaders/GLTFLoader.js')
);
const stats = JSON.parse(fs.readFileSync(resolve(here, 'asset-stats.json')));
const reports = [],
  bounds = [];
for (const filename of ['bulwark.glb', 'bulwark-instanced.glb']) {
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
  assert.equal(json.meshes.length, filename === 'bulwark.glb' ? 2 : 1);
  assert.equal(meshes.length, filename === 'bulwark.glb' ? 4 : 2);
  assert.equal(json.materials.length, 2);
  const triangles = meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0);
  assert.equal(triangles, stats.triangles);
  assert.ok(
    triangles < 5000,
    'Keep the enemy under the initial 5k triangle budget'
  );
  assert.ok(
    meshes.some((m) => m.material.vertexColors && m.geometry.attributes.color)
  );
  assert.ok(meshes.some((m) => m.material.emissive.r > 0));
  assert.equal(json.images?.length ?? 0, 0);
  assert.deepEqual(
    asset.animations.map((clip) => clip.name),
    filename === 'bulwark.glb' ? ['Walk', 'Run', 'ShieldThrust', 'Defeated'] : []
  );
  asset.scene.updateMatrixWorld(true);
  for (const m of meshes) {
    assert.ok(
      Array.from(m.geometry.attributes.position.array).every(Number.isFinite)
    );
    if (m.skeleton) m.skeleton.update();
  }
  const box = new Box3().setFromObject(asset.scene),
    size = box.getSize(new Vector3());
  assert.ok(size.x > 3 && size.x < 4.5, 'T-pose span including shield');
  assert.ok(size.y > 1.8 && size.y < 2.5, 'T-pose height including shield');
  assert.ok(box.min.y > 0 && box.min.y < 0.03, 'Feet above the ground');
  bounds.push(size);
  if (filename === 'bulwark.glb') {
    assert.equal(bones.size, 18);
    assert.ok(bones.has('LEquipmentSocket') && bones.has('REquipmentSocket'));
    assert.ok(meshes.every((m) => m.isSkinnedMesh));
    for (const m of meshes) {
      const weights = m.geometry.attributes.skinWeight;
      for (let i = 0; i < weights.count; i++) {
        assert.ok(Math.abs(weights.getX(i) - 1) < 1e-6);
        assert.equal(weights.getY(i) + weights.getZ(i) + weights.getW(i), 0);
      }
    }
    // Exercise the hand chain: weighted hand vertices and the equipment socket
    // must move; foot vertices must remain fixed after forearm articulation.
    const samples = [];
    for (const m of meshes) {
      for (let i = 0; i < m.geometry.attributes.position.count; i++) {
        const name =
          m.skeleton.bones[m.geometry.attributes.skinIndex.getX(i)].name;
        if (
          name === 'LHand' ||
          name === 'LFoot' ||
          name === 'LEquipmentSocket'
        ) {
          samples.push({
            m,
            i,
            name,
            rest: m
              .getVertexPosition(i, new Vector3())
              .applyMatrix4(m.matrixWorld),
          });
        }
      }
    }
    assert.ok(
      samples.some((s) => s.name === 'LHand') &&
        samples.some((s) => s.name === 'LFoot') &&
        samples.some((s) => s.name === 'LEquipmentSocket')
    );
    const socket = bones.get('LEquipmentSocket');
    const socketRest = socket.getWorldPosition(new Vector3());
    bones.get('LForearm').rotation.z += 0.45;
    asset.scene.updateMatrixWorld(true);
    for (const m of meshes) m.skeleton.update();
    assert.ok(
      socket.getWorldPosition(new Vector3()).distanceTo(socketRest) > 0.05
    );
    for (const s of samples) {
      const distance = s.m
        .getVertexPosition(s.i, new Vector3())
        .applyMatrix4(s.m.matrixWorld)
        .distanceTo(s.rest);
      if (s.name === 'LFoot') assert.ok(distance < 1e-6);
      else assert.ok(distance > 0.05);
    }
  } else {
    assert.equal(bones.size, 0);
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
    triangles,
    materials: json.materials.length,
    primitives: meshes.length,
    bones: bones.size,
    dimensionsYUp: size.toArray(),
    clips: asset.animations.map((clip) => clip.name),
  });
}
assert.ok(bounds[0].distanceTo(bounds[1]) < 1e-5);
fs.writeFileSync(
  resolve(here, 'validation.json'),
  JSON.stringify(
    {
      loader: 'Three.js GLTFLoader',
      reports,
      checks: [
        'matching export bounds',
        'two materials',
        'vertex colors',
        'emissive sensors',
        'no textures',
        'rigid weights',
        'articulated hand and equipment socket',
        'separate shield rigidly follows left equipment socket',
        'planted feet during arm articulation',
        'static instancing compatibility',
      ],
    },
    null,
    2
  ) + '\n'
);
console.log(
  `PASS: ${stats.triangles} triangles, 18 bones, rigid articulation, equipment sockets, static instancing.`
);
