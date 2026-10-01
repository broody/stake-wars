import { useLayoutEffect, useRef } from 'react';
import type { Camera } from '@react-three/fiber';
import * as THREE from 'three';
import type { Run } from './sim';
import type { Vec3 } from './sphere';

export interface FrameContext {
  run: Run;
  alpha: number;
  radius: number;
  camera: Camera;
  size: { width: number; height: number };
  /** Interpolated player normal, screen-up and screen-right. */
  normal: Vec3;
  forward: Vec3;
  right: Vec3;
}

export type Renderer = (frame: FrameContext) => void;

/** Register a renderer that always sees the latest props. */
export function useRenderer(registry: Set<Renderer>, renderer: Renderer) {
  const latest = useRef(renderer);
  latest.current = renderer;
  useLayoutEffect(() => {
    const call: Renderer = (frame) => latest.current(frame);
    registry.add(call);
    return () => {
      registry.delete(call);
    };
  }, [registry]);
}

const basis = new THREE.Matrix4();
const ahead = new THREE.Vector3();
const right = new THREE.Vector3();

export const toVector = (out: THREE.Vector3, v: Vec3) => out.set(v.x, v.y, v.z);

/** Rotation that puts +Y on `normal` and +Z along `ahead`. */
export function surfaceRotation(
  out: THREE.Quaternion,
  normal: THREE.Vector3,
  target: THREE.Vector3
) {
  ahead.copy(target).projectOnPlane(normal).normalize();
  right.crossVectors(normal, ahead).normalize();
  basis.makeBasis(right, normal, ahead);
  return out.setFromRotationMatrix(basis);
}
