import * as THREE from 'three';
import { TrooperController } from './trooperController';

export const TROOPER_PATROL_COUNT = 100;
const BEHAVIORS = [
  { name: 'Run', forward: 1, left: 0, firing: false },
  { name: 'Strafe fire left', forward: 0, left: 1, firing: true },
  { name: 'Idle fire', forward: 0, left: 0, firing: true },
  { name: 'Backward', forward: -1, left: 0, firing: false },
  { name: 'Strafe right', forward: 0, left: -1, firing: false },
  { name: 'Forward fire', forward: 1, left: 0, firing: true },
  { name: 'Strafe left', forward: 0, left: 1, firing: false },
  { name: 'Strafe fire right', forward: 0, left: -1, firing: true },
  { name: 'Backward fire', forward: -1, left: 0, firing: true },
  { name: 'Idle', forward: 0, left: 0, firing: false },
] as const;

/** Independent, seeded preview behavior; no player input or camera ownership. */
export class TrooperPatrol {
  readonly controller = new TrooperController();
  private state: number;
  private behaviorIndex: number;
  private remaining: number;
  private turnSpeed = 0;
  private targetTurn = 0;

  constructor(index: number) {
    this.state = 7613 + index * 7919;
    this.behaviorIndex = index % BEHAVIORS.length;
    this.remaining = 2 + this.random() * 3;
    // Fibonacci distribution avoids stacking actors as the population grows.
    const z = 1 - (2 * (index + 0.5)) / TROOPER_PATROL_COUNT;
    const azimuth = index * Math.PI * (3 - Math.sqrt(5));
    const ring = Math.sqrt(1 - z * z);
    this.controller.normal.set(
      ring * Math.sin(azimuth),
      ring * Math.cos(azimuth),
      z
    );
    this.controller.forward
      .set(0, 1, 0)
      .projectOnPlane(this.controller.normal)
      .normalize();
    this.controller.turn((this.random() - 0.5) * Math.PI * 2);
    this.controller.cycles = this.random();
  }

  get behavior() {
    return BEHAVIORS[this.behaviorIndex];
  }

  private random() {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  update(delta: number, radius: number) {
    const dt = THREE.MathUtils.clamp(delta, 0, 0.05);
    this.remaining -= dt;
    if (this.remaining <= 0) {
      this.behaviorIndex =
        (this.behaviorIndex +
          1 +
          Math.floor(this.random() * (BEHAVIORS.length - 1))) %
        BEHAVIORS.length;
      this.remaining = 2 + this.random() * 4;
      this.targetTurn =
        (this.random() - 0.5) * (this.behavior.firing ? 0.55 : 1.2);
    }
    this.turnSpeed = THREE.MathUtils.damp(
      this.turnSpeed,
      this.targetTurn,
      3,
      dt
    );
    this.controller.turn(this.turnSpeed * dt);
    this.controller.update(dt, radius, this.behavior);
  }
}
