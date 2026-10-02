import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SeekerAnimation } from '../utils/seekerAnimation';
import { SEEKER_ATTACK, SEEKER_GAIT, seekerAttackPose } from './seekerAttack';
import { SEEKER_DEFEAT } from './enemyDefeat';
import { createRun, runEvent, spawnEnemy, tick, SIM_HZ } from './sim';
import { chord, pointAt, vec3 } from './sphere';

async function asset() {
  const bytes = readFileSync(
    new URL('../../../public/models/hollow-legion/seeker.glb', import.meta.url)
  );
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    ''
  );
}
const still = { x: 0, y: 0 };
const dt = 1 / SIM_HZ;
function run() {
  const run = createRun(17, 5.006);
  run.weapons = [];
  run.spawnCredit = -1e6;
  run.eventIndex = 1000;
  run.player.invulnerable = 100;
  return run;
}

describe('Seeker model integration', () => {
  it('matches attack/death timings and keeps every gameplay clip horizontally in place', async () => {
    const glb = await asset();
    for (const [name, duration] of [
      ['ChargeWindup', SEEKER_ATTACK.windup],
      ['ChargeRecover', SEEKER_ATTACK.recover],
      ['Defeated', SEEKER_DEFEAT.duration],
    ] as const)
      expect(glb.animations.find((c) => c.name === name)!.duration).toBeCloseTo(
        duration
      );
    const actor = new SeekerAnimation(glb.scene, glb.animations);
    expect(actor.actions.has('ChargeAttack' as never)).toBe(false);
    for (const action of actor.actions.values()) {
      // Death has a small lateral roll; only attack/locomotion must stay in place.
      if (action.getClip().name === 'Defeated') continue;
      const rootTrack = action
        .getClip()
        .tracks.find((t) => t.name === 'Root.position')!;
      expect(rootTrack).toBeDefined();
      for (let i = 0; i < rootTrack.values.length; i += 3) {
        expect(rootTrack.values[i]).toBeCloseTo(rootTrack.values[0], 6);
        expect(rootTrack.values[i + 2]).toBeCloseTo(rootTrack.values[2], 6);
      }
    }
    actor.dispose();
  });
  it('matches gait speed, freezes on pause, stretches pack windup and loops long charges', async () => {
    const glb = await asset();
    const actor = new SeekerAnimation(glb.scene, glb.animations);
    const base = { scale: 0.25, speed: SEEKER_GAIT.walkSpeed * 0.25 };
    actor.update({ ...base, time: 0 });
    actor.update({ ...base, time: 0.2 });
    expect(actor.actions.get('Walk')!.time).toBeCloseTo(0.2);
    actor.update({ ...base, time: 0.4, speed: SEEKER_GAIT.runSpeed * 0.25 });
    expect(actor.actions.get('Run')!.getEffectiveWeight()).toBe(1);
    const before = actor.actions.get('Run')!.time;
    actor.update({ ...base, time: 0.4, speed: SEEKER_GAIT.runSpeed * 0.25 });
    expect(actor.actions.get('Run')!.time).toBe(before);
    actor.update({
      ...base,
      time: 1.2,
      attack: seekerAttackPose('aim', 0.8, true),
    });
    expect(actor.actions.get('ChargeWindup')!.time).toBeCloseTo(0.4);
    actor.update({
      ...base,
      time: 4.1,
      attack: seekerAttackPose('charge', 96.63, true),
    });
    expect(actor.actions.get('Charge')!.time).toBeCloseTo(0.12);
    actor.update({
      ...base,
      time: 4.5,
      attack: seekerAttackPose('recover', 0.2, false),
    });
    expect(actor.actions.get('ChargeRecover')!.time).toBeCloseTo(0.4);
    actor.update({ ...base, time: 5, speed: 0 });
    expect(actor.actions.get('Idle')!.getEffectiveWeight()).toBe(1);
    actor.dispose();
  });
  it('keeps charge stride speed matched at half the original size', async () => {
    const glb = await asset();
    const actor = new SeekerAnimation(glb.scene, glb.animations);
    actor.update({
      time: 0.1,
      speed: 3,
      scale: 0.125,
      attack: { clip: 'Charge', elapsed: 0.1 },
    });
    expect(actor.actions.get('Charge')!.time).toBeCloseTo(0.1 / 0.5);
    actor.dispose();
  });
  it('fades a held side-collapse without altering other living copies', async () => {
    const glb = await asset();
    const dead = new SeekerAnimation(glb.scene, glb.animations);
    const living = new SeekerAnimation(glb.scene, glb.animations);
    dead.update({ time: 0, speed: 0, scale: 0.25 });
    dead.update({ time: 2, speed: 0, scale: 0.25, defeatAge: 2 });
    expect(dead.actions.get('Defeated')!.time).toBeCloseTo(
      SEEKER_DEFEAT.duration
    );
    dead.root.traverse((o) => {
      if (o instanceof SkinnedMesh)
        expect((o.material as { opacity: number }).opacity).toBeLessThan(0.5);
    });
    living.update({ time: 2, speed: 0, scale: 0.25 });
    living.root.traverse((o) => {
      if (o instanceof SkinnedMesh)
        expect((o.material as { opacity: number }).opacity).toBe(1);
    });
    dead.update({ time: 2.5, speed: 0, scale: 0.25, defeatAge: 2.5 });
    dead.root.traverse((o) => {
      if (o instanceof SkinnedMesh)
        expect((o.material as { opacity: number }).opacity).toBe(0);
    });
    dead.dispose();
    living.dispose();
  });
  it('locks on farther away while retaining charge distance and pack timings', () => {
    const single = run();
    const enemy = spawnEnemy(
      single,
      'seeker',
      pointAt(vec3(), single.player.n, single.right, 2.8 / single.groundRadius)
    );
    enemy.cooldown = 0;
    tick(single, dt, still);
    expect(enemy.mode).toBe('aim');
    expect(enemy.modeTime).toBe(SEEKER_ATTACK.windup);
    for (let i = 0; i < 30 && enemy.mode === 'aim'; i++)
      tick(single, dt, still);
    expect(enemy.mode).toBe('charge');
    const origin = { ...enemy.n };
    for (let i = 0; i < 32 && enemy.mode === 'charge'; i++)
      tick(single, dt, still);
    expect(enemy.mode).toBe('recover');
    // Fixed-step boundary can add one simulation step, as before integration.
    expect(chord(origin, enemy.n) * single.groundRadius).toBeGreaterThan(2.9);
    expect(chord(origin, enemy.n) * single.groundRadius).toBeLessThan(3.11);
    const pack = run();
    runEvent(pack, 'seekers');
    expect(pack.enemies).toHaveLength(5);
    expect(
      pack.enemies.every((e) => e.modeTime === SEEKER_ATTACK.packWindup)
    ).toBe(true);
    for (let i = 0; i < 90; i++) tick(pack, dt, still);
    expect(pack.enemies.every((e) => e.mode === 'charge')).toBe(true);
  });
});
