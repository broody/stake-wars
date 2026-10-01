import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SaberAnimation } from '../utils/saberAnimation';
import { applyOffer, createRun, SIM_HZ, spawnEnemy, tick } from './sim';
import { dot, pointAt, vec3 } from './sphere';

async function asset(name: string) {
  const bytes = readFileSync(
    new URL(
      `../../../public/models/sector-trooper/${name}.glb`,
      import.meta.url
    )
  );
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    ''
  );
}

describe('Bolt Caster off-hand equipment', () => {
  it('equips only with the upgrade and keeps aim, grip, feet and saber independent', async () => {
    const [trooper, gun] = await Promise.all([
      asset('sector-trooper-saber'),
      asset('sector-trooper-bolt-caster'),
    ]);
    const plain = new SaberAnimation(trooper.scene, trooper.animations);
    const armed = new SaberAnimation(
      trooper.scene,
      trooper.animations,
      gun.scene
    );
    const weapon = armed.boltCaster!.gun;
    expect(weapon.visible).toBe(false);
    expect(weapon.parent!.name).toBe('handL');
    for (const yaw of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      for (let i = 0; i < 50; i++) {
        const time = i / 60;
        const attack = {
          id: 1,
          startedAt: 0.1,
          duration: 0.75,
          side: 1,
          forward: { x: 0, y: 0, z: -1 },
        };
        plain.update(time, 0.7, attack, Math.PI);
        armed.update(time, 0.7, attack, Math.PI, {
          equipped: true,
          yaw,
          shotAge: time,
        });
        for (const name of [
          'pelvis',
          'thighL',
          'footR',
          'handR',
          'SectorTrooper_Saber',
        ])
          expect(
            armed.root.getObjectByName(name)!.matrixWorld.elements
          ).toEqual(plain.root.getObjectByName(name)!.matrixWorld.elements);
        const barrel = new Vector3(0, 0, 1).applyQuaternion(
          weapon.getWorldQuaternion(new Quaternion())
        );
        expect(
          barrel.dot(new Vector3(Math.sin(yaw), 0, Math.cos(yaw)))
        ).toBeCloseTo(1, 6);
        expect(weapon.position.toArray()).toEqual([0, 0.085, 0]);
      }
    }
    const pose = weapon.matrixWorld.clone();
    for (let i = 0; i < 4; i++) {
      armed.update(
        49 / 60,
        0.7,
        {
          id: 1,
          startedAt: 0.1,
          duration: 0.75,
          side: 1,
          forward: { x: 0, y: 0, z: -1 },
        },
        Math.PI,
        { equipped: true, yaw: Math.PI, shotAge: 49 / 60 }
      );
      weapon.matrixWorld.elements.forEach((v, n) =>
        expect(v).toBeCloseTo(pose.elements[n], 6)
      );
    }
    armed.updateDeath(0);
    expect(weapon.visible).toBe(true);
    expect(weapon.getObjectByName('BoltCaster_Flash')!.visible).toBe(false);
    armed.updateDeath(3);
    expect(weapon.matrixWorld.elements.every(Number.isFinite)).toBe(true);
    armed.update(0, 0);
    plain.update(0, 0);
    expect(weapon.visible).toBe(false);
    expect(armed.root.getObjectByName('handL')!.matrixWorld.elements).toEqual(
      plain.root.getObjectByName('handL')!.matrixWorld.elements
    );
    armed.dispose();
    plain.dispose();
  });

  it('records each volley once, tracks its shot direction, and carries aim along the sphere', () => {
    const run = createRun(123, 5.006);
    run.spawnCredit = -1e6;
    run.eventIndex = 1000;
    tick(run, 1 / SIM_HZ, { x: 0, y: 0 });
    expect(run.player.boltShot).toBeUndefined();
    applyOffer(run, { kind: 'weapon', id: 'bolts', isNew: true });
    const caster = run.weapons.find((w) => w.id === 'bolts')!;
    caster.cooldown = 0;
    const target = spawnEnemy(
      run,
      'bulwark',
      pointAt(vec3(), run.player.n, run.right, 2 / run.groundRadius)
    );
    target.speed = 0;
    target.cooldown = 1e6;
    tick(run, 1 / SIM_HZ, { x: 0, y: 0 });
    expect(run.player.boltShot!.firedAt).toBe(run.time);
    expect(run.projectiles).toHaveLength(1);
    expect(dot(run.player.boltShot!.forward, run.right)).toBeCloseTo(1, 5);
    const firedAt = run.player.boltShot!.firedAt;
    tick(run, 1 / SIM_HZ, { x: 0, y: 1 });
    expect(run.player.boltShot!.firedAt).toBe(firedAt);
    expect(dot(run.player.boltShot!.forward, run.player.n)).toBeCloseTo(0, 8);
    caster.level = 4;
    caster.cooldown = 0;
    run.projectiles.length = 0;
    tick(run, 1 / SIM_HZ, { x: 0, y: 0 });
    expect(run.projectiles).toHaveLength(3);
    expect(
      dot(run.player.boltShot!.forward, run.projectiles[1].dir)
    ).toBeGreaterThan(0.999);
    caster.evolved = true;
    caster.cooldown = 0;
    run.projectiles.length = 0;
    tick(run, 1 / SIM_HZ, { x: 0, y: 0 });
    expect(run.projectiles).toHaveLength(1);
    expect(run.player.boltShot!.firedAt).toBe(run.time);
    // The projectile direction is parallel-transported during its movement step.
    expect(
      dot(run.player.boltShot!.forward, run.projectiles[0].dir)
    ).toBeGreaterThan(0.999);
    expect(createRun(123, 5.006).player.boltShot).toBeUndefined();
  });
});
