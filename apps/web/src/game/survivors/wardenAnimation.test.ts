import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AnimationMixer, LoopOnce, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  WardenAnimation,
  createWardenWarningGeometry,
} from '../utils/wardenAnimation';
import { WARDEN_SLAM } from './wardenAttack';
import { WARDEN_DEFEAT } from './enemyDefeat';
async function asset() {
  const bytes = readFileSync(
    new URL('../../../public/models/hollow-legion/warden.glb', import.meta.url)
  );
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    ''
  );
}
describe('Warden animation integration', () => {
  it('draws its warning in front of the staff, matching the forward damage cone', () => {
    const geometry = createWardenWarningGeometry();
    const p = geometry.attributes.position;
    for (let i = 1; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i);
      expect(z).toBeGreaterThan(0);
      expect(Math.abs(Math.atan2(x, z))).toBeLessThanOrEqual(
        WARDEN_SLAM.halfAngle + 1e-6
      );
    }
    geometry.dispose();
  });
  it('ships all clips and matches the shared attack/death timing', async () => {
    const glb = await asset();
    expect(glb.animations.map((c) => c.name)).toEqual([
      'Guard',
      'Walk',
      'Run',
      'StaffSlam',
      'Defeated',
    ]);
    expect(glb.animations.find((c) => c.name === 'StaffSlam')!.duration).toBe(
      WARDEN_SLAM.duration
    );
    expect(glb.animations.find((c) => c.name === 'Defeated')!.duration).toBe(
      WARDEN_DEFEAT.duration
    );
    const mixer = new AnimationMixer(glb.scene);
    const action = mixer.clipAction(
      glb.animations.find((c) => c.name === 'StaffSlam')!
    );
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.setTime(WARDEN_SLAM.impact);
    glb.scene.updateMatrixWorld(true);
    const staff: SkinnedMesh[] = [];
    glb.scene.traverse((o) => {
      if (o instanceof SkinnedMesh) {
        o.skeleton.update();
        if (
          o.skeleton.bones[o.geometry.attributes.skinIndex.getX(0)].name ===
          'REquipmentSocket'
        )
          staff.push(o);
      }
    });
    const points = staff.flatMap((m) =>
      Array.from({ length: m.geometry.attributes.position.count }, (_, i) =>
        m.getVertexPosition(i, new Vector3()).applyMatrix4(m.matrixWorld)
      )
    );
    const bottom = points.filter((p) => p.y < 0.009);
    expect(bottom.length).toBeGreaterThan(5);
    expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(0.008, 4);
    expect(
      (Math.min(...bottom.map((p) => p.x)) +
        Math.max(...bottom.map((p) => p.x))) /
        2
    ).toBeCloseTo(WARDEN_SLAM.tipX, 4);
    expect(
      (Math.min(...bottom.map((p) => p.z)) +
        Math.max(...bottom.map((p) => p.z))) /
        2
    ).toBeCloseTo(WARDEN_SLAM.tipZ, 4);
  });
  it('selects both gaits, holds Guard at rest, freezes on pause, and samples the slam clock exactly', async () => {
    const glb = await asset(),
      actor = new WardenAnimation(glb.scene, glb.animations);
    actor.update({ time: 0, speed: 0.18, scale: 0.3 });
    actor.update({ time: 0.2, speed: 0.18, scale: 0.3 });
    expect(actor.actions.get('Walk')!.getEffectiveWeight()).toBe(1);
    expect(actor.actions.get('Walk')!.time).toBeCloseTo(0.2);
    actor.update({ time: 0.4, speed: 0.35, scale: 0.3 });
    expect(actor.actions.get('Run')!.getEffectiveWeight()).toBe(1);
    const before = actor.actions.get('Run')!.time;
    actor.update({ time: 0.4, speed: 0.35, scale: 0.3 });
    expect(actor.actions.get('Run')!.time).toBe(before);
    actor.update({ time: 0.6, speed: 0, scale: 0.3 });
    expect(actor.actions.get('Guard')!.getEffectiveWeight()).toBe(1);
    actor.update({
      time: 1.7,
      speed: 0,
      scale: 0.3,
      slamElapsed: WARDEN_SLAM.impact,
    });
    expect(actor.actions.get('StaffSlam')!.time).toBe(WARDEN_SLAM.impact);
    actor.dispose();
  });
  it('plays exported death morphs, holds the ending, fades, and isolates living copies', async () => {
    const glb = await asset(),
      dead = new WardenAnimation(glb.scene, glb.animations),
      living = new WardenAnimation(glb.scene, glb.animations);
    dead.update({ time: 0, speed: 0, scale: 0.3 });
    dead.update({ time: 1.5, speed: 0, scale: 0.3, defeatAge: 1.5 });
    living.update({ time: 1.5, speed: 0.18, scale: 0.3 });
    let sensors = 0;
    dead.root.traverse((o) => {
      if (o instanceof SkinnedMesh) {
        expect(o.morphTargetInfluences![0]).toBe(1);
        expect(o.material).not.toBe(
          (glb.scene.getObjectByName(o.name) as SkinnedMesh).material
        );
        expect((o.material as { opacity: number }).opacity).toBeLessThan(1);
        sensors++;
      }
    });
    expect(sensors).toBe(4);
    living.root.traverse((o) => {
      if (o instanceof SkinnedMesh) {
        expect(o.morphTargetInfluences![0]).toBe(0);
        expect((o.material as { opacity: number }).opacity).toBe(1);
      }
    });
    dead.update({ time: 2.5, speed: 0, scale: 0.3, defeatAge: 2.5 });
    expect(dead.actions.get('Defeated')!.time).toBe(WARDEN_DEFEAT.duration);
    dead.root.traverse((o) => {
      if (o instanceof SkinnedMesh)
        expect((o.material as { opacity: number }).opacity).toBe(0);
    });
    dead.dispose();
    living.dispose();
  });
});
