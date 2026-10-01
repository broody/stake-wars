import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const require = createRequire(resolve(root, 'apps/web/package.json'));
const { Vector3, Box3, InstancedMesh, AnimationMixer } = await import(
  resolve(dirname(require.resolve('three')), 'three.module.js')
);
const { GLTFLoader } = await import(
  require.resolve('three/examples/jsm/loaders/GLTFLoader.js')
);
const stats = JSON.parse(fs.readFileSync(resolve(here, 'asset-stats.json')));
const reports = [],
  bounds = [];
for (const filename of [
  'warden.glb',
  'warden-instanced.glb',
  'warden-staff.glb',
]) {
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
  assert.equal(json.meshes.length, filename === 'warden.glb' ? 2 : 1);
  assert.equal(meshes.length, filename === 'warden.glb' ? 4 : 2);
  assert.equal(json.materials.length, 2);
  assert.equal(json.images?.length ?? 0, 0);
  assert.deepEqual(
    asset.animations.map((c) => c.name),
    filename === 'warden.glb'
      ? ['Guard', 'Walk', 'Run', 'StaffSlam', 'Defeated']
      : []
  );
  const triangles = meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0);
  assert.equal(
    triangles,
    filename === 'warden-staff.glb'
      ? stats.staff_triangles
      : filename === 'warden.glb'
        ? stats.equipped_triangles
        : stats.triangles
  );
  assert.ok(
    meshes.some((m) => m.material.vertexColors && m.geometry.attributes.color)
  );
  assert.ok(meshes.some((m) => m.material.emissive.r > 0));
  asset.scene.updateMatrixWorld(true);
  meshes.forEach((m) => {
    assert.ok(
      Array.from(m.geometry.attributes.position.array).every(Number.isFinite)
    );
    if (m.skeleton) m.skeleton.update();
  });
  const staffMeshes =
    filename === 'warden.glb'
      ? meshes.filter(
          (m) =>
            m.skeleton.bones[m.geometry.attributes.skinIndex.getX(0)].name ===
            'REquipmentSocket'
        )
      : [];
  const box = new Box3();
  for (const m of meshes.filter((m) => !staffMeshes.includes(m)))
    for (let i = 0; i < m.geometry.attributes.position.count; i++)
      box.expandByPoint(
        m.getVertexPosition(i, new Vector3()).applyMatrix4(m.matrixWorld)
      );
  const size = box.getSize(new Vector3());
  assert.ok(box.min.y > 0 && box.min.y < 0.02);
  if (filename !== 'warden-staff.glb') {
    assert.ok(size.x > 3.2 && size.x < 3.4);
    assert.ok(size.y > 3.5 && size.y < 3.7);
    bounds.push(size);
  }
  if (filename === 'warden.glb') {
    assert.equal(bones.size, 25);
    assert.ok(meshes.every((m) => m.isSkinnedMesh));
    for (const m of meshes) {
      const w = m.geometry.attributes.skinWeight;
      for (let i = 0; i < w.count; i++) {
        assert.equal(w.getX(i), 1);
        assert.equal(w.getY(i) + w.getZ(i) + w.getW(i), 0);
      }
    }
    for (const name of ['RHand', 'LHand']) {
      const p = bones.get(name).getWorldPosition(new Vector3());
      assert.ok(Math.abs(p.y - 2.31) < 1e-5, 'T-pose arms level');
    }
    // Exercise each independent cloak/skirt control, then the weapon-hand chain.
    for (const [driver, moving] of [
      ['LCape', 'LCape'],
      ['RSkirt', 'RSkirt'],
      ['SkirtCenter', 'SkirtCenter'],
      ['RForearm', 'RHand'],
    ]) {
      const joint = bones.get(driver);
      assert.ok(joint, driver);
      const samples = [];
      for (const m of meshes)
        for (let i = 0; i < m.geometry.attributes.position.count; i++) {
          const name =
            m.skeleton.bones[m.geometry.attributes.skinIndex.getX(i)].name;
          if (name === moving || name === 'LFoot')
            samples.push({
              m,
              i,
              name,
              point: m
                .getVertexPosition(i, new Vector3())
                .applyMatrix4(m.matrixWorld),
            });
        }
      assert.ok(samples.some((s) => s.name === moving));
      const q = joint.quaternion.clone();
      joint.rotation.z += 0.3;
      asset.scene.updateMatrixWorld(true);
      meshes.forEach((m) => m.skeleton.update());
      let maxMove = 0;
      for (const s of samples) {
        const d = s.m
          .getVertexPosition(s.i, new Vector3())
          .applyMatrix4(s.m.matrixWorld)
          .distanceTo(s.point);
        if (s.name === 'LFoot') assert.ok(d < 1e-6);
        else maxMove = Math.max(maxMove, d);
      }
      assert.ok(maxMove > 0.03, driver + ' should articulate');
      joint.quaternion.copy(q);
      asset.scene.updateMatrixWorld(true);
      meshes.forEach((m) => m.skeleton.update());
    }
    assert.ok(bones.has('REquipmentSocket') && bones.has('LEquipmentSocket'));
    assert.equal(staffMeshes.length, 2);
    const mixer = new AnimationMixer(asset.scene);
    mixer.clipAction(asset.animations[0]).play();
    mixer.setTime(0.5);
    asset.scene.updateMatrixWorld(true);
    meshes.forEach((m) => m.skeleton.update());
    const at = (name) => bones.get(name).getWorldPosition(new Vector3());
    const shoulder = at('RUpperArm'),
      elbow = at('RForearm'),
      wrist = at('RHand');
    assert.ok(Math.abs(shoulder.distanceTo(elbow) - 0.45) < 1e-5);
    assert.ok(Math.abs(elbow.distanceTo(wrist) - 0.41) < 1e-5);
    const bend = elbow.clone().sub(shoulder).angleTo(wrist.clone().sub(elbow));
    assert.ok(bend > 1.1 && bend < 1.8, 'Clear bent elbow');
    assert.ok(wrist.y > 1.9 && wrist.y < 2.1, 'Grip raised to chest height');
    const socket = bones.get('REquipmentSocket');
    const inverse = socket.matrixWorld.clone().invert();
    const points = staffMeshes.flatMap((m) =>
      Array.from({ length: m.geometry.attributes.position.count }, (_, i) => ({
        m,
        i,
        p: m.getVertexPosition(i, new Vector3()).applyMatrix4(m.matrixWorld),
      }))
    );
    const staffBox = new Box3().setFromPoints(points.map((s) => s.p));
    assert.ok(
      staffBox.min.y > 0 && staffBox.min.y < 0.02,
      'Staff tip meets ground'
    );
    assert.ok(
      staffBox.max.y > 3.7 && staffBox.max.y < 3.8,
      'Staff stays upright'
    );
    const local = points.map((s) => s.p.clone().applyMatrix4(inverse));
    bones.get('RForearm').rotation.z += 0.4;
    asset.scene.updateMatrixWorld(true);
    meshes.forEach((m) => m.skeleton.update());
    const movedInverse = socket.matrixWorld.clone().invert();
    points.forEach((s, i) =>
      assert.ok(
        s.m
          .getVertexPosition(s.i, new Vector3())
          .applyMatrix4(s.m.matrixWorld)
          .applyMatrix4(movedInverse)
          .distanceTo(local[i]) < 1e-5,
        'Staff follows hand rigidly'
      )
    );
  } else {
    assert.equal(bones.size, 0);
    assert.equal(json.skins?.length ?? 0, 0);
    for (const m of meshes) {
      const batch = new InstancedMesh(m.geometry, m.material, 2);
      batch.computeBoundingBox();
      assert.ok(
        [...batch.boundingBox.min, ...batch.boundingBox.max].every(
          Number.isFinite
        )
      );
      batch.dispose();
    }
  }
  reports.push({
    filename,
    bytes: bytes.length,
    triangles,
    materials: 2,
    primitives: meshes.length,
    bones: bones.size,
    dimensionsYUp: size.toArray(),
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
        'T-pose dimensions',
        'rigid single-bone weights',
        'independent cape and skirt controls',
        'hand articulation',
        'feet unchanged during posing',
        'matching static/rigged bounds',
        'emissive red sensors',
        'two materials per asset',
        'no texture dependencies',
        'separate staff export',
        'bent-arm Guard clip',
        'rigid staff socket attachment',
        'upright staff with ground contact',
      ],
    },
    null,
    2
  ) + '\n'
);
console.log(JSON.stringify(reports, null, 2));
console.log('PASS: rigged Warden, static instance asset, and separate staff.');
