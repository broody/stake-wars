import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Group, Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  VANGUARD,
  VanguardAnimation,
  vanguardUpperTrack,
} from './vanguardAnimation';
import { BladeAfterimage, sampleBlade } from '../survivors/bladeAfterimage';
import { SABER, saberClipTime } from '../survivors/saberAttack';

async function asset() {
  const bytes = readFileSync(
    new URL('../../../public/models/vanguard/vanguard.glb', import.meta.url)
  );
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    ''
  );
}

const attack = (side: number) => ({
  id: 1,
  startedAt: 0.4,
  duration: 0.75,
  side,
  forward: { x: 0, y: 0, z: 1 },
});

describe('Vanguard player animation', () => {
  it('splits the body at the waist: swings drive arms, sword and cape, never legs', async () => {
    const glb = await asset();
    const swing = glb.animations.find((c) => c.name === 'Attack')!;
    const bones = (upper: boolean) =>
      new Set(
        swing.tracks
          .filter((t) => vanguardUpperTrack(t) === upper)
          .map((t) => t.name.slice(0, t.name.lastIndexOf('.')))
      );
    for (const bone of ['chest', 'handR', 'weapon', 'cape00'])
      expect(bones(true)).toContain(bone);
    for (const bone of ['pelvis', 'thighL', 'shinR', 'footL', 'root'])
      expect(bones(false)).toContain(bone);
  });

  it('keeps the lightsaber core aligned with the slash trail on the right-hand socket', async () => {
    const { scene, animations } = await asset();
    const actor = new VanguardAnimation(scene, animations);
    const socket = actor.root.getObjectByName('weapon')!;
    expect(socket.parent?.name).toBe('handR');
    const saber = socket.getObjectByName('Vanguard_Lightsaber')!;
    const core = saber.children.find(
      (part): part is Mesh =>
        part instanceof Mesh && part.material.name === 'Saber incandescent core'
    )!;
    core.geometry.computeBoundingBox();
    const bounds = core.geometry.boundingBox!;
    for (const time of [0.1, 0.5, 0.75]) {
      actor.update(time, 0.7, attack(1));
      actor.root.updateMatrixWorld(true);
      const base = new Vector3();
      const tip = new Vector3();
      sampleBlade(socket, base, tip);
      for (const [y, target] of [
        [bounds.min.y, base],
        [bounds.max.y, tip],
      ] as const) {
        const endpoint = core.localToWorld(new Vector3(0, y, 0));
        expect(endpoint.distanceTo(target)).toBeLessThan(1e-5);
      }
    }
    actor.dispose();
  });

  it('leaves a short world-space ribbon at contact and clears it between cuts', async () => {
    const { scene } = await asset();
    const sword = scene.getObjectByName('weapon')!;
    const trail = new BladeAfterimage();
    const swing = attack(-1);
    const hit = swing.startedAt + SABER.impact;
    trail.sample(swing.startedAt, swing, sword);
    expect(trail.mesh.visible).toBe(false);
    trail.sample(hit - 0.04, swing, sword);
    const oldTip = new Vector3(0, 0.995, 0).applyMatrix4(sword.matrixWorld);
    scene.position.x += 0.15;
    trail.sample(hit, swing, sword);
    expect(trail.mesh.visible).toBe(true);
    const strip = trail.mesh.geometry.getAttribute('position');
    const at = (index: number) =>
      new Vector3().fromBufferAttribute(strip, index);
    expect(at(1).distanceTo(oldTip)).toBeLessThan(1e-5);
    expect(at(3).x - at(1).x).toBeCloseTo(0.15);
    trail.sample(hit, swing, sword);
    expect(trail.mesh.geometry.drawRange.count).toBe(6);
    trail.sample(hit + 0.2, swing, sword);
    expect(trail.mesh.visible).toBe(false);
    trail.sample(hit, attack(1), sword);
    expect(trail.mesh.visible).toBe(false);
    expect(trail.mesh.geometry.drawRange.count).toBe(0);
    trail.dispose();
  });

  it('keeps the running legs and their phase when either swing starts', async () => {
    const glb = await asset();
    const normal = new VanguardAnimation(glb.scene, glb.animations),
      attacking = new VanguardAnimation(glb.scene, glb.animations);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 70; i++) {
        const time = i / 60;
        normal.update(time, 0.7);
        attacking.update(time, 0.7, attack(side), Math.PI / 2);
        for (const name of ['thighL', 'shinR', 'footL', 'pelvis']) {
          const a = normal.root.getObjectByName(name),
            b = attacking.root.getObjectByName(name);
          expect(a, name).toBeDefined();
          expect(b!.matrixWorld.elements).toEqual(a!.matrixWorld.elements);
        }
        expect(attacking.gaitPhase).toBe(normal.gaitPhase);
      }
    }
    normal.dispose();
    attacking.dispose();
  });

  it('recoils away from either side at speed, then recovers the sampled pose', async () => {
    const glb = await asset();
    const runner = new VanguardAnimation(glb.scene, glb.animations);
    const shoulder = runner.root.getObjectByName('clavicleL')!;
    const foot = runner.root.getObjectByName('footL')!;
    const v = () => new Vector3();
    for (let i = 0; i < 60; i++) runner.update(i / 60, 0.77);
    runner.update(1, 0.77);
    const resting = shoulder.getWorldPosition(v()),
      planted = foot.getWorldPosition(v());
    const phase = runner.gaitPhase;
    const pose = (at: number, bearing: number) =>
      runner.update(1, 0.77, undefined, 0, 0, 1, 0, -1, -Infinity, {
        at,
        bearing,
        heavy: false,
      });
    for (const sign of [-1, 1]) {
      pose(0.93, (sign * Math.PI) / 2);
      const recoiled = shoulder.getWorldPosition(v());
      expect((recoiled.x - resting.x) * sign).toBeLessThan(-0.025);
      pose(0.93, (sign * Math.PI) / 2);
      expect(shoulder.getWorldPosition(v()).distanceTo(recoiled)).toBeLessThan(
        1e-6
      );
      expect(foot.getWorldPosition(v()).distanceTo(planted)).toBeLessThan(1e-6);
      expect(runner.gaitPhase).toBe(phase);
    }
    pose(0.6, 1);
    expect(shoulder.getWorldPosition(v()).distanceTo(resting)).toBeLessThan(
      1e-6
    );
    runner.dispose();
  });

  it('guards then extends the left palm with planted boots and returns to the sampled pose', async () => {
    const glb = await asset();
    const actor = new VanguardAnimation(glb.scene, glb.animations);
    const pos = (bone: string) =>
      actor.root.getObjectByName(bone)!.getWorldPosition(new Vector3());
    const pose = (age = -1) => actor.update(1, 0, undefined, 0, 0, 1, 0, age);
    pose();
    const boot = pos('footL'),
      rightBoot = pos('footR'),
      hand = pos('handL'),
      hip = pos('pelvis');
    pose(0.08);
    const guard = pos('handL');
    expect(guard.y).toBeGreaterThan(hand.y + 0.25);
    expect(pos('pelvis').y).toBeLessThan(hip.y - 0.1);
    pose(0.22);
    const palm = pos('handL');
    expect(palm.x).toBeGreaterThan(guard.x + 0.45);
    expect(pos('footL').distanceTo(boot)).toBeLessThan(0.002);
    expect(pos('footR').distanceTo(rightBoot)).toBeLessThan(0.002);
    pose(0.22);
    expect(pos('handL').distanceTo(palm)).toBeLessThan(1e-6);
    pose();
    expect(pos('handL').distanceTo(hand)).toBeLessThan(1e-6);
    actor.dispose();
  });

  it('scoops the free hand behind the hip and releases the charge in front of the shoulder', async () => {
    const glb = await asset();
    const actor = new VanguardAnimation(glb.scene, glb.animations);
    const hand = actor.root.getObjectByName('handL')!;
    const pose = (age: number) => {
      actor.update(1, 0, undefined, 0, 0, 1, 0, -1, age);
      return hand.getWorldPosition(new Vector3());
    };
    const idle = pose(-1);
    const scoop = pose(-0.14);
    const release = pose(0.02);
    expect(scoop.z).toBeLessThan(idle.z - 0.25);
    expect(release.y).toBeGreaterThan(scoop.y + 0.6);
    expect(release.z).toBeGreaterThan(scoop.z + 0.65);
    expect(pose(0.35).distanceTo(idle)).toBeLessThan(1e-6);
    actor.dispose();
  });

  it('keeps the running sword and stride on their tracks during a counter', async () => {
    const glb = await asset();
    const swing = new VanguardAnimation(glb.scene, glb.animations);
    const both = new VanguardAnimation(glb.scene, glb.animations);
    for (const side of [-1, 1]) {
      for (let frame = 0; frame < 66; frame++) {
        const time = frame / 60;
        swing.update(time, 0.7, attack(side), 0.7);
        both.update(time, 0.7, attack(side), 0.7, 0, time, 0, time - 0.5);
        for (const bone of ['weapon', 'footL', 'footR']) {
          expect(both.root.getObjectByName(bone)!.matrixWorld.elements).toEqual(
            swing.root.getObjectByName(bone)!.matrixWorld.elements
          );
        }
        if (frame === 43) {
          const hand = (actor: VanguardAnimation) =>
            actor.root
              .getObjectByName('handL')!
              .getWorldPosition(new Vector3());
          expect(hand(both).distanceTo(hand(swing))).toBeGreaterThan(0.3);
        }
      }
    }
    both.dispose();
    swing.dispose();
  });

  it('plants both boots through the standing backhand contact and releases to idle', async () => {
    const glb = await asset();
    const a = new VanguardAnimation(glb.scene, glb.animations);
    const position = (name: string) =>
      a.root.getObjectByName(name)!.getWorldPosition(new Vector3());
    const poses = [];
    for (let i = 0; i <= 72; i++) {
      const twist = a.update(i / 60, 0, attack(1), (-85 * Math.PI) / 180);
      poses.push({
        left: position('footL'),
        right: position('footR'),
        hips: position('pelvis'),
        twist,
      });
    }
    const idle = poses[24],
      loaded = poses[39],
      hit = poses[52];
    expect(
      Math.max(...poses.slice(25, 42).map((pose) => pose.right.y))
    ).toBeGreaterThan(idle.right.y + 0.06);
    expect(hit.left.distanceTo(idle.left)).toBeLessThan(0.002);
    expect(hit.right.y).toBeCloseTo(idle.right.y, 3);
    expect(hit.right.distanceTo(idle.right)).toBeGreaterThan(0.1);
    expect(hit.right.distanceTo(poses[49].right)).toBeLessThan(0.002);
    expect(hit.hips.x).toBeLessThan(loaded.hips.x - 0.05);
    expect(Math.abs(hit.twist)).toBeLessThan(Math.PI / 3);
    expect(poses[72].right.distanceTo(idle.right)).toBeLessThan(0.002);
    a.dispose();
  });

  it('catches a running reversal on the lower boot while the player keeps travelling', async () => {
    const glb = await asset();
    const a = new VanguardAnimation(glb.scene, glb.animations);
    const group = new Group();
    group.add(a.root);
    a.root.scale.setScalar(VANGUARD.scale);
    const feet = ['footL', 'footR'].map(
      (name) => a.root.getObjectByName(name)!
    );
    const position = (i: number) => feet[i].getWorldPosition(new Vector3());
    for (let i = 0; i <= 60; i++) {
      group.position.z = (i * 0.77) / 60;
      a.update(i / 60, 0.77);
    }
    const lower = position(0).y < position(1).y ? 0 : 1;
    const plant = position(lower);
    const before = a.gaitPhase;
    for (let i = 1; i <= 18; i++) {
      group.position.z -= 0.77 / 60;
      a.update(1 + i / 60, 0.77, undefined, 0, Math.PI);
      if (i === 1) expect(a.root.rotation.y).toBeLessThan(Math.PI / 4);
      if (i <= 3) expect(position(lower).distanceTo(plant)).toBeLessThan(0.01);
    }
    expect(a.root.rotation.y).toBeCloseTo(Math.PI);
    expect(a.gaitPhase).not.toBe(before);
    a.dispose();
  });

  it('falls from the live run or swing, holds prone, and recovers on restart', async () => {
    const glb = await asset();
    const a = new VanguardAnimation(glb.scene, glb.animations);
    const head = a.root.getObjectByName('head')!;
    const boot = a.root.getObjectByName('footR')!;
    for (const speed of [0.77, 0]) {
      for (let i = 0; i <= 48; i++) a.update(i / 60, speed, attack(1), -1.3);
      const live = boot.matrixWorld.clone();
      a.updateDeath(0);
      expect(boot.matrixWorld.elements).toEqual(live.elements);
      a.updateDeath(0.85);
      const kneeling = head.getWorldPosition(new Vector3()).y;
      a.updateDeath(3);
      const prone = head.getWorldPosition(new Vector3());
      expect(kneeling).toBeGreaterThan(prone.y + 0.5);
      expect(prone.y).toBeLessThan(0.4);
      a.updateDeath(4.5);
      expect(
        head.getWorldPosition(new Vector3()).distanceTo(prone)
      ).toBeLessThan(1e-6);
      a.update(0, 0);
      expect(head.getWorldPosition(new Vector3()).y).toBeGreaterThan(1.5);
    }
    a.dispose();
  });

  it('plays the backhand toward character-right and the forehand toward the left', async () => {
    const glb = await asset();
    const a = new VanguardAnimation(glb.scene, glb.animations);
    for (const [side, swing, other] of [
      [1, 'AttackBackhand', 'Attack'],
      [-1, 'Attack', 'AttackBackhand'],
    ] as const) {
      a.update(0, 0);
      a.update(0.7, 0, attack(side));
      expect(a.actions.get(`${swing}:upper`)!.getEffectiveWeight()).toBe(1);
      expect(a.actions.get(`${other}:upper`)!.getEffectiveWeight()).toBe(0);
    }
    a.dispose();
  });

  it("lands the clip's cut on the sim's impact", () => {
    for (const duration of [0.5, 0.65, 0.75])
      expect(
        saberClipTime(
          (SABER.impact / SABER.duration) * duration,
          duration,
          22 / 24,
          VANGUARD.impact
        )
      ).toBeCloseTo(VANGUARD.impact, 10);
    expect(saberClipTime(10, 0.75, 22 / 24, VANGUARD.impact)).toBeCloseTo(
      22 / 24,
      10
    );
  });

  it('steps one authored stride per Run cycle at the authored run speed', async () => {
    const glb = await asset();
    const a = new VanguardAnimation(glb.scene, glb.animations);
    const speed = VANGUARD.runSpeed * VANGUARD.scale;
    const run = glb.animations.find((c) => c.name === 'Run')!.duration;
    // Settle into the run, then time one cycle.
    for (let i = 0; i <= 120; i++) a.update(i / 60, speed);
    const start = a.gaitPhase;
    for (let i = 1; i <= 50; i++) a.update(2 + i / 60, speed);
    expect(((a.gaitPhase - start + 1) % 1) * run).toBeCloseTo(50 / 60, 2);
    a.dispose();
  });
});
