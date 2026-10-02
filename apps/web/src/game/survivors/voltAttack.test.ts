import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AnimationMixer, LoopOnce, Vector3, type SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bakeEnemyLocomotion } from '../utils/enemyRunAtlas';
import {
  VOLT_LEAP,
  VOLT_IMPACT_TIME,
  VOLT_END_TIME,
  voltLeapClipTime,
  voltWarningCount,
  sampleVoltLeap,
} from './voltAttack';
import { createRun, spawnEnemy, tick, SIM_HZ } from './sim';
import { chord, pointAt, vec3 } from './sphere';
const dt = 1 / SIM_HZ;
const still = { x: 0, y: 0 };
function encounter() {
  const run = createRun(19, 5.006);
  run.weapons = [];
  run.spawnCredit = -1e6;
  run.eventIndex = 1000;
  const enemy = spawnEnemy(
    run,
    'volt',
    pointAt(vec3(), run.player.n, run.right, 0.8 / run.groundRadius)
  );
  tick(run, dt, still);
  return { run, enemy };
}

describe('Volt Mite jump attack', () => {
  it('fills the warning, lands one hit, and resumes contact damage after recovery', () => {
    const { run, enemy } = encounter();
    expect(enemy.mode).toBe('leap');
    expect(enemy.leap!.elapsed).toBe(VOLT_LEAP.start);
    expect(run.effects).toHaveLength(0);
    const target = { ...run.player.n };
    const origin = { ...enemy.n };
    let mostCarets = 0;
    for (let i = 0; i < Math.ceil(VOLT_END_TIME / dt) + 1 && enemy.leap; i++) {
      const age = enemy.leap?.elapsed ?? VOLT_END_TIME;
      const carets = voltWarningCount(age);
      if (age < VOLT_LEAP.windup) {
        expect(chord(enemy.n, origin)).toBeLessThan(1e-6);
        expect(carets).toBeGreaterThanOrEqual(mostCarets);
        mostCarets = carets;
      } else expect(carets).toBe(0);
      tick(run, dt, still);
      if (age + dt < VOLT_IMPACT_TIME) expect(run.player.hp).toBe(100);
    }
    expect(chord(enemy.n, target)).toBeLessThan(1e-6);
    expect(run.player.hp).toBe(84);
    expect(run.effects.filter((e) => e.kind === 'blast')).toHaveLength(0);
    expect(run.enemies).toContain(enemy);
    expect(enemy.leap).toBeUndefined();
    expect(enemy.cooldown).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) tick(run, dt, still);
    expect(run.player.hp).toBe(76);
  });

  it('reveals five carets sequentially, holds the full path, and clears it at takeoff', () => {
    expect(voltLeapClipTime(0)).toBe(0);
    expect(voltLeapClipTime(VOLT_LEAP.windup)).toBeCloseTo(VOLT_LEAP.takeoff);
    expect(voltLeapClipTime(VOLT_IMPACT_TIME)).toBeCloseTo(VOLT_LEAP.impact);
    expect(voltLeapClipTime(VOLT_END_TIME)).toBeCloseTo(VOLT_LEAP.duration);
    expect(voltWarningCount(-0.001)).toBe(0);
    for (let step = 0; step < 5; step++) {
      expect(voltWarningCount(((step + 0.01) * VOLT_LEAP.windup) / 5)).toBe(
        step + 1
      );
      expect(voltWarningCount(((step + 0.99) * VOLT_LEAP.windup) / 5)).toBe(
        step + 1
      );
    }
    expect(voltWarningCount(VOLT_LEAP.windup)).toBe(0);
  });

  it('deals repeated grounded contact damage, stopping when the player moves away', () => {
    const run = createRun(19, 5.006);
    run.weapons = [];
    run.spawnCredit = -1e6;
    run.eventIndex = 1000;
    const enemy = spawnEnemy(run, 'volt', { ...run.player.n });
    enemy.cooldown = 100;
    enemy.speed = 0;
    tick(run, dt, still);
    expect(enemy.leap).toBeUndefined();
    expect(run.player.hp).toBe(96);
    for (let i = 0; i < 40; i++) tick(run, dt, still);
    expect(run.player.hp).toBe(88);
    run.player.n = pointAt(
      vec3(),
      run.player.n,
      run.right,
      1 / run.groundRadius
    );
    for (let i = 0; i < 40; i++) tick(run, dt, still);
    expect(run.player.hp).toBe(88);
  });

  it('does not apply ground contact hits during the coil or flight', () => {
    const { run, enemy } = encounter();
    while (enemy.leap!.elapsed + dt < VOLT_IMPACT_TIME) {
      // Stand on its ground projection, even while the model is airborne.
      run.player.n = { ...enemy.n };
      tick(run, dt, still);
      expect(run.player.hp).toBe(100);
    }
  });

  it('can be sidestepped and does not steer toward the player in flight', () => {
    const { run, enemy } = encounter();
    const locked = { ...run.player.n };
    run.player.n = pointAt(
      vec3(),
      run.player.n,
      run.player.forward,
      1.2 / run.groundRadius
    );
    for (let i = 0; i < Math.ceil(VOLT_IMPACT_TIME / dt); i++)
      tick(run, dt, still);
    expect(chord(enemy.n, locked)).toBeLessThan(1e-6);
    expect(run.player.hp).toBe(100);
    expect(run.effects.some((e) => e.kind === 'aim' || e.kind === 'cone')).toBe(
      false
    );
  });

  it('cancels a killed midair Mite before its landing can damage the player', () => {
    const { run, enemy } = encounter();
    while (enemy.leap!.elapsed < VOLT_LEAP.windup + 0.15) tick(run, dt, still);
    const n = { ...enemy.n };
    run.projectiles.push({
      n,
      prev: { ...n },
      dir: { ...enemy.heading },
      speed: 0,
      life: 1,
      damage: 100,
      pierce: 0,
      hit: new Set(),
      from: null,
    });
    tick(run, dt, still);
    expect(enemy.dead).toBe(true);
    expect(enemy.leap).toBeUndefined();
    expect(run.kills).toBe(1);
    expect(run.defeatedEnemies).toHaveLength(1);
    expect(run.effects.some((e) => e.kind === 'blast')).toBe(false);
    for (let i = 0; i < 30; i++) tick(run, dt, still);
    expect(run.player.hp).toBe(100);
    expect(run.kills).toBe(1);
  });

  it('keeps the exported leap poses, samples the same root arc, and removes double travel from GPU poses', async () => {
    const bytes = readFileSync(
      new URL('../../../public/models/hollow-legion/mite.glb', import.meta.url)
    );
    const glb = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
      ''
    );
    const clip = glb.animations.find((c) => c.name === 'LeapAttack')!;
    expect(clip.duration).toBe(VOLT_LEAP.duration);
    const meshes: SkinnedMesh[] = [];
    glb.scene.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) meshes.push(o as SkinnedMesh);
    });
    const parts = bakeEnemyLocomotion(
      glb.scene,
      glb.animations,
      { value: 0 },
      'Run',
      'LeapAttack'
    );
    const mixer = new AnimationMixer(glb.scene);
    const action = mixer.clipAction(clip);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    for (let frame = 0; frame <= 30; frame++) {
      mixer.setTime(frame / 24);
      glb.scene.updateMatrixWorld(true);
      const root = glb.scene
        .getObjectByName('Root')!
        .getWorldPosition(new Vector3());
      const sample = sampleVoltLeap(frame / 24);
      expect(root.z).toBeCloseTo(sample.progress * VOLT_LEAP.rootDistance, 5);
      expect(root.y).toBeCloseTo(sample.height, 5);
      for (let j = 0; j < meshes.length; j++) {
        const mesh = meshes[j];
        mesh.skeleton.update();
        const count = mesh.geometry.attributes.position.count;
        const pixels = parts[j].texture.image.data as Float32Array;
        for (let i = 0; i < count; i++) {
          const position = mesh
            .getVertexPosition(i, new Vector3())
            .applyMatrix4(mesh.matrixWorld)
            .sub(root);
          const offset = ((24 + frame) * count + i) * 4;
          for (const [k, value] of position.toArray().entries())
            expect(pixels[offset + k]).toBeCloseTo(value, 5);
        }
      }
    }
    expect(
      sampleVoltLeap((8 + 18) / 48).height * 0.32 * VOLT_LEAP.heightScale
    ).toBeGreaterThan(0.2);
    parts.forEach((p) => {
      p.geometry.dispose();
      p.material.dispose();
      p.texture.dispose();
    });
  });
});
