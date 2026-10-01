import { Vector3 } from 'three';
import type { Vec3 } from './sphere';

export const DEATH_CAMERA = { duration: 3.5, hold: 1 } as const;
export const DEATH_RESULTS_DELAY = DEATH_CAMERA.duration + DEATH_CAMERA.hold;

/** Capture the current view once, then spiral into an overhead view of the fallen trooper. */
export class DeathCamera {
  private normal: Vector3;
  private front: Vector3;
  private right: Vector3;
  private origin: Vector3;
  private startLook: Vector3;
  private startUp: Vector3;
  private distance: number;
  private elevation: number;
  private angle: number;
  private endAngle: number;
  private upTurn: number;

  constructor(
    position: Vector3,
    look: Vector3,
    up: Vector3,
    normal: Vec3,
    heading: Vec3,
    radius: number
  ) {
    this.normal = new Vector3(normal.x, normal.y, normal.z).normalize();
    this.front = new Vector3(heading.x, heading.y, heading.z)
      .projectOnPlane(this.normal)
      .normalize();
    this.right = new Vector3()
      .crossVectors(this.normal, this.front)
      .normalize();
    this.origin = this.normal.clone().multiplyScalar(radius);
    this.startLook = look.clone();
    this.startUp = up.clone();
    this.upTurn = Math.atan2(
      new Vector3().crossVectors(up, this.front).dot(this.normal),
      up.dot(this.front)
    );
    const offset = position.clone().sub(this.origin);
    this.distance = offset.length();
    this.elevation = Math.asin(
      Math.max(-1, Math.min(1, offset.dot(this.normal) / this.distance))
    );
    this.angle = Math.atan2(offset.dot(this.right), offset.dot(this.front));
    if (this.angle < 0) this.angle += Math.PI * 2;
    this.endAngle = this.angle + Math.PI * 2;
  }

  sample(age: number, eye: Vector3, look: Vector3, up: Vector3) {
    const t = Math.max(0, Math.min(1, age / DEATH_CAMERA.duration));
    const ease = t * t * (3 - 2 * t);
    const angle = this.angle + (this.endAngle - this.angle) * ease;
    const distance = this.distance + (1.25 - this.distance) * ease;
    // Dip alongside the kneeling figure, then rise above the settled body.
    const rise = Math.max(0, Math.min(1, (t - 0.4) / 0.6));
    const riseEase = rise * rise * (3 - 2 * rise);
    const dip = Math.min(1, t / 0.4);
    const dipEase = dip * dip * (3 - 2 * dip);
    const elevation =
      t < 0.4
        ? this.elevation + (0.65 - this.elevation) * dipEase
        : 0.65 + (Math.PI / 2 - 0.65) * riseEase;
    const horizontal = distance * Math.cos(elevation);
    eye
      .copy(this.origin)
      .addScaledVector(this.normal, distance * Math.sin(elevation))
      .addScaledVector(this.front, horizontal * Math.cos(angle))
      .addScaledVector(this.right, horizontal * Math.sin(angle))
      .addScaledVector(this.front, 0.12 * ease);
    look
      .copy(this.origin)
      .addScaledVector(this.normal, 0.08)
      .addScaledVector(this.front, 0.12)
      .lerp(this.startLook, 1 - ease);
    up.copy(this.startUp)
      .applyAxisAngle(this.normal, this.upTurn * ease)
      .lerp(this.normal, Math.sin(Math.PI * t))
      .normalize();
  }
}
