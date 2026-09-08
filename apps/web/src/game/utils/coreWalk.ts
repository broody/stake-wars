import * as THREE from 'three';

const MIN_DIRECTION_LENGTH_SQUARED = 0.000001;

export interface CoreSurfaceFrame {
  normal: THREE.Vector3;
  forward: THREE.Vector3;
}

export function tangentDirection(
  direction: THREE.Vector3,
  normal: THREE.Vector3,
  fallback: THREE.Vector3
): THREE.Vector3 {
  direction.addScaledVector(normal, -direction.dot(normal));
  if (direction.lengthSq() < MIN_DIRECTION_LENGTH_SQUARED) {
    direction.copy(fallback);
    direction.addScaledVector(normal, -direction.dot(normal));
  }
  return direction.normalize();
}

export function rotateSurfaceForward(
  forward: THREE.Vector3,
  normal: THREE.Vector3,
  angle: number
): THREE.Vector3 {
  forward.applyAxisAngle(normal, angle);
  return tangentDirection(forward, normal, new THREE.Vector3(0, 1, 0));
}

export function advanceCoreSurfaceFrame(
  frame: CoreSurfaceFrame,
  travelDirection: THREE.Vector3,
  angularDistance: number
): CoreSurfaceFrame {
  if (angularDistance === 0 || travelDirection.lengthSq() === 0) return frame;

  const tangent = tangentDirection(
    travelDirection,
    frame.normal,
    frame.forward
  );
  const rotationAxis = new THREE.Vector3()
    .crossVectors(frame.normal, tangent)
    .normalize();
  const rotation = new THREE.Quaternion().setFromAxisAngle(
    rotationAxis,
    angularDistance
  );

  frame.normal.applyQuaternion(rotation).normalize();
  frame.forward.applyQuaternion(rotation);
  tangentDirection(frame.forward, frame.normal, tangent);
  return frame;
}
