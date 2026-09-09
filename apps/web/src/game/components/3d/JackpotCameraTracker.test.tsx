// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { JackpotCameraTracker } from './JackpotCameraTracker';
import {
  JACKPOT_CORE_CLEARANCE,
  jackpotSectorAnchor,
} from '../../utils/jackpotCamera';
import { CORE_RADIUS } from '../../utils/sectorGeometry';

let frame: (_state: unknown, delta: number) => void;
let camera: THREE.PerspectiveCamera;
let canvas: HTMLCanvasElement;
let gl: { domElement: HTMLCanvasElement };
let root: Root;
let container: HTMLDivElement;
const onControlChange = vi.fn();

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ camera, gl }),
  useFrame: (callback: typeof frame) => {
    frame = callback;
  },
}));

function advance(seconds: number) {
  act(() => {
    for (let index = 0; index < Math.ceil(seconds * 60); index += 1) {
      frame({}, 1 / 60);
    }
  });
}

function render(tracking = true, active = true) {
  act(() => {
    root.render(
      <JackpotCameraTracker
        active={active}
        tracking={tracking}
        sectorId={795}
        onControlChange={onControlChange}
      />
    );
  });
}

function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: 'mouse' },
  });
  (type === 'pointerdown' ? canvas : document).dispatchEvent(event);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  onControlChange.mockClear();
  camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100);
  camera.position.set(0, 0, 15);
  camera.lookAt(0, 0, 0);
  canvas = document.createElement('canvas');
  gl = { domElement: canvas };
  Object.defineProperties(canvas, {
    clientWidth: { value: 1280 },
    clientHeight: { value: 720 },
    releasePointerCapture: { value: vi.fn() },
  });
  container = document.createElement('div');
  document.body.append(canvas, container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  canvas.remove();
  container.remove();
  vi.unstubAllGlobals();
});

describe('focused jackpot controls', () => {
  it('accepts drag and wheel input, then resumes orbiting from the user framing', () => {
    render();
    advance(2.2);
    const anchor = jackpotSectorAnchor(795);
    const closeup = camera.position.clone();
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    expect(camera.position.distanceTo(anchor.position)).toBeLessThan(4);

    pointer('pointerdown', 640, 360);
    pointer('pointermove', 900, 460);
    // Allow drag inertia to settle before checking that holding the pointer
    // pauses the automatic orbit.
    advance(3);
    const dragged = camera.position.clone();
    const zoomedDistance = dragged.distanceTo(anchor.position);
    expect(dragged.distanceTo(closeup)).toBeGreaterThan(0.5);
    advance(6);
    expect(camera.position.distanceTo(dragged)).toBeLessThan(0.0001);

    pointer('pointerup', 900, 460);
    advance(3);
    expect(camera.position.distanceTo(dragged)).toBeLessThan(0.0001);
    advance(3);
    expect(camera.position.distanceTo(dragged)).toBeGreaterThan(0.1);
    expect(camera.position.distanceTo(anchor.position)).toBeCloseTo(
      zoomedDistance
    );
  });

  it('blocks rotation and zoom from moving the camera into the Core', () => {
    render();
    advance(2.2);
    const anchor = jackpotSectorAnchor(795);
    pointer('pointerdown', 640, 360);
    pointer('pointermove', 640, -3000);
    pointer('pointerup', 640, -3000);
    for (const deltaY of [100, -100]) {
      for (let step = 0; step < 100; step += 1) {
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY }));
        advance(1 / 60);
        expect(camera.position.dot(anchor.normal)).toBeGreaterThanOrEqual(
          CORE_RADIUS + JACKPOT_CORE_CLEARANCE - 1e-9
        );
      }
    }
  });

  it('restores the original view and removes focus controls when closed', () => {
    const original = camera.position.clone();
    const originalRotation = camera.quaternion.clone();
    render();
    advance(2.2);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    render(false);
    advance(2);
    expect(camera.position.distanceTo(original)).toBeCloseTo(0);
    expect(camera.quaternion.angleTo(originalRotation)).toBeCloseTo(0);
    expect(onControlChange).toHaveBeenLastCalledWith(false);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    advance(1);
    expect(camera.position.distanceTo(original)).toBeCloseTo(0);
  });
});
