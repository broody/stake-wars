import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  advanceCoreSurfaceFrame,
  rotateSurfaceForward,
  tangentDirection,
} from './coreWalk';

describe('Core surface walking', () => {
  it('projects camera directions onto the local horizon', () => {
    const normal = new THREE.Vector3(0, 0, 1);
    const direction = tangentDirection(
      new THREE.Vector3(0, 2, 3),
      normal,
      new THREE.Vector3(1, 0, 0)
    );

    expect(direction.dot(normal)).toBeCloseTo(0, 8);
    expect(direction.toArray()).toEqual([0, 1, 0]);
  });

  it('turns the heading around the current surface normal', () => {
    const normal = new THREE.Vector3(0, 0, 1);
    const forward = rotateSurfaceForward(
      new THREE.Vector3(0, 1, 0),
      normal,
      -Math.PI / 2
    );

    expect(forward.x).toBeCloseTo(1, 8);
    expect(forward.y).toBeCloseTo(0, 8);
    expect(forward.dot(normal)).toBeCloseTo(0, 8);
  });

  it('parallel-transports the heading while moving around the Core', () => {
    const frame = {
      normal: new THREE.Vector3(0, 0, 1),
      forward: new THREE.Vector3(0, 1, 0),
    };

    advanceCoreSurfaceFrame(frame, new THREE.Vector3(0, 1, 0), Math.PI / 2);

    expect(frame.normal.y).toBeCloseTo(1, 8);
    expect(frame.normal.z).toBeCloseTo(0, 8);
    expect(frame.forward.z).toBeCloseTo(-1, 8);
    expect(frame.forward.dot(frame.normal)).toBeCloseTo(0, 8);
  });
});
