// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  TROOPER_GAITS,
  TROOPER_SCALE,
  trooperGait,
  TrooperController,
  trooperInput,
  isTypingTarget,
} from './trooperController';

describe('trooper movement on the Core', () => {
  it('ignores typing fields and nested editable content', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const child = editor.appendChild(document.createElement('span'));
    expect(isTypingTarget(child)).toBe(true);
    expect(isTypingTarget(document.createElement('canvas'))).toBe(false);
  });
  it('cancels opposing keys and accepts diagonals', () => {
    expect(trooperInput(new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD']))).toEqual({
      forward: 0,
      left: 0,
    });
    expect(trooperInput(new Set(['KeyW', 'KeyA']))).toEqual({
      forward: 1,
      left: 1,
    });
  });
  it.each([
    ['Forward', 1, 0, 1],
    ['Backward', -1, 0, -1],
    ['Strafe_Left', 0, 1, -1],
    ['Strafe_Right', 0, -1, 1],
  ] as const)(
    'moves %s at its authored scaled speed',
    (name, forward, left, sign) => {
      const player = new TrooperController();
      player.weights.Idle = 0;
      player.weights[name] = 1;
      for (let i = 0; i < 100; i++)
        player.update(0.01, 5.006, { forward, left });
      const distance = Math.acos(player.normal.z) * 5.006;
      expect(distance).toBeCloseTo(
        TROOPER_GAITS[name].speed * TROOPER_SCALE,
        6
      );
      expect(Math.sign(left ? player.normal.x : player.normal.y)).toBe(sign);
    }
  );
  it('keeps feet radial and heading tangent after circling the globe and crossing poles', () => {
    const player = new TrooperController();
    for (let i = 0; i < 12000; i++) {
      player.update(1 / 60, 5.006, { forward: 1, left: i > 6000 ? 1 : 0 });
      expect(player.normal.length()).toBeCloseTo(1, 10);
      expect(player.forward.length()).toBeCloseTo(1, 10);
      expect(player.normal.dot(player.forward)).toBeCloseTo(0, 10);
    }
  });
  it('normalizes diagonal weights, caps stalled frames, and stops cleanly', () => {
    const a = new TrooperController(),
      b = new TrooperController();
    a.update(5, 5.006, { forward: 1, left: 1 });
    b.update(0.05, 5.006, { forward: 1, left: 1 });
    expect(a.normal.distanceTo(b.normal)).toBeLessThan(1e-10);
    expect(Object.values(a.weights).reduce((x, y) => x + y, 0)).toBeCloseTo(
      1,
      10
    );
    a.stop();
    const previous = a.normal.clone();
    for (let i = 0; i < 60; i++)
      a.update(1 / 60, 5.006, { forward: 0, left: 0 });
    expect(a.normal.distanceTo(previous)).toBe(0);
    expect(a.weights.Idle).toBe(1);
  });
});

it('smoothly slows the forward run to a firing walk and accelerates on release', () => {
  const player = new TrooperController();
  const radius = 5.006;
  player.weights.Idle = 0;
  player.weights.Forward = 1;
  const speeds: number[] = [];
  for (let frame = 0; frame < 180; frame++) {
    const before = player.normal.clone();
    player.update(1 / 60, radius, {
      forward: 1,
      left: 0,
      firing: frame >= 30 && frame < 120,
    });
    speeds.push(before.angleTo(player.normal) * radius * 60);
  }
  expect(speeds[29]).toBeCloseTo(1.76 * TROOPER_SCALE, 6);
  expect(speeds[30]).toBeLessThan(speeds[29]);
  expect(speeds[30]).toBeGreaterThan(0.72 * TROOPER_SCALE);
  expect(speeds[119]).toBeCloseTo(0.72 * TROOPER_SCALE, 6);
  expect(speeds[179]).toBeCloseTo(1.76 * TROOPER_SCALE, 6);
});

it.each([
  ['Backward', -1, 0],
  ['Strafe_Left', 0, 1],
  ['Strafe_Right', 0, -1],
] as const)(
  'preserves the %s hustle speed while firing',
  (pose, forward, left) => {
    const player = new TrooperController();
    player.weights.Idle = 0;
    player.weights[pose] = 1;
    for (let frame = 0; frame < 60; frame++)
      player.update(1 / 60, 5.006, { forward, left, firing: true });
    expect(Math.acos(player.normal.z) * 5.006).toBeCloseTo(
      trooperGait(pose).speed * TROOPER_SCALE,
      6
    );
  }
);
