import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TrooperAim } from './trooperAim';

const normal = new THREE.Vector3(0, 0, 1),
  forward = new THREE.Vector3(0, 1, 0);
function cameraAt(position: THREE.Vector3, target: THREE.Vector3) {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.01, 200);
  camera.up.copy(normal);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return camera;
}
function camera() {
  return cameraAt(
    new THREE.Vector3(0, -2.6, 6.756),
    new THREE.Vector3(0, 0.3, 5.326)
  );
}

describe('steady camera-selected aim', () => {
  it('aims near the Core by default and converges from the muzzle onto the crosshair', () => {
    const aim = new TrooperAim(),
      view = camera();
    aim.update(normal, forward, 5.006, view, false);
    expect(aim.hitGround).toBe(true);
    expect(aim.point.length()).toBeCloseTo(5.006, 9);
    expect(aim.project(view, 1600, 900)).toBe(true);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0.1, 0.3, 5.4);
    aim.setMuzzle(muzzle);
    expect(aim.ray.distanceToPoint(aim.point)).toBeLessThan(1e-8);
  });

  it('uses camera pitch only while right-aiming and otherwise retains player-relative aim', () => {
    const aim = new TrooperAim(),
      view = camera();
    aim.update(normal, forward, 5.006, view, true);
    const first = aim.point.clone();
    expect(aim.project(view, 1600, 900)).toBe(true);
    expect(aim.screen.distanceTo(new THREE.Vector2(800, 450))).toBeLessThan(
      1e-7
    );
    view.lookAt(0, 0.5, 5);
    view.updateMatrixWorld(true);
    aim.update(normal, forward, 5.006, view, false);
    expect(aim.point.distanceTo(first)).toBeLessThan(1e-8);
    aim.update(normal, forward, 5.006, view, true);
    expect(aim.point.distanceTo(first)).toBeGreaterThan(0.05);
    expect(aim.project(view, 1600, 900)).toBe(true);
    expect(aim.screen.distanceTo(new THREE.Vector2(800, 450))).toBeLessThan(
      1e-7
    );
  });

  it('keeps the crosshair stationary when the muzzle recoils and bobs', () => {
    const aim = new TrooperAim(),
      view = camera(),
      muzzle = new THREE.Object3D();
    aim.update(normal, forward, 5.006, view, true);
    aim.project(view, 1600, 900);
    const before = aim.screen.clone(),
      point = aim.point.clone();
    for (let i = 0; i < 30; i++) {
      muzzle.position.set(0.1, 0.3 + Math.sin(i) * 0.01, 5.4);
      muzzle.rotation.x = i;
      aim.setMuzzle(muzzle);
      aim.project(view, 1600, 900);
      expect(aim.screen.equals(before)).toBe(true);
      expect(aim.point.equals(point)).toBe(true);
      expect(aim.ray.distanceToPoint(point)).toBeLessThan(1e-8);
    }
  });

  it('hides targets behind the camera, outside the viewport, or obscured by the Core', () => {
    const aim = new TrooperAim();
    aim.update(normal, forward, 5.006, camera(), false);
    expect(
      aim.project(
        cameraAt(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, 20)),
        1600,
        900
      )
    ).toBe(false);
    expect(
      aim.project(
        cameraAt(new THREE.Vector3(0, 0, 10), new THREE.Vector3(20, 0, 10)),
        1600,
        900
      )
    ).toBe(false);
    expect(
      aim.project(
        cameraAt(new THREE.Vector3(0, 0, -10), new THREE.Vector3()),
        1600,
        900
      )
    ).toBe(false);
  });
});
