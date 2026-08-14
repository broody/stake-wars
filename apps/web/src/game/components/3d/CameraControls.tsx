import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { TrackballControls as TrackballControlsImpl } from 'three-stdlib';
import * as THREE from 'three';

export const CameraControls = () => {
  const { camera, gl } = useThree();
  const controlsRef = useRef<TrackballControlsImpl | null>(null);
  const isAltPressed = useRef(false);
  const isDragging = useRef(false);
  const lastMouseX = useRef(0);
  const isReinitializing = useRef(false);
  const savedCameraState = useRef({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    up: new THREE.Vector3(),
  });

  useEffect(() => {
    const controls = new TrackballControlsImpl(camera, gl.domElement);

    // Configure trackball controls
    controls.rotateSpeed = 2.0;
    controls.noPan = true;
    controls.noZoom = false;
    controls.minDistance = 8;
    controls.maxDistance = 50;
    controls.dynamicDampingFactor = 0.1;

    controlsRef.current = controls;

    // Handle Alt key press
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || e.altKey) {
        isAltPressed.current = true;
        if (controls) {
          // Save current camera state before disabling controls
          savedCameraState.current.position.copy(camera.position);
          savedCameraState.current.quaternion.copy(camera.quaternion);
          savedCameraState.current.up.copy(camera.up);

          controls.enabled = false; // Disable normal trackball when Alt is pressed
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || !e.altKey) {
        const wasAltPressed = isAltPressed.current;
        isAltPressed.current = false;
        isDragging.current = false;

        if (controls && wasAltPressed) {
          // Block control updates during reinitialization
          isReinitializing.current = true;

          // Apply the saved camera state from mouse up
          camera.position.copy(savedCameraState.current.position);
          camera.quaternion.copy(savedCameraState.current.quaternion);
          camera.up.copy(savedCameraState.current.up);
          camera.updateMatrixWorld(true);

          // Dispose old controls
          controls.dispose();

          // Small delay to ensure camera state is applied
          requestAnimationFrame(() => {
            // Create fresh controls with the rolled camera state
            const newControls = new TrackballControlsImpl(
              camera,
              gl.domElement
            );
            newControls.rotateSpeed = 2.0;
            newControls.noPan = true;
            newControls.noZoom = false;
            newControls.minDistance = 8;
            newControls.maxDistance = 30;
            newControls.dynamicDampingFactor = 0.1;
            newControls.target.set(0, 0, 0);

            controlsRef.current = newControls;
            newControls.update();

            // Re-enable control updates
            isReinitializing.current = false;
          });
        }
      }
    };

    // Handle mouse movement for roll rotation
    const handleMouseDown = (e: MouseEvent) => {
      if (isAltPressed.current) {
        isDragging.current = true;
        lastMouseX.current = e.clientX;
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isAltPressed.current && isDragging.current) {
        const deltaX = e.clientX - lastMouseX.current;

        if (Math.abs(deltaX) > 0) {
          lastMouseX.current = e.clientX;

          // Rotate camera around its viewing axis (roll)
          const rollSpeed = 0.01;
          const angle = deltaX * rollSpeed;

          // Get the camera's forward direction (from camera to target)
          const direction = new THREE.Vector3(0, 0, -1);
          direction.applyQuaternion(camera.quaternion);
          direction.normalize();

          // Create rotation quaternion around the forward axis
          const quaternion = new THREE.Quaternion();
          quaternion.setFromAxisAngle(direction, angle);

          // Apply rotation to camera's quaternion
          camera.quaternion.premultiply(quaternion);
          camera.quaternion.normalize();

          // Force update the camera matrix
          camera.updateMatrix();
          camera.updateMatrixWorld(true);
        }

        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isDragging.current && isAltPressed.current) {
        isDragging.current = false;

        // Immediately save the final camera state and reinitialize controls
        savedCameraState.current.position.copy(camera.position);
        savedCameraState.current.quaternion.copy(camera.quaternion);
        savedCameraState.current.up.copy(camera.up);

        // Don't reinitialize yet - wait for Alt release
        e.preventDefault();
        e.stopPropagation();
      } else if (isDragging.current) {
        isDragging.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Add event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    gl.domElement.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      gl.domElement.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      controls.dispose();
    };
  }, [camera, gl]);

  useFrame(() => {
    // Only update controls when not in Alt mode and not reinitializing
    if (!isAltPressed.current && !isReinitializing.current) {
      controlsRef.current?.update();
    }
  });

  return null;
};
