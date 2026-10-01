// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TrooperController } from './trooperController';
import { bindTrooperOrbit, TrooperCameraOrbit } from './trooperCamera';

describe('trooper camera orbit', () => {
  it('smoothly zooms both ways and clamps extremes while remaining above the core', () => {
    const orbit = new TrooperCameraOrbit();
    const original = orbit.distance;
    orbit.zoom(-10000);
    expect(orbit.distance).toBe(original);
    orbit.update(1 / 60);
    expect(orbit.distance).toBeLessThan(original);
    expect(orbit.distance).toBeGreaterThan(1.1);
    for (let i = 0; i < 120; i++) orbit.update(1 / 60);
    expect(orbit.distance).toBeCloseTo(1.1, 8);
    orbit.drag(500, -10000);
    const position = new THREE.Vector3(),
      target = new THREE.Vector3();
    orbit.sample(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 1, 0),
      5.9,
      position,
      target
    );
    expect(position.z).toBeGreaterThan(5.9);
    orbit.zoom(10000);
    for (let i = 0; i < 120; i++) orbit.update(1 / 60);
    expect(orbit.distance).toBeCloseTo(12, 8);
  });
  it('preserves the original framing until dragged', () => {
    const orbit = new TrooperCameraOrbit();
    const position = new THREE.Vector3(),
      target = new THREE.Vector3();
    orbit.sample(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 1, 0),
      5.006,
      position,
      target
    );
    expect(position.distanceTo(new THREE.Vector3(0, -2.6, 6.756))).toBeLessThan(
      1e-10
    );
    expect(target.distanceTo(new THREE.Vector3(0, 0.3, 5.326))).toBeLessThan(
      1e-10
    );
  });
  it('orbits on every side of the sphere without moving the heading or entering the ground', () => {
    const orbit = new TrooperCameraOrbit();
    for (const n of [
      [0, 0, 1],
      [0, 1, 0],
      [0, -1, 0],
      [1, 0, 0],
    ]) {
      const normal = new THREE.Vector3(...n);
      const forward = new THREE.Vector3(1, 2, 3)
        .projectOnPlane(normal)
        .normalize();
      const before = forward.clone();
      for (const dy of [-10000, 10000]) {
        orbit.drag(1234, dy);
        const p = new THREE.Vector3(),
          t = new THREE.Vector3();
        orbit.sample(normal, forward, 5.9, p, t);
        expect(p.length()).toBeGreaterThan(5.9);
        expect(
          p.clone().sub(normal.clone().multiplyScalar(5.9)).dot(normal)
        ).toBeGreaterThan(0.3);
        expect(p.distanceTo(t)).toBeCloseTo(orbit.distance, 10);
        expect(forward.equals(before)).toBe(true);
        expect(orbit.yaw).toBeGreaterThanOrEqual(-Math.PI);
        expect(orbit.yaw).toBeLessThan(Math.PI);
      }
    }
  });
});

function setup() {
  const canvas = document.createElement('canvas');
  const captured = new Set<number>();
  canvas.setPointerCapture = vi.fn((id) => {
    captured.add(id);
  });
  canvas.hasPointerCapture = (id) => captured.has(id);
  canvas.releasePointerCapture = vi.fn((id) => {
    captured.delete(id);
  });
  const orbit = new TrooperCameraOrbit();
  const controller = new TrooperController();
  const cleanup = bindTrooperOrbit(canvas, orbit, (angle) =>
    controller.turn(angle)
  );
  const event = (
    type: string,
    button: number,
    buttons: number,
    x: number,
    y: number,
    id = 1
  ) => {
    const e = new MouseEvent(type, {
      button,
      buttons,
      clientX: x,
      clientY: y,
      cancelable: true,
    });
    Object.defineProperty(e, 'pointerId', { value: id });
    canvas.dispatchEvent(e);
  };
  return { canvas, orbit, controller, cleanup, event, captured };
}

