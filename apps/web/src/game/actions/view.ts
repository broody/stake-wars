import * as THREE from 'three';
import { sampleFollowCamera, followPullback } from '../survivors/followCamera';
import type { ActionSpec } from './actions';

export type ViewId = 'game' | 'front' | 'side' | 'back' | 'top';

export const VIEWS: { value: ViewId; label: string }[] = [
  { value: 'game', label: 'GAME' },
  { value: 'front', label: 'FRONT' },
  { value: 'side', label: 'SIDE' },
  { value: 'back', label: 'BACK' },
  { value: 'top', label: 'TOP' },
];

/** Dragged and zoomed offsets from a view, in radians and a distance factor. */
export interface Orbit {
  yaw: number;
  pitch: number;
  zoom: number;
}

export const newOrbit = (): Orbit => ({ yaw: 0, pitch: 0, zoom: 1 });

/** Layers drawn over the Vanguard. */
export interface Overlays {
  /** The game's slash marks, crescents, shockwaves and shield. */
  effects: boolean;
  /** The blade's path through the current swing. */
  path: boolean;
  /** Target Mites. */
  targets: boolean;
}

/** The game's composite of clips, or one clip played as authored. */
export type Source = 'game' | 'authored';

/** Degrees around the Vanguard from its front, toward its right. */
const YAW: Record<Exclude<ViewId, 'game'>, number> = {
  front: 0,
  side: 90,
  back: 180,
  top: 180,
};
/** The run's follow camera uses the game canvas's field of view. */
const GAME_FOV = 75;
const CLOSE_FOV = 35;
/** Height on the body the close views look at, in world units. */
const LOOK_HEIGHT = 0.24;
const RAD = Math.PI / 180;

const s = {
  up: new THREE.Vector3(),
  ahead: new THREE.Vector3(),
  right: new THREE.Vector3(),
  direction: new THREE.Vector3(),
  look: new THREE.Vector3(),
};

/**
 * Point `camera` at a Vanguard standing at unit `normal` and facing
 * `heading`. The game view is the run's follow camera, with `forward` as
 * screen-up; the others circle the Vanguard. Returns the point looked at.
 */
export function placeCamera(
  camera: THREE.PerspectiveCamera,
  view: ViewId,
  orbit: Orbit,
  framing: ActionSpec['framing'],
  subject: { normal: THREE.Vector3; heading: THREE.Vector3 },
  forward: THREE.Vector3,
  radius: number,
  aspect: number
) {
  const up = s.up.copy(subject.normal).normalize();
  const fov = view === 'game' ? GAME_FOV : CLOSE_FOV;
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  if (view === 'game') {
    const ahead = s.ahead.copy(forward).projectOnPlane(up).normalize();
    const pullback = followPullback(fov, aspect);
    sampleFollowCamera(
      up,
      ahead,
      radius,
      pullback,
      camera.position,
      s.look,
      camera.up
    );
    camera.lookAt(s.look);
    return s.look;
  }
  const facing = s.ahead.copy(subject.heading).projectOnPlane(up).normalize();
  const right = s.right.crossVectors(facing, up);
  const yaw = YAW[view] * RAD + orbit.yaw;
  const pitch = Math.min(
    88 * RAD,
    Math.max(
      -5 * RAD,
      (view === 'top' ? 88 : framing.pitch) * RAD + orbit.pitch
    )
  );
  const direction = s.direction
    .copy(facing)
    .multiplyScalar(Math.cos(yaw))
    .addScaledVector(right, Math.sin(yaw));
  const distance = framing.distance * orbit.zoom;
  s.look.copy(up).multiplyScalar(radius + LOOK_HEIGHT);
  camera.position
    .copy(s.look)
    .addScaledVector(direction, Math.cos(pitch) * distance)
    .addScaledVector(up, Math.sin(pitch) * distance);
  // The camera's own up, so the view stays upright even looking straight down.
  camera.up
    .copy(up)
    .multiplyScalar(Math.cos(pitch))
    .addScaledVector(direction, -Math.sin(pitch));
  camera.lookAt(s.look);
  return s.look;
}
