// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import {
  GLTFLoader,
  type GLTF,
} from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { TrooperAim, TrooperAimPose, TROOPER_MUZZLE_NAME } from './trooperAim';
import { TROOPER_CLIPS, TrooperAnimation } from './trooperAnimation';
import {
  TROOPER_GAITS,
  trooperGait,
  TrooperController,
  type TrooperPose,
} from './trooperController';

let gltf: GLTF;
beforeAll(async () => {
  const bytes = readFileSync('public/models/sector-trooper/sector-trooper.glb');
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  gltf = await new GLTFLoader().parseAsync(data, '');
});

function setup() {
  const model = clone(gltf.scene);
  return {
    model,
    animator: new TrooperAnimation(model, gltf.animations),
    controller: new TrooperController(),
  };
}

describe('shipped armed trooper', () => {
  it('contains the rifle, attachment socket and all ten complete clips', () => {
    expect(gltf.animations.map((c) => c.name).sort()).toEqual(
      Object.values(TROOPER_CLIPS)
        .flatMap((pair) => Object.values(pair))
        .sort()
    );
    const model = clone(gltf.scene);
    expect(model.getObjectByName('SectorTrooper_Rifle')).toBeDefined();
    expect(model.getObjectByName('weapon')).toBeInstanceOf(THREE.Bone);
    for (const clip of gltf.animations) {
      for (const track of clip.tracks) {
        const parsed = THREE.PropertyBinding.parseTrackName(track.name);
        expect(
          model.getObjectByName(parsed.nodeName),
          track.name
        ).toBeDefined();
        expect(Array.from(track.values).every(Number.isFinite)).toBe(true);
      }
    }
    for (const [pose, gait] of Object.entries(TROOPER_GAITS)) {
      const pair = TROOPER_CLIPS[pose as keyof typeof TROOPER_GAITS];
      const carry = gltf.animations.find((c) => c.name === pair.carry)!;
      const fire = gltf.animations.find((c) => c.name === pair.fire)!;
      expect(carry.duration).toBeCloseTo(gait.duration, 5);
      const fireDuration = trooperGait(
        pose as keyof typeof TROOPER_GAITS,
        true
      ).duration;
      expect(fire.duration / fireDuration).toBeCloseTo(
        Math.round(fire.duration / fireDuration),
        5
      );
    }
  });

  it('breathes at idle, blends into fire, and returns to carry on release', () => {
    const { model, animator, controller } = setup();
    const step = (firing: boolean) => {
      controller.update(1 / 60, 5.006, { forward: 0, left: 0, firing });
      animator.update(1 / 60, controller);
    };
    const rifle = model.getObjectByName('SectorTrooper_Rifle')!;
    model.updateMatrixWorld(true);
    const before = rifle.matrixWorld.clone();
    for (let i = 0; i < 15; i++) step(false);
    model.updateMatrixWorld(true);
    expect(rifle.matrixWorld.equals(before)).toBe(false);
    expect(animator.actions.Idle.carry.getEffectiveWeight()).toBe(1);
    step(true);
    expect(controller.fireWeight).toBeGreaterThan(0);
    expect(controller.fireWeight).toBeLessThan(1);
    for (let i = 0; i < 45; i++) step(true);
    expect(animator.actions.Idle.fire.getEffectiveWeight()).toBeGreaterThan(
      0.999
    );
    for (let i = 0; i < 45; i++) step(false);
    expect(animator.actions.Idle.carry.getEffectiveWeight()).toBeGreaterThan(
      0.999
    );
    controller.stop();
    animator.update(1 / 60, controller, false);
    expect(controller.fireWeight).toBe(0);
    animator.dispose(model);
  });

  it.each([
    ['Forward', 1, 0],
    ['Strafe_Left', 0, 1],
    ['Strafe_Right', 0, -1],
    ['Backward', -1, 0],
    ['diagonal', 1, 1],
  ] as const)(
    'keeps %s movement phase aligned while switching fire on and off',
    (name, forward, left) => {
      const { model, animator, controller } = setup();
      const warning = vi.spyOn(console, 'warn');
      for (let frame = 0; frame < 240; frame++) {
        controller.update(1 / 60, 5.006, {
          forward,
          left,
          firing: frame >= 60 && frame < 180,
        });
        animator.update(1 / 60, controller);
        model.updateMatrixWorld(true);
        let sum = 0;
        for (const [pose, pair] of Object.entries(animator.actions)) {
          sum +=
            pair.carry.getEffectiveWeight() + pair.fire.getEffectiveWeight();
          if (pose !== 'Idle') {
            const gait = trooperGait(pose as keyof typeof TROOPER_GAITS);
            const fireGait = trooperGait(
              pose as keyof typeof TROOPER_GAITS,
              true
            );
            // Compare normalized contact phases, including the run's authored offset.
            const difference =
              pair.fire.time / fireGait.duration +
              fireGait.phaseOffset -
              pair.carry.time / gait.duration -
              gait.phaseOffset;
            expect(Math.abs(difference - Math.round(difference))).toBeLessThan(
              1e-5
            );
          }
        }
        expect(sum).toBeCloseTo(1, 10);
        model.traverse((o) => {
          if (o instanceof THREE.Bone)
            expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true);
        });
      }
      if (name !== 'diagonal')
        expect(controller.weights[name as TrooperPose]).toBeGreaterThan(0.999);
      expect(warning).not.toHaveBeenCalled();
      warning.mockRestore();
      animator.dispose(model);
    }
  );
});

