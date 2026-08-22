import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleArbiterOrbit } from '../../utils/arbiterOrbit';

const CORE = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const CAMERA_ORBIT_RADIUS = 25;
const CAMERA_ORBIT_ELEVATION = -2.5;
const CAMERA_PHASE_OFFSET = THREE.MathUtils.degToRad(-4);
const TRANSITION_DURATION_SECONDS = 1.25;

export function ArbiterCameraTracker({ active }: { active: boolean }) {
  const { camera } = useThree();
  const wasActive = useRef(false);
  const transitionElapsed = useRef(0);
  const startPosition = useRef(new THREE.Vector3());
  const startUp = useRef(new THREE.Vector3());
  const desiredPosition = useRef(new THREE.Vector3());
  const desiredUp = useRef(new THREE.Vector3());
  const startDirection = useRef(new THREE.Vector3());
  const desiredDirection = useRef(new THREE.Vector3());
  const blendedDirection = useRef(new THREE.Vector3());
  const orbitRotation = useRef(new THREE.Quaternion());
  const blendedRotation = useRef(new THREE.Quaternion());
  const prefersReducedMotion = useMemo(
    () =>
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false,
    []
  );

  useFrame(({ clock }, delta) => {
    if (!active) {
      wasActive.current = false;
      return;
    }

    if (!wasActive.current) {
      wasActive.current = true;
      transitionElapsed.current = 0;
      startPosition.current.copy(camera.position);
      startUp.current.copy(camera.up);
    }

    sampleArbiterOrbit(
      clock.getElapsedTime(),
      prefersReducedMotion,
      CAMERA_PHASE_OFFSET,
      desiredPosition.current,
      desiredUp.current
    );
    desiredPosition.current
      .setLength(CAMERA_ORBIT_RADIUS)
      .addScaledVector(desiredUp.current, CAMERA_ORBIT_ELEVATION);
    desiredUp.current.copy(WORLD_UP);

    transitionElapsed.current += delta;
    const progress = prefersReducedMotion
      ? 1
      : THREE.MathUtils.smoothstep(
          transitionElapsed.current / TRANSITION_DURATION_SECONDS,
          0,
          1
        );

    startDirection.current.copy(startPosition.current).normalize();
    desiredDirection.current.copy(desiredPosition.current).normalize();
    orbitRotation.current.setFromUnitVectors(
      startDirection.current,
      desiredDirection.current
    );
    blendedRotation.current.identity().slerp(orbitRotation.current, progress);
    blendedDirection.current
      .copy(startDirection.current)
      .applyQuaternion(blendedRotation.current)
      .normalize();

    camera.position
      .copy(blendedDirection.current)
      .multiplyScalar(
        THREE.MathUtils.lerp(
          startPosition.current.length(),
          desiredPosition.current.length(),
          progress
        )
      );
    camera.up
      .copy(startUp.current)
      .lerp(desiredUp.current, progress)
      .normalize();
    camera.lookAt(CORE);
    camera.updateMatrixWorld(true);
  });

  return null;
}
