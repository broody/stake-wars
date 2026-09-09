import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three-stdlib';
import * as THREE from 'three';
import {
  JACKPOT_FOCUS_SECONDS,
  JACKPOT_HOLD_SECONDS,
  JACKPOT_MIN_DISTANCE,
  JACKPOT_MAX_DISTANCE,
  JACKPOT_RETURN_SECONDS,
  constrainJackpotCamera,
  createCameraPose,
  createJackpotCameraPath,
  interpolateCameraPose,
  jackpotOrbitAngle,
  sampleJackpotCamera,
  type JackpotCameraPath,
} from '../../utils/jackpotCamera';

export function JackpotCameraTracker({
  active,
  tracking,
  sectorId,
  onControlChange,
}: {
  active: boolean;
  tracking: boolean;
  sectorId: number | null;
  onControlChange: (controlled: boolean) => void;
}) {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  const previousTouchAction = useRef<string | null>(null);
  const interacting = useRef(false);
  const idleElapsed = useRef(0);
  const orbitOffset = useRef(new THREE.Vector3());
  const path = useRef<JackpotCameraPath | null>(null);
  const trackedSector = useRef<number | null>(null);
  const returning = useRef(false);
  const elapsed = useRef(0);
  const sample = useRef(createCameraPose());
  const originalView = useRef(createCameraPose());
  const returnStart = useRef(createCameraPose());
  const prefersReducedMotion = useMemo(
    () =>
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false,
    []
  );

  const disposeControls = useCallback(() => {
    controls.current?.dispose();
    controls.current = null;
    if (previousTouchAction.current !== null) {
      gl.domElement.style.touchAction = previousTouchAction.current;
      previousTouchAction.current = null;
    }
    interacting.current = false;
    idleElapsed.current = 0;
  }, [gl]);

  useEffect(() => disposeControls, [camera, disposeControls]);

  useFrame((_state, delta) => {
    // A different scene or tracker takes priority immediately; do not run the
    // return animation over a Beacon camera move.
    if (!active) {
      if (path.current) {
        disposeControls();
        path.current = null;
        returning.current = false;
        onControlChange(false);
      }
      return;
    }
    const shouldTrack = tracking && sectorId !== null;
    if (
      shouldTrack &&
      (!path.current || returning.current || trackedSector.current !== sectorId)
    ) {
      if (!path.current) {
        originalView.current.position.copy(camera.position);
        originalView.current.quaternion.copy(camera.quaternion);
        onControlChange(true);
      }
      disposeControls();
      path.current = createJackpotCameraPath(sectorId, camera);
      trackedSector.current = sectorId;
      returning.current = false;
      elapsed.current = 0;
    }
    if (!path.current) return;

    if (!shouldTrack && !returning.current) {
      disposeControls();
      returning.current = true;
      elapsed.current = 0;
      returnStart.current.position.copy(camera.position);
      returnStart.current.quaternion.copy(camera.quaternion);
    }
    const frameDelta = Math.min(delta, 1 / 20);
    elapsed.current += frameDelta;

    if (controls.current) {
      const previousIdle = idleElapsed.current;
      idleElapsed.current = interacting.current ? 0 : previousIdle + frameDelta;
      if (!interacting.current && !prefersReducedMotion) {
        const angle =
          jackpotOrbitAngle(idleElapsed.current - JACKPOT_HOLD_SECONDS) -
          jackpotOrbitAngle(previousIdle - JACKPOT_HOLD_SECONDS);
        orbitOffset.current
          .copy(camera.position)
          .sub(path.current.anchor.position)
          .applyAxisAngle(path.current.anchor.normal, angle);
        camera.position
          .copy(path.current.anchor.position)
          .add(orbitOffset.current);
      }
      controls.current.update();
      constrainJackpotCamera(camera.position, path.current.anchor);
      camera.lookAt(path.current.anchor.position);
      camera.updateMatrixWorld(true);
      return;
    }

    if (returning.current) {
      const progress = prefersReducedMotion
        ? 1
        : elapsed.current / JACKPOT_RETURN_SECONDS;
      interpolateCameraPose(
        returnStart.current,
        originalView.current,
        progress,
        sample.current
      );
      if (progress >= 1) {
        path.current = null;
        returning.current = false;
        onControlChange(false);
      }
    } else {
      sampleJackpotCamera(
        path.current,
        prefersReducedMotion ? JACKPOT_FOCUS_SECONDS : elapsed.current,
        sample.current
      );
    }

    camera.position.copy(sample.current.position);
    camera.quaternion.copy(sample.current.quaternion);
    camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    camera.updateMatrixWorld(true);

    if (
      path.current &&
      !returning.current &&
      (prefersReducedMotion || elapsed.current >= JACKPOT_FOCUS_SECONDS)
    ) {
      const anchor = path.current.anchor;
      camera.up.copy(anchor.normal);
      previousTouchAction.current = gl.domElement.style.touchAction;
      const orbitControls = new OrbitControls(camera, gl.domElement);
      orbitControls.target.copy(anchor.position);
      orbitControls.enablePan = false;
      orbitControls.enableDamping = true;
      orbitControls.dampingFactor = 0.08;
      orbitControls.rotateSpeed = 0.6;
      orbitControls.zoomSpeed = 0.8;
      orbitControls.minDistance = JACKPOT_MIN_DISTANCE;
      orbitControls.maxDistance = JACKPOT_MAX_DISTANCE;
      orbitControls.minPolarAngle = 0.04;
      orbitControls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
      };
      orbitControls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_ROTATE,
      };
      orbitControls.addEventListener('start', () => {
        interacting.current = true;
        idleElapsed.current = 0;
      });
      orbitControls.addEventListener('end', () => {
        interacting.current = false;
        idleElapsed.current = 0;
      });
      // Enforce clearance during input events as well as animation frames.
      orbitControls.addEventListener('change', () => {
        constrainJackpotCamera(camera.position, anchor);
        camera.lookAt(anchor.position);
        camera.updateMatrixWorld(true);
      });
      orbitControls.update();
      controls.current = orbitControls;
    }
  });

  return null;
}
