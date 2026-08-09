import { useRef, useEffect, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const IDLE_TIMEOUT = 10000; // 10 seconds in milliseconds

export const IdleCameraRotation: React.FC = () => {
  const { camera, gl } = useThree();
  const lastInteractionTime = useRef(Date.now());
  const isIdle = useRef(false);
  const rotationAxis = useRef(new THREE.Vector3());
  const targetRotationAxis = useRef(new THREE.Vector3());
  const rotationSpeed = useRef(0);
  const initialDistance = useRef(camera.position.length());
  const [idleRotationDirection] = useState(() => {
    // Random rotation axis and speed (set once on mount)
    const axis = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    ).normalize();
    const speed = 0.025 + Math.random() * 0.025; // 0.025-0.05 radians per second (extremely slow, half speed)
    return { axis, speed };
  });

  useEffect(() => {
    rotationAxis.current = idleRotationDirection.axis.clone();
    targetRotationAxis.current = idleRotationDirection.axis.clone();
    rotationSpeed.current = idleRotationDirection.speed;
    const resetIdleTimer = () => {
      lastInteractionTime.current = Date.now();
      isIdle.current = false;
    };

    // Listen only for click/touch interactions (not hover/move)
    const interactionEvents = ['mousedown', 'wheel', 'touchstart'];

    interactionEvents.forEach((event) => {
      gl.domElement.addEventListener(event, resetIdleTimer);
    });

    return () => {
      interactionEvents.forEach((event) => {
        gl.domElement.removeEventListener(event, resetIdleTimer);
      });
    };
  }, [gl, idleRotationDirection]);

  useFrame((_state, delta) => {
    const now = Date.now();
    const timeSinceLastInteraction = now - lastInteractionTime.current;

    // Check if we should be in idle mode
    if (timeSinceLastInteraction > IDLE_TIMEOUT && !isIdle.current) {
      isIdle.current = true;
    }

    // Apply idle rotation if idle
    if (isIdle.current) {
      // Gradually change the target rotation axis over time (every few seconds)
      // This creates a slowly drifting, evolving rotation
      const time = performance.now() * 0.0001; // Very slow time progression

      // Generate a new target axis using sine waves for smooth, continuous change
      targetRotationAxis.current
        .set(
          Math.sin(time * 0.7) * 0.5 + Math.cos(time * 0.3) * 0.5,
          Math.sin(time * 0.5) * 0.5 + Math.cos(time * 0.8) * 0.5,
          Math.sin(time * 0.9) * 0.5 + Math.cos(time * 0.4) * 0.5
        )
        .normalize();

      // Smoothly interpolate current axis toward target axis (very gradual)
      rotationAxis.current.lerp(targetRotationAxis.current, 0.01); // 1% per frame = very smooth
      rotationAxis.current.normalize();

      // Rotate camera around the origin (looking at center)
      const angle = rotationSpeed.current * delta;

      // Create rotation matrix
      const rotationMatrix = new THREE.Matrix4().makeRotationAxis(
        rotationAxis.current,
        angle
      );

      // Apply rotation to camera position
      camera.position.applyMatrix4(rotationMatrix);

      // Slowly zoom in and out using a sine wave
      // Zoom range: ±20% of initial distance over a long period
      const zoomTime = performance.now() * 0.00005; // Even slower for zoom (half the rotation speed)
      const zoomFactor = 1 + Math.sin(zoomTime) * 0.2; // Oscillates between 0.8 and 1.2
      const targetDistance = initialDistance.current * zoomFactor;
      const currentDistance = camera.position.length();

      // Gradually adjust distance to target
      const distanceDiff = targetDistance - currentDistance;
      if (Math.abs(distanceDiff) > 0.01) {
        const direction = camera.position.clone().normalize();
        camera.position.addScaledVector(direction, distanceDiff * 0.02); // 2% per frame
      }

      // Keep camera looking at center
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
    }
  });

  return null;
};