it('normalizes pixel, line and page wheel input and removes the listener on cleanup', () => {
  const results = [
    { deltaMode: 0, deltaY: 800 },
    { deltaMode: 1, deltaY: 50 },
    { deltaMode: 2, deltaY: 1 },
  ].map((options) => {
    const { canvas, orbit, controller, cleanup } = setup();
    const event = new WheelEvent('wheel', { ...options, cancelable: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    for (let i = 0; i < 120; i++) orbit.update(1 / 60);
    const distance = orbit.distance;
    expect(distance).toBeGreaterThan(Math.hypot(1.43, 2.9));
    expect(controller.forward.toArray()).toEqual([0, 1, 0]);
    cleanup();
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -10000 }));
    for (let i = 0; i < 120; i++) orbit.update(1 / 60);
    expect(orbit.distance).toBeCloseTo(distance, 8);
    return distance;
  });
  expect(results[0]).toBeCloseTo(results[1], 8);
  expect(results[1]).toBeCloseTo(results[2], 8);
});

it('left-drag orbits without turning the character, retaining the view after release', () => {
  const { canvas, orbit, controller, cleanup, event, captured } = setup();
  event('pointerdown', 1, 4, 100, 100);
  event('pointermove', 1, 4, 200, 200);
  expect(orbit.yaw).toBe(0);
  event('pointerdown', 0, 1, 100, 100);
  event('pointermove', 0, 1, 200, 120);
  expect(orbit.yaw).toBeCloseTo(-0.5);
  expect(controller.forward.toArray()).toEqual([0, 1, 0]);
  expect(captured.has(1)).toBe(true);
  expect(canvas.style.cursor).toBe('grabbing');
  event('pointerup', 0, 0, 200, 120);
  event('pointermove', 0, 0, 300, 150);
  expect(orbit.yaw).toBeCloseTo(-0.5);
  expect(captured.size).toBe(0);
  expect(canvas.style.cursor).toBe('');
  cleanup();
});

it.each(['pointercancel', 'lostpointercapture', 'blur', 'cleanup'])(
  'releases capture on %s',
  (reason) => {
    const { canvas, orbit, cleanup, event, captured } = setup();
    event('pointerdown', 2, 2, 0, 0);
    if (reason === 'blur') window.dispatchEvent(new Event('blur'));
    else if (reason === 'cleanup') cleanup();
    else event(reason, 2, 0, 0, 0);
    event('pointermove', 2, 2, 100, 100);
    expect(orbit.yaw).toBe(0);
    expect(captured.size).toBe(0);
    expect(canvas.style.cursor).toBe('');
    cleanup();
  }
);

it('right-drag steers the character and W moves in the new direction', () => {
  const { orbit, controller, cleanup, event } = setup();
  orbit.yaw = -Math.PI / 2;
  event('pointerdown', 2, 2, 0, 0);
  expect(orbit.yaw).toBe(0);
  expect(controller.forward.x).toBeCloseTo(1);
  event('pointermove', 2, 2, 40, 10);
  expect(controller.forward.y).toBeLessThan(0);
  expect(controller.forward.dot(controller.normal)).toBeCloseTo(0);
  expect(orbit.yaw).toBe(0);
  for (let i = 0; i < 60; i++)
    controller.update(1 / 60, 5.006, { forward: 1, left: 0 });
  expect(controller.normal.x).toBeGreaterThan(0);
  expect(controller.normal.y).toBeLessThan(0);
  event('pointerup', 2, 0, 40, 10);
  const heading = controller.forward.clone();
  event('pointermove', 2, 0, 200, 10);
  expect(controller.forward.equals(heading)).toBe(true);
  cleanup();
});

