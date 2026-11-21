import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Group, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { poseVanguard } from './poseVanguard';
import { VANGUARD, VanguardAnimation } from '../utils/vanguardAnimation';
import { SaberAnimation } from '../utils/saberAnimation';
import { applyOffer, createRun, SIM_HZ, spawnEnemy, tick } from './sim';
import { dot, pointAt, rotateAbout, vec3 } from './sphere';

async function asset(name: string, model = 'sector-trooper') {
  const bytes = readFileSync(
    new URL(`../../../public/models/${model}/${name}.glb`, import.meta.url)
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

  it('aims the Vanguard pistol along its volley while turning, then clears the flash on defeat', async () => {
    const [vanguard, gun] = await Promise.all([
      asset('vanguard', 'vanguard'),
      asset('sector-trooper-bolt-caster'),
    ]);
    const actor = new VanguardAnimation(
      vanguard.scene,
      vanguard.animations,
      gun.scene
    );
    const group = new Group();
    group.add(actor.root);
    actor.root.scale.setScalar(VANGUARD.scale);
    const weapon = actor.boltCaster!.gun;
    const flash = weapon.getObjectByName('BoltCaster_Flash')!;
    const run = createRun(23, 5.006, 'vanguard');
    const pose = () =>
      poseVanguard(group, actor, run, run.groundRadius, run.player.n, 1);
    try {
      pose();
      expect(weapon.visible).toBe(false);
      applyOffer(run, { kind: 'weapon', id: 'bolts', isNew: true });
      run.time = 1 / SIM_HZ;
      run.player.heading = { ...run.right };
      run.player.boltShot = {
        firedAt: run.time,
        forward: { ...run.player.forward },
      };
      pose();
      const barrel = new Vector3(0, 0, 1).applyQuaternion(
        weapon.getWorldQuaternion(new Quaternion())
      );
      expect(barrel.dot(new Vector3().copy(run.player.forward))).toBeCloseTo(
        1,
        5
      );
      expect(weapon.parent!.name).toBe('handL');
      expect(weapon.visible).toBe(true);
      expect(flash.visible).toBe(true);
      run.status = 'fallen';
      pose();
      expect(flash.visible).toBe(false);
      expect(weapon.visible).toBe(true);
    } finally {
      actor.dispose();
    }
  });

  it.each([false, true])(
    'turns onto a rear target before firing, running=%s',
    async (running) => {
      const [rig, pistol] = await Promise.all([
        asset('vanguard', 'vanguard'),
        asset('sector-trooper-bolt-caster'),
      ]);
      const actor = new VanguardAnimation(
        rig.scene,
        rig.animations,
        pistol.scene
      );
      const group = new Group();
      group.add(actor.root);
      actor.root.scale.setScalar(VANGUARD.scale);
      const run = createRun(42, 5.006, 'vanguard');
      run.spawnCredit = -1e6;
      run.eventIndex = 1000;
      run.weapons.length = 0;
      applyOffer(run, { kind: 'weapon', id: 'bolts', isNew: true });
      const caster = run.weapons[0];
      caster.cooldown = 1e6;
      const normal = new Vector3();
      const rotation = new Quaternion();
      const chest = actor.root.getObjectByName('chest')!;
      const chestFront = new Vector3(0, 0, 1).applyQuaternion(
        chest.getWorldQuaternion(rotation).invert()
      );
      const forward = (o: typeof actor.root, axis = new Vector3(0, 0, 1)) =>
        axis
          .clone()
          .applyQuaternion(o.getWorldQuaternion(rotation))
          .projectOnPlane(normal)
          .normalize();
      const feet = () =>
        ['footL', 'footR'].map((name) =>
          actor.root.getObjectByName(name)!.getWorldPosition(new Vector3())
        );
      const step = () => {
        tick(run, 1 / SIM_HZ, { x: 0, y: running ? 1 : 0 });
        poseVanguard(group, actor, run, run.groundRadius, run.player.n, 1);
        normal.copy(run.player.n);
      };
      try {
        for (let i = 0; i < 12; i++) step();
        const behind = new Vector3().copy(run.player.heading).negate();
        const target = spawnEnemy(
          run,
          'bulwark',
          pointAt(vec3(), run.player.n, behind, 2 / run.groundRadius)
        );
        target.speed = 0;
        target.cooldown = 1e6;
        caster.cooldown = 0.35;
        let acquired = false;
        let reversedStride = false;
        for (let i = 0; i < 16 && !run.player.boltShot; i++) {
          const before = feet();
          const phase = actor.gaitPhase;
          step();
          if (run.player.boltAim && !acquired) {
            acquired = true;
            expect(run.player.boltShot).toBeUndefined();
            if (!running)
              expect(
                Math.min(...feet().map((foot, j) => foot.distanceTo(before[j])))
              ).toBeLessThan(0.004);
          }
          const travel = new Vector3().copy(run.player.heading);
          if (
            running &&
            forward(actor.root).dot(travel) < -0.65 &&
            actor.gaitPhase < phase
          )
            reversedStride = true;
          expect(
            forward(actor.boltCaster!.gun).dot(forward(chest, chestFront))
          ).toBeGreaterThan(0.2);
        }
        expect(acquired).toBe(true);
        const shot = new Vector3().copy(run.player.boltShot!.forward);
        expect(forward(actor.root).dot(shot)).toBeGreaterThan(0.95);
        expect(forward(actor.boltCaster!.gun).dot(shot)).toBeGreaterThan(0.995);
        expect(
          dot(run.player.heading, run.player.boltShot!.forward)
        ).toBeLessThan(-0.95);
        if (running) expect(reversedStride).toBe(true);
      } finally {
        actor.dispose();
      }
    }
  );

  it('keeps Railstorm firing along the turning barrel when the target switches sides', () => {
    const run = createRun(57, 5.006, 'vanguard');
    run.spawnCredit = -1e6;
    run.eventIndex = 1000;
    run.weapons.length = 0;
    applyOffer(run, { kind: 'weapon', id: 'bolts', isNew: true });
    applyOffer(run, { kind: 'evolution', id: 'bolts' });
    const heading = new Vector3().copy(run.player.heading);
    const dummy = (distance: number) => {
      const enemy = spawnEnemy(
        run,
        'bulwark',
        pointAt(vec3(), run.player.n, heading, distance / run.groundRadius)
      );
      enemy.speed = 0;
      enemy.cooldown = 1e6;
      return enemy;
    };
    const ahead = dummy(2);
    const step = () => tick(run, 1 / SIM_HZ, { x: 0, y: 0 });
    run.weapons[0].cooldown = 0;
    step();
    const first = run.player.boltShot!;
    expect(dot(first.forward, heading)).toBeGreaterThan(0.99);
    ahead.dead = true;
    dummy(-2);
    const bearings: number[] = [];
    let last = first.firedAt;
    for (let i = 0; i < 12; i++) {
      step();
      const shot = run.player.boltShot!;
      if (shot.firedAt === last) continue;
      expect(shot.firedAt - last).toBeCloseTo(6 / SIM_HZ);
      expect(dot(shot.forward, run.player.boltSight!.forward)).toBeGreaterThan(
        0.99
      );
      bearings.push(dot(shot.forward, heading));
      last = shot.firedAt;
    }
    expect(bearings).toHaveLength(2);
    expect(bearings[0]).toBeLessThan(0);
    expect(bearings[0]).toBeGreaterThan(-0.99);
    expect(bearings[1]).toBeLessThan(-0.99);
  });

  it('records each shot direction and carries aim along the sphere until the next shot', () => {
    const run = createRun(123, 5.006, 'vanguard');
    run.spawnCredit = -1e6;
    run.eventIndex = 1000;
    tick(run, 1 / SIM_HZ, { x: 0, y: 0 });
    expect(run.player.boltShot).toBeUndefined();
    applyOffer(run, { kind: 'weapon', id: 'bolts', isNew: true });
    const caster = run.weapons.find((w) => w.id === 'bolts')!;
    caster.cooldown = 0.3;
    const target = spawnEnemy(
      run,
      'bulwark',
      pointAt(vec3(), run.player.n, run.right, 2 / run.groundRadius)
    );
    target.speed = 0;
    target.cooldown = 1e6;
    for (let i = 0; i < SIM_HZ && !run.player.boltShot; i++)
      tick(run, 1 / SIM_HZ, { x: 0, y: 0 });
    expect(run.player.boltShot!.firedAt).toBe(run.time);
    expect(run.projectiles).toHaveLength(1);
    expect(run.projectiles[0].pierce).toBe(0);
    expect(dot(run.player.boltShot!.forward, run.right)).toBeCloseTo(1, 5);
    const firedAt = run.player.boltShot!.firedAt;
    tick(run, 1 / SIM_HZ, { x: 0, y: 1 });
    expect(run.player.boltShot!.firedAt).toBe(firedAt);
    expect(dot(run.player.boltShot!.forward, run.player.n)).toBeCloseTo(0, 8);
    expect(run.cues.some((cue) => cue.id === 'bolt')).toBe(true);
    caster.evolved = true;
    caster.cooldown = 0;
    run.projectiles.length = 0;
    tick(run, 1 / SIM_HZ, { x: 0, y: 0 });
    expect(run.projectiles).toHaveLength(1);
    expect(run.player.boltShot!.firedAt).toBe(run.time);
    expect(run.cues.some((cue) => cue.id === 'railstorm')).toBe(true);
    // The projectile direction is parallel-transported during its movement step.
    expect(
      dot(run.player.boltShot!.forward, run.projectiles[0].dir)
    ).toBeGreaterThan(0.999);
    expect(createRun(123, 5.006).player.boltShot).toBeUndefined();
  });
  it.each([
    { level: 1, cooldown: 0.85, counts: [1, 1], overclock: 0 },
    { level: 2, cooldown: 0.85, counts: [1, 1], overclock: 0 },
    { level: 3, cooldown: 0.85, counts: [1, 1, 1, 1, 2], overclock: 0 },
    { level: 4, cooldown: 0.83, counts: [1, 1, 1, 2], overclock: 0 },
    {
      level: 5,
      cooldown: 0.78,
      counts: [1, 1, 1, 2, 1, 1, 1, 1, 3],
      overclock: 5,
    },
  ])(
    'separates each rank $level tap while reloading from the first shot',
    ({ level, cooldown, counts, overclock }) => {
      const run = createRun(42, 5.006, 'vanguard');
      run.spawnCredit = -1e6;
      run.eventIndex = 1000;
      run.weapons.length = 0;
      for (let i = 0; i < level; i++)
        applyOffer(run, { kind: 'weapon', id: 'bolts', isNew: i === 0 });
      for (let i = 0; i < overclock; i++)
        applyOffer(run, { kind: 'system', id: 'overclock', isNew: i === 0 });
      run.weapons[0].cooldown = 0;
      const ticksPerVolley = Math.ceil(
        cooldown * run.player.cooldownScale * SIM_HZ
      );
      for (const count of [...counts, 1]) {
        for (let frame = 0; frame < ticksPerVolley; frame++) {
          run.projectiles.length = 0;
          run.cues.length = 0;
          tick(run, 1 / SIM_HZ, { x: 0, y: 1 });
          const tap = frame / 4;
          const fires = Number.isInteger(tap) && tap < count;
          expect(run.projectiles).toHaveLength(fires ? 1 : 0);
          expect(run.cues.filter((cue) => cue.id === 'bolt')).toHaveLength(
            fires ? 1 : 0
          );
          expect(run.player.boltShot?.firedAt === run.time).toBe(fires);
          if (!fires) continue;
          const bolt = run.projectiles[0];
          const aim = rotateAbout(
            { ...run.player.heading },
            run.player.n,
            (tap - (count - 1) / 2) * 0.14
          );
          expect(bolt.prev).toEqual(run.player.n);
          expect(dot(aim, run.player.boltShot!.forward)).toBeCloseTo(1, 8);
          expect(dot(run.player.boltShot!.forward, bolt.dir)).toBeGreaterThan(
            0.999
          );
        }
      }
    }
  );
});
