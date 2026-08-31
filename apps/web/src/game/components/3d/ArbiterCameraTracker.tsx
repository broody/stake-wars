import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleArbiterOrbit } from '../../utils/arbiterOrbit';

const CORE = new THREE.Vector3();
const CAMERA_ORBIT_RADIUS = 25;
const CAMERA_ORBIT_ELEVATION = 3.75;
const PROJECTION_CAMERA_ORBIT_RADIUS = 22.5;
const PROJECTION_CAMERA_PHASE_OFFSET = THREE.MathUtils.degToRad(18);
const PROJECTION_CAMERA_DAMPING = 4.5;
const TRANSITION_DURATION_SECONDS = 1.25;

export function ArbiterCameraTracker({
  active,
  projectionActive,
}: {
  active: boolean;
  projectionActive: boolean;
}) {
  const { camera } = useThree();
  const wasActive = useRef(false);
  const transitionElapsed = useRef(0);
  const cameraOrbitRadius = useRef(CAMERA_ORBIT_RADIUS);
  const projectionPhaseOffset = useRef(0);
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
      cameraOrbitRadius.current = CAMERA_ORBIT_RADIUS;
      projectionPhaseOffset.current = 0;
      return;
    }

    if (!wasActive.current) {
      wasActive.current = true;
      transitionElapsed.current = 0;
      startPosition.current.copy(camera.position);
      startUp.current.copy(camera.up);
    }

    const targetProjectionPhaseOffset = projectionActive
      ? PROJECTION_CAMERA_PHASE_OFFSET
      : 0;
    projectionPhaseOffset.current = prefersReducedMotion
      ? targetProjectionPhaseOffset
      : THREE.MathUtils.damp(
          projectionPhaseOffset.current,
          targetProjectionPhaseOffset,
          PROJECTION_CAMERA_DAMPING,
          delta
        );
    const targetCameraOrbitRadius = projectionActive
      ? PROJECTION_CAMERA_ORBIT_RADIUS
      : CAMERA_ORBIT_RADIUS;
    cameraOrbitRadius.current = prefersReducedMotion
      ? targetCameraOrbitRadius
      : THREE.MathUtils.damp(
          cameraOrbitRadius.current,
          targetCameraOrbitRadius,
          PROJECTION_CAMERA_DAMPING,
          delta
        );

    sampleArbiterOrbit(
      clock.getElapsedTime(),
      prefersReducedMotion,
      projectionPhaseOffset.current,
      desiredPosition.current,
      desiredUp.current
    );
    desiredPosition.current
      .setLength(cameraOrbitRadius.current)
      .addScaledVector(desiredUp.current, CAMERA_ORBIT_ELEVATION);

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