it.each([Math.PI / 2, -Math.PI / 2, Math.PI - 0.001])(
  'right-click eases the camera without an initial jump at yaw %s',
  (yaw) => {
    const { orbit, controller, cleanup, event } = setup();
    orbit.yaw = yaw;
    const position = new THREE.Vector3(),
      target = new THREE.Vector3();
    const sample = () =>
      orbit.sample(
        controller.normal,
        controller.forward,
        5.006,
        position,
        target
      );
    sample();
    const beforePosition = position.clone(),
      beforeTarget = target.clone();
    event('pointerdown', 2, 2, 0, 0);
    sample();
    expect(position.distanceTo(beforePosition)).toBeLessThan(1e-10);
    expect(target.distanceTo(beforeTarget)).toBeLessThan(1e-10);
    const destination = controller.normal
      .clone()
      .multiplyScalar(5.326)
      .addScaledVector(controller.forward, 0.3);
    const initialGap = target.distanceTo(destination);
    orbit.update(1 / 60);
    sample();
    expect(target.distanceTo(destination)).toBeLessThan(initialGap);
    expect(target.distanceTo(destination)).toBeGreaterThan(initialGap * 0.5);
    for (let i = 0; i < 14; i++) {
      orbit.update(1 / 60);
      sample();
      expect(position.dot(controller.normal)).toBeGreaterThan(5.006);
      expect(position.distanceTo(target)).toBeCloseTo(orbit.distance, 10);
    }
    expect(target.distanceTo(destination)).toBeLessThan(0.004);
    cleanup();
  }
);

it('preserves camera continuity when another alignment interrupts the transition', () => {
  const { orbit, controller, cleanup, event } = setup();
  const position = new THREE.Vector3(),
    target = new THREE.Vector3();
  const sample = () =>
    orbit.sample(
      controller.normal,
      controller.forward,
      5.006,
      position,
      target
    );
  orbit.yaw = 2;
  sample();
  event('pointerdown', 2, 2, 0, 0);
  event('pointerup', 2, 0, 0, 0);
  orbit.update(1 / 60);
  orbit.drag(-100, 0);
  sample();
  const beforePosition = position.clone(),
    beforeTarget = target.clone();
  event('pointerdown', 2, 2, 0, 0);
  sample();
  expect(position.distanceTo(beforePosition)).toBeLessThan(1e-10);
  expect(target.distanceTo(beforeTarget)).toBeLessThan(1e-10);
  cleanup();
});

it('animates the full camera position and aim toward the moving follow pose', () => {
  const { orbit, controller, cleanup, event } = setup();
  const position = new THREE.Vector3(),
    target = new THREE.Vector3();
  const sample = () =>
    orbit.sample(
      controller.normal,
      controller.forward,
      5.006,
      position,
      target
    );
  orbit.yaw = 1.2;
  sample();
  const startPosition = position.clone(),
    startTarget = target.clone();
  event('pointerdown', 2, 2, 0, 0);
  event('pointermove', 2, 2, 60, 0);
  const destinationPosition = new THREE.Vector3(),
    destinationTarget = new THREE.Vector3();
  new TrooperCameraOrbit().sample(
    controller.normal,
    controller.forward,
    5.006,
    destinationPosition,
    destinationTarget
  );
  for (let i = 0; i < 5; i++) orbit.update(0.025);
  sample();
  expect(
    position.distanceTo(startPosition.clone().lerp(destinationPosition, 0.5))
  ).toBeLessThan(1e-10);
  expect(
    target.distanceTo(startTarget.clone().lerp(destinationTarget, 0.5))
  ).toBeLessThan(1e-10);
  for (let i = 0; i < 6; i++) orbit.update(0.025);
  sample();
  expect(position.distanceTo(destinationPosition)).toBeLessThan(1e-10);
  expect(target.distanceTo(destinationTarget)).toBeLessThan(1e-10);
  cleanup();
});

it('aims through the camera only on right-click/drag, including quick taps', () => {
  const { orbit, event, cleanup } = setup();
  event('pointerdown', 0, 1, 0, 0);
  event('pointermove', 0, 1, 100, 100);
  expect(orbit.consumeAimRequest()).toBe(false);
  event('pointerup', 0, 0, 100, 100);
  event('pointerdown', 2, 2, 100, 100);
  event('pointerup', 2, 0, 100, 100);
  event('lostpointercapture', 2, 0, 100, 100);
  expect(orbit.consumeAimRequest()).toBe(true);
  expect(orbit.consumeAimRequest()).toBe(false);
  event('pointerdown', 2, 2, 0, 0);
  expect(orbit.consumeAimRequest()).toBe(true);
  expect(orbit.consumeAimRequest()).toBe(true);
  window.dispatchEvent(new Event('blur'));
  expect(orbit.consumeAimRequest()).toBe(false);
  cleanup();
});
