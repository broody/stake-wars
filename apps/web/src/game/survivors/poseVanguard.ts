import * as THREE from 'three';
import type { VanguardAnimation } from '../utils/vanguardAnimation';
import { surfaceRotation, toVector } from './renderFrame';
import { SIM_HZ, type Run } from './sim';
import { chord, type Vec3 } from './sphere';

const s = {
  up: new THREE.Vector3(),
  forward: new THREE.Vector3(),
  aim: new THREE.Vector3(),
  localX: new THREE.Vector3(),
  localSight: new THREE.Vector3(),
};

/** Pose the player for both the game and the viewer. Return the additional chest yaw. */
export function poseVanguard(
  group: THREE.Object3D,
  a: VanguardAnimation,
  run: Run,
  radius: number,
  normal: Vec3,
  alpha: number,
  openingAge = 0,
  landingBrace = 0
) {
  const { up, forward, aim, localX } = s;
  group.position.copy(toVector(up, normal)).multiplyScalar(radius);
  surfaceRotation(group.quaternion, up, toVector(forward, run.player.forward));
  forward.projectOnPlane(up).normalize();
  localX.crossVectors(up, forward);
  toVector(aim, run.player.heading);
  const headingYaw = Math.atan2(aim.dot(localX), aim.dot(forward));
  if (run.status === 'fallen') {
    a.updateDeath(run.deathAge);
    group.visible = true;
    return 0;
  }
  const time = Math.max(0, run.time - (1 - alpha) / SIM_HZ);
  const attack = run.player.saberAttack;
  let aimYaw = 0;
  if (attack) {
    toVector(aim, attack.forward).projectOnPlane(up).normalize();
    const yaw = Math.atan2(aim.dot(localX), aim.dot(forward)) - headingYaw;
    aimYaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  }
  const rebukeAt = run.weapons.find(
    (weapon) => weapon.id === 'rebuke'
  )?.dischargedAt;
  // Effects age from the beginning of the tick that emitted them.
  const rebukeAge = rebukeAt === undefined ? -1 : time - rebukeAt + 1 / SIM_HZ;
  const charge = run.weapons.find((weapon) => weapon.id === 'charge');
  const firstLob = run.lobs[0];
  const lobAge =
    (firstLob?.age ?? -(charge?.cooldown ?? Infinity)) - (1 - alpha) / SIM_HZ;
  let gun;
  if (a.boltCaster && run.weapons.some((w) => w.id === 'bolts')) {
    const shot = run.player.boltShot;
    const shotAge = shot ? time - shot.firedAt : -1;
    toVector(aim, run.player.boltAim ?? run.player.heading);
    const targetYaw = Math.atan2(aim.dot(localX), aim.dot(forward));
    // Railstorm's per-shot spread belongs to the barrel, not to the feet.
    const sight = run.player.boltSight;
    if (sight)
      toVector(aim, sight.prev).lerp(
        toVector(s.localSight, sight.forward),
        alpha
      );
    if (shot && shotAge >= 0 && shotAge < 0.065) toVector(aim, shot.forward);
    gun = {
      yaw: Math.atan2(aim.dot(localX), aim.dot(forward)),
      targetYaw: run.player.boltAim ? targetYaw : undefined,
      shotAge,
    };
  }
  group.visible = true;
  return a.update(
    time,
    chord(run.player.prev, run.player.n) * radius * SIM_HZ,
    attack,
    aimYaw,
    headingYaw,
    time + openingAge,
    landingBrace,
    rebukeAge,
    lobAge,
    run.player.wound,
    gun
  );
}
