import { useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CAMERA_ARRIVAL_DURATION_SECONDS,
  createCameraArrivalPath,
  sampleCameraArrival,
  type CameraArrivalSample,
} from '../../utils/cameraArrival';

const ORIGIN = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FALLBACK_UP = new THREE.Vector3(1, 0, 0);
const FORWARD = new THREE.Vector3();
const MAX_FRAME_DELTA_SECONDS = 1 / 20;

function applyCameraSample(camera: THREE.Camera, sample: CameraArrivalSample) {
  camera.position.copy(sample.position);

  const forward = FORWARD.copy(sample.position).negate().normalize();
  const upSource =
    Math.abs(forward.dot(WORLD_UP)) > 0.96 ? FALLBACK_UP : WORLD_UP;
  camera.up
    .copy(upSource)
    .addScaledVector(forward, -upSource.dot(forward))
    .normalize()
    .applyAxisAngle(forward, sample.roll);
  camera.lookAt(ORIGIN);
  camera.updateMatrixWorld(true);
}

export function CameraArrival() {
  const { camera, gl } = useThree();
  const path = useRef(createCameraArrivalPath());
  const sample = useRef<CameraArrivalSample>({
    position: new THREE.Vector3(),
    roll: 0,
  });
  const elapsed = useRef(0);
  const isAnimating = useRef(true);

  useLayoutEffect(() => {
    const reduceMotion =
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false;
    const initialProgress = reduceMotion ? 1 : 0;
    sampleCameraArrival(path.current, initialProgress, sample.current);
    applyCameraSample(camera, sample.current);
    isAnimating.current = !reduceMotion;
  }, [camera]);

  useEffect(() => {
    const stopArrival = () => {
      isAnimating.current = false;
    };

    gl.domElement.addEventListener('pointerdown', stopArrival);
    gl.domElement.addEventListener('wheel', stopArrival, { passive: true });

    return () => {
      gl.domElement.removeEventListener('pointerdown', stopArrival);
      gl.domElement.removeEventListener('wheel', stopArrival);
    };
  }, [gl]);

  useFrame((_state, delta) => {
    if (!isAnimating.current) return;

    // Background tabs can resume with a very large delta. Capping it keeps the
    // arrival smooth and prevents it from teleporting to the end on return.
    elapsed.current += Math.min(delta, MAX_FRAME_DELTA_SECONDS);
    const progress = Math.min(
      elapsed.current / CAMERA_ARRIVAL_DURATION_SECONDS,
      1
    );
    sampleCameraArrival(path.current, progress, sample.current);
    applyCameraSample(camera, sample.current);

    if (progress === 1) isAnimating.current = false;
  });

  return null;
}
