import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  FOLLOW_CAMERA,
  FollowOrbit,
  followPullback,
  sampleFollowCamera,
} from './followCamera';

const FOV = 75;
const halfWidth = (aspect: number) =>
  FOLLOW_CAMERA.height *
  followPullback(FOV, aspect) *
  Math.tan((FOV * Math.PI) / 360) *
  aspect;

describe('follow camera pullback', () => {
  it('keeps the authored framing on landscape and tablet screens', () => {
    for (const aspect of [16 / 9, 4 / 3, 1, 768 / 1024])
      expect(followPullback(FOV, aspect)).toBe(1);
  });

  it('pulls back on a phone until the sides are in view', () => {
    const phone = 375 / 812;
    expect(followPullback(FOV, phone)).toBeGreaterThan(1.4);
    expect(halfWidth(phone)).toBeCloseTo(FOLLOW_CAMERA.minHalfWidth, 9);
  });

  it('stops pulling back at its limit', () => {
    expect(followPullback(FOV, 0.2)).toBe(FOLLOW_CAMERA.maxPullback);
    expect(followPullback(FOV, 0)).toBe(1);
  });
});

describe('third-person orbit', () => {
  it.each([16 / 9, 390 / 844])(
    'keeps the torso centered at both zoom and pitch limits, aspect %s',
    (aspect) => {
      const orbit = new FollowOrbit();
      const camera = new PerspectiveCamera(FOV, aspect, 0.1, 100);
      const up = new Vector3(-0.3, 0.8, 0.5).normalize();
      const forward = new Vector3(1, 0, 0).projectOnPlane(up).normalize();
      const torso = up.clone().multiplyScalar(5 + FOLLOW_CAMERA.targetHeight);
      const look = new Vector3();
      for (const [factor, limit] of [
        [0.001, 0.72],
        [100, 1.35],
      ]) {
        orbit.zoomTo(factor);
        expect(orbit.distance).toBe(limit);
        for (const tilt of [-10, 10]) {
          for (const yaw of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI]) {
            orbit.turnTo(yaw, tilt);
            expect((orbit.pitch * 180) / Math.PI).toBeCloseTo(
              tilt < 0 ? 25 : 82
            );
            sampleFollowCamera(
              up,
              forward,
              5,
              followPullback(FOV, aspect) * orbit.sampleDistance(2),
              camera.position,
              look,
              camera.up,
              orbit.yaw,
              orbit.pitch
            );
            camera.lookAt(look);
            camera.updateMatrixWorld();
            const screen = torso.clone().project(camera);
            expect(Math.hypot(screen.x, screen.y)).toBeLessThan(1e-8);
            expect(camera.position.dot(up)).toBeGreaterThan(5);
            const bearing = camera.position
              .clone()
              .sub(torso)
              .projectOnPlane(up)
              .normalize();
            expect(
              bearing.dot(forward.clone().applyAxisAngle(up, yaw))
            ).toBeCloseTo(-1);
          }
        }
      }
      orbit.reset();
      expect(orbit.yaw).toBe(0);
      expect(orbit.sampleDistance(0)).toBe(1);
    }
  );
});
