import * as THREE from 'three';
import { CORE_RADIUS, extractSectorPositions } from './sectorGeometry';

export const JACKPOT_FOCUS_SECONDS = 2;
export const JACKPOT_HOLD_SECONDS = 4;
export const JACKPOT_RETURN_SECONDS = 1.5;
export const JACKPOT_MIN_DISTANCE = 1.3;
export const JACKPOT_MAX_DISTANCE = 16;
export const JACKPOT_CORE_CLEARANCE = 0.35;
const ORBIT_RADIUS = 3.2;
const ORBIT_HEIGHT = 2.4;
const ORBIT_SPEED = 0.12;
const ORBIT_RAMP_SECONDS = 2;

export function jackpotSectorAnchor(sectorId: number) {
  const positions = extractSectorPositions([sectorId], CORE_RADIUS);
  const normal = new THREE.Vector3(
    (positions[0] + positions[3] + positions[6]) / 3,
    (positions[1] + positions[4] + positions[7]) / 3,
    (positions[2] + positions[5] + positions[8]) / 3
  ).normalize();
  return {
    normal,
    position: normal.clone().multiplyScalar(CORE_RADIUS + 0.85),
    orientation: new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      normal
    ),
  };
}

export interface CameraPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export function createCameraPose(): CameraPose {
  return {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  };
}

export function createJackpotCameraPath(sectorId: number, start: CameraPose) {
  const anchor = jackpotSectorAnchor(sectorId);
  const tangent = start.position
    .clone()
    .sub(anchor.position)
    .projectOnPlane(anchor.normal);
  // Looking directly down at a sector has no preferred tangent. Use screen-up
  // to choose a stable approach, including sectors at either world pole.
  if (tangent.lengthSq() < 0.000001) {
    tangent
      .set(0, 1, 0)
      .applyQuaternion(start.quaternion)
      .projectOnPlane(anchor.normal);
  }
  if (tangent.lengthSq() < 0.000001) {
    tangent
      .set(Math.abs(anchor.normal.y) < 0.9 ? 0 : 1, 1, 0)
      .projectOnPlane(anchor.normal);
  }
  tangent.normalize();
  return {
    anchor,
    tangent,
    start: {
      position: start.position.clone(),
      quaternion: start.quaternion.clone(),
    },
  };
}

export type JackpotCameraPath = ReturnType<typeof createJackpotCameraPath>;

const startDirection = new THREE.Vector3();
const endDirection = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const blendedRotation = new THREE.Quaternion();
const lookMatrix = new THREE.Matrix4();
const destination = createCameraPose();
const constrainedOffset = new THREE.Vector3();
const constrainedTangent = new THREE.Vector3();

export function constrainJackpotCamera(
  position: THREE.Vector3,
  anchor: JackpotCameraPath['anchor']
) {
  constrainedOffset.copy(position).sub(anchor.position);
  const distance = THREE.MathUtils.clamp(
    constrainedOffset.length(),
    JACKPOT_MIN_DISTANCE,
    JACKPOT_MAX_DISTANCE
  );
  if (constrainedOffset.lengthSq() < 0.000001) {
    constrainedOffset.copy(anchor.normal);
  }
  constrainedOffset.setLength(distance);

  // Keep the camera above a plane tangent to the Core, with room for its near
  // clipping plane. The entire sightline to the jackpot stays outside the
  // Core, even when zooming outward from a low viewing angle.
  const minimumHeight =
    CORE_RADIUS + JACKPOT_CORE_CLEARANCE - anchor.position.dot(anchor.normal);
  if (constrainedOffset.dot(anchor.normal) < minimumHeight) {
    constrainedTangent.copy(constrainedOffset).projectOnPlane(anchor.normal);
    if (constrainedTangent.lengthSq() < 0.000001) {
      constrainedTangent
        .set(Math.abs(anchor.normal.y) < 0.9 ? 0 : 1, 1, 0)
        .projectOnPlane(anchor.normal);
    }
    constrainedTangent.setLength(
      Math.sqrt(distance * distance - minimumHeight * minimumHeight)
    );
    constrainedOffset
      .copy(constrainedTangent)
      .addScaledVector(anchor.normal, minimumHeight);
  }
  position.copy(anchor.position).add(constrainedOffset);
}

export function jackpotOrbitAngle(orbitTime: number) {
  const ramp = THREE.MathUtils.clamp(orbitTime / ORBIT_RAMP_SECONDS, 0, 1);
  // Integrate a smoothstep speed ramp so the hold ends without a sudden turn.
  return (
    ORBIT_SPEED *
    (ORBIT_RAMP_SECONDS * (ramp ** 3 - 0.5 * ramp ** 4) +
      Math.max(0, orbitTime - ORBIT_RAMP_SECONDS))
  );
}

export function interpolateCameraPose(
  start: CameraPose,
  end: CameraPose,
  progress: number,
  target: CameraPose
) {
  const eased = THREE.MathUtils.smootherstep(progress, 0, 1);
  startDirection.copy(start.position).normalize();
  endDirection.copy(end.position).normalize();
  rotation.setFromUnitVectors(startDirection, endDirection);
  blendedRotation.identity().slerp(rotation, eased);
  // Travel around the Core, rather than taking a chord through its surface.
  target.position
    .copy(startDirection)
    .applyQuaternion(blendedRotation)
    .multiplyScalar(
      THREE.MathUtils.lerp(
        start.position.length(),
        end.position.length(),
        eased
      )
    );
  target.quaternion.slerpQuaternions(start.quaternion, end.quaternion, eased);
}

export function sampleJackpotCamera(
  path: JackpotCameraPath,
  elapsed: number,
  target: CameraPose
) {
  const orbitTime = Math.max(
    0,
    elapsed - JACKPOT_FOCUS_SECONDS - JACKPOT_HOLD_SECONDS
  );
  const orbitAngle = jackpotOrbitAngle(orbitTime);
  destination.position
    .copy(path.tangent)
    .applyAxisAngle(path.anchor.normal, orbitAngle)
    .multiplyScalar(ORBIT_RADIUS)
    .addScaledVector(path.anchor.normal, ORBIT_HEIGHT)
    .add(path.anchor.position);
  lookMatrix.lookAt(
    destination.position,
    path.anchor.position,
    path.anchor.normal
  );
  destination.quaternion.setFromRotationMatrix(lookMatrix);
  interpolateCameraPose(
    path.start,
    destination,
    elapsed / JACKPOT_FOCUS_SECONDS,
    target
  );
}
