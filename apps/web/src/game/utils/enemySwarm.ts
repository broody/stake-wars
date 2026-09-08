import * as THREE from 'three';
import { CORE_RADIUS } from './sectorGeometry';

export const ENEMY_GROUND_CLEARANCE = 0.006;
export const ENEMY_GROUND_RADIUS = CORE_RADIUS + ENEMY_GROUND_CLEARANCE;

/** An unrendered sphere encloses the Core, including any raised sector tops. */
export function enemyGroundRadius(heights: ReadonlyMap<number, number>) {
  let highestSector = 0;
  for (const height of heights.values())
    highestSector = Math.max(highestSector, height);
  return ENEMY_GROUND_RADIUS + highestSector;
}

export interface EnemyWalker {
  normal: THREE.Vector3;
  forward: THREE.Vector3;
  pace: number;
  phase: number;
  turn: number;
  targetTurn: number;
  nextTurn: number;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Movement and animation share one clock, including pause and tab suspension. */
export class EnemySwarmSimulation {
  readonly walkers: EnemyWalker[];
  time = 0;
  private readonly random: () => number;
  private readonly axis = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();

  constructor(
    count: number,
    seed: number,
    private readonly speed: number
  ) {
    this.random = seededRandom(seed);
    const azimuth = this.random() * Math.PI * 2;
    // Evenly distribute the initial population across the whole sphere.
    this.walkers = Array.from({ length: count }, (_, index) => {
      const y = 1 - (2 * (index + 0.5)) / count;
      const angle = index * Math.PI * (3 - Math.sqrt(5)) + azimuth;
      const radius = Math.sqrt(1 - y * y);
      const normal = new THREE.Vector3(
        Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius
      );
      const forward = new THREE.Vector3(0, 1, 0)
        .projectOnPlane(normal)
        .normalize()
        .applyAxisAngle(normal, this.random() * Math.PI * 2);
      return {
        normal,
        forward,
        pace: 0.75 + this.random() * 0.5,
        phase: this.random(),
        turn: 0,
        targetTurn: (this.random() - 0.5) * 1.4,
        nextTurn: 1 + this.random() * 3,
      };
    });
  }

  update(delta: number, groundRadius = ENEMY_GROUND_RADIUS) {
    const dt = Math.min(Math.max(delta, 0), 0.05);
    if (dt === 0) return;
    this.time += dt;
    for (const walker of this.walkers) {
      walker.nextTurn -= dt;
      if (walker.nextTurn <= 0) {
        walker.targetTurn = (this.random() - 0.5) * 1.4;
        walker.nextTurn = 1.5 + this.random() * 3.5;
      }
      walker.turn = THREE.MathUtils.damp(walker.turn, walker.targetTurn, 2, dt);
      this.rotation.setFromAxisAngle(walker.normal, walker.turn * dt);
      walker.forward.applyQuaternion(this.rotation);
      this.axis.crossVectors(walker.normal, walker.forward).normalize();
      this.rotation.setFromAxisAngle(
        this.axis,
        (this.speed * walker.pace * dt) / groundRadius
      );
      walker.normal.applyQuaternion(this.rotation).normalize();
      walker.forward
        .applyQuaternion(this.rotation)
        .projectOnPlane(walker.normal)
        .normalize();
    }
  }
}
