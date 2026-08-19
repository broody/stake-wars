import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CAMERA_ARRIVAL_DISTANCE,
  createCameraArrivalPath,
  sampleCameraArrival,
} from './cameraArrival';

function sequenceRandom(values: number[]) {
  let index = 0;
  return () => values[index++ % values.length];
}

describe('camera arrival', () => {
  it('creates a normalized path with a clearly separated opening view', () => {
    const path = createCameraArrivalPath(
      sequenceRandom([0.1, 0.2, 0.7, 0.4, 0.6, 0.8, 0.3, 0.9])
    );
    const separation = path.startDirection.angleTo(path.endDirection);

    expect(path.startDirection.length()).toBeCloseTo(1);
    expect(path.endDirection.length()).toBeCloseTo(1);
    expect(THREE.MathUtils.radToDeg(separation)).toBeGreaterThanOrEqual(65);
    expect(THREE.MathUtils.radToDeg(separation)).toBeLessThanOrEqual(115);
    expect(path.startDistance).toBeGreaterThanOrEqual(24);
    expect(path.startDistance).toBeLessThanOrEqual(29);
    expect(path.endDistance).toBe(CAMERA_ARRIVAL_DISTANCE);
  });

  it('lands exactly at the randomized final view', () => {
    const path = createCameraArrivalPath(() => 0.42);
    const sample = { position: new THREE.Vector3(), roll: 0 };

    sampleCameraArrival(path, 1, sample);

    expect(sample.position.length()).toBeCloseTo(CAMERA_ARRIVAL_DISTANCE);
    expect(
      sample.position.clone().normalize().distanceTo(path.endDirection)
    ).toBeCloseTo(0);
    expect(sample.roll).toBeCloseTo(path.endRoll);
  });
});