it('exports the muzzle at the barrel with local +Z pointing forward in the firing pose', () => {
  const { model, animator, controller } = setup();
  const muzzle = model.getObjectByName(TROOPER_MUZZLE_NAME)!;
  expect(muzzle).toBeDefined();
  controller.firing = true;
  controller.fireWeight = 1;
  for (let i = 0; i < 60; i++) {
    animator.update(1 / 60, controller);
    muzzle.updateWorldMatrix(true, false);
    const direction = new THREE.Vector3(0, 0, 1).transformDirection(
      muzzle.matrixWorld
    );
    expect(Math.abs(direction.x)).toBeLessThan(0.03);
    expect(direction.z).toBeGreaterThan(0.99);
  }
  animator.dispose(model);
});

it('preserves both grips while aiming down and does not accumulate pose corrections', () => {
  const { model, animator, controller } = setup();
  model.scale.setScalar(0.35);
  model.position.y = 5.006 + (486 / 384) * 0.35;
  const muzzle = model.getObjectByName(TROOPER_MUZZLE_NAME)!;
  const hands = ['hand.L', 'hand.R'].map(
    (name) =>
      model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name))!
  );
  const aim = new TrooperAim(),
    pose = new TrooperAimPose(model);
  const normal = new THREE.Vector3(0, 1, 0),
    forward = new THREE.Vector3(0, 0, 1);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 100);
  camera.position.set(0, 6.756, -2.6);
  camera.lookAt(0, 5.326, 0.3);
  camera.updateMatrixWorld(true);
  controller.firing = true;
  controller.fireWeight = 1;
  const errors: number[] = [];
  for (let i = 0; i < 60; i++) {
    pose.reset();
    animator.update(1 / 60, controller);
    model.updateMatrixWorld(true);
    const contacts = hands.map((hand) =>
      hand.matrixWorld.clone().invert().multiply(muzzle.matrixWorld)
    );
    aim.update(normal, forward, 5.006, camera, true);
    pose.apply(forward, aim.point, 1);
    muzzle.updateWorldMatrix(true, false);
    hands.forEach((hand, index) => {
      hand.updateWorldMatrix(true, false);
      const contact = hand.matrixWorld
        .clone()
        .invert()
        .multiply(muzzle.matrixWorld);
      expect(
        Math.max(
          ...contact.elements.map((value, j) =>
            Math.abs(value - contacts[index].elements[j])
          )
        )
      ).toBeLessThan(1e-5);
    });
    const direction = new THREE.Vector3(0, 0, 1).transformDirection(
      muzzle.matrixWorld
    );
    expect(direction.y).toBeLessThan(-0.1);
    errors.push(direction.y);
  }
  // Repeated idle shots stay in the same aim envelope rather than rotating each frame.
  expect(Math.max(...errors) - Math.min(...errors)).toBeLessThan(0.15);
  pose.reset();
  animator.dispose(model);
});
