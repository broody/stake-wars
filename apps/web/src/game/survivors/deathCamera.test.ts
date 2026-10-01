import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { DeathCamera, DEATH_CAMERA } from './deathCamera';

describe('defeat camera', () => {
  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2])(
    'starts without a jump and finishes overhead for heading %s',
    (yaw) => {
      const normal = new Vector3(0.3, 0.8, 0.5).normalize();
      const screenUp = new Vector3(0, 0, 1).projectOnPlane(normal).normalize();
      const front = screenUp.clone().applyAxisAngle(normal, yaw);
      const origin = normal.clone().multiplyScalar(5);
      const start = origin
        .clone()
        .addScaledVector(normal, 3.3)
        .addScaledVector(screenUp, -0.9);
      const target = origin.clone().addScaledVector(screenUp, 0.15);
      const camera = new DeathCamera(start, target, screenUp, normal, front, 5);
      const eye = new Vector3(),
        look = new Vector3(),
        up = new Vector3();
      camera.sample(0, eye, look, up);
      expect(eye.distanceTo(start)).toBeLessThan(1e-8);
      expect(look.distanceTo(target)).toBeLessThan(1e-8);
      expect(up.distanceTo(screenUp)).toBeLessThan(1e-8);
      let previousDistance = eye.distanceTo(origin);
      for (let i = 1; i <= DEATH_CAMERA.duration * 60; i++) {
        camera.sample(i / 60, eye, look, up);
        const distance = eye.distanceTo(origin);
        expect(distance).toBeLessThanOrEqual(previousDistance + 1e-8);
        expect(eye.length()).toBeGreaterThan(5);
        const direction = look.clone().sub(eye).normalize();
        expect(
          new Vector3().crossVectors(direction, up).length()
        ).toBeGreaterThan(0.05);
        previousDistance = distance;
      }
      const finish = eye.clone();
      expect(eye.clone().sub(look).normalize().dot(normal)).toBeCloseTo(1, 8);
      expect(up.dot(normal)).toBeCloseTo(0, 8);
      expect(up.dot(front)).toBeCloseTo(1, 8);
      expect(
        look.distanceTo(
          origin
            .clone()
            .addScaledVector(normal, 0.08)
            .addScaledVector(front, 0.12)
        )
      ).toBeLessThan(1e-8);
      camera.sample(DEATH_CAMERA.duration + DEATH_CAMERA.hold, eye, look, up);
      expect(eye.distanceTo(finish)).toBeLessThan(1e-8);
    }
  );
});
