// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mesh, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { MeteorShell, METEOR_RADIUS } from './meteorShell';
import { surfaceRotation } from './renderFrame';
import { FOLLOW_CAMERA, followPullback } from './followCamera';
import {
  captureGlobeView,
  dropDistance,
  OPENING_CAMERA,
  sampleOpeningCamera,
} from './openingCamera';
import { SurvivorsSession } from './session';
import { rankedRun } from './rankedReplay';

describe('Survivors opening camera', () => {
  it.each([
    [16 / 9, 15],
    [375 / 812, 15],
    [16 / 9, 30],
    [375 / 812, 8],
  ])(
    'keeps the drop framed and hands off without a cut at aspect %s and zoom %s',
    (aspect, zoom) => {
      const camera = new PerspectiveCamera(75, aspect, 0.1, 100);
      const pullback = followPullback(camera.fov, aspect);
      const normal = new Vector3(0.3, -0.7, 0.4).normalize();
      camera.position.copy(normal).multiplyScalar(zoom);
      camera.lookAt(0, 0, 0);
      camera.rotateZ(1.4);
      const globeRotation = camera.quaternion.clone();
      const orbit = captureGlobeView(camera);
      const front = orbit.forward;
      const swordSide = new Vector3().crossVectors(front, normal);
      const radius = 5,
        origin = normal.clone().multiplyScalar(radius);
      const eye = new Vector3(),
        look = new Vector3(),
        up = new Vector3();
      const sample = (time: number) => {
        sampleOpeningCamera(time, orbit, radius, pullback, eye, look, up);
        camera.position.copy(eye);
        camera.up.copy(up);
        camera.lookAt(look);
        camera.updateMatrixWorld();
      };
      sample(0);
      expect(eye.distanceTo(orbit.eye)).toBeLessThan(1e-8);
      expect(camera.quaternion.angleTo(globeRotation)).toBeLessThan(1e-7);
      const torso = origin
        .clone()
        .addScaledVector(normal, FOLLOW_CAMERA.targetHeight);
      const followDistance =
        Math.hypot(
          FOLLOW_CAMERA.back,
          FOLLOW_CAMERA.height - FOLLOW_CAMERA.targetHeight
        ) * pullback;
      sample(OPENING_CAMERA.impact);
      expect(eye.clone().sub(torso).dot(front)).toBeGreaterThan(0);
      expect(eye.clone().sub(torso).dot(swordSide)).toBeGreaterThan(0);
      let lastBearing = -Infinity;
      sample(0);
      const rotation = camera.quaternion.clone();
      for (let i = 1; i <= Math.ceil(OPENING_CAMERA.duration * 60); i++) {
        const age = i / 60;
        sample(age);
        if (age >= OPENING_CAMERA.release && age <= OPENING_CAMERA.impact) {
          const shellCenter = origin
            .clone()
            .addScaledVector(normal, METEOR_RADIUS)
            .addScaledVector(orbit.trail, dropDistance(age, orbit, radius))
            .project(camera);
          expect(Math.abs(shellCenter.x)).toBeLessThan(0.97);
          expect(Math.abs(shellCenter.y)).toBeLessThan(0.97);
          expect(shellCenter.z).toBeLessThan(1);
        }
        if (age >= OPENING_CAMERA.impact) {
          const offset = eye.clone().sub(torso);
          expect(offset.length()).toBeCloseTo(followDistance, 8);
          const bearing = offset.projectOnPlane(normal).angleTo(front);
          expect(bearing).toBeGreaterThanOrEqual(lastBearing - 1e-8);
          lastBearing = bearing;
          const feet = origin.clone().project(camera);
          const head = origin
            .clone()
            .addScaledVector(normal, 0.49)
            .project(camera);
          expect(head.y - feet.y).toBeLessThan(0.24);
        }
        expect(eye.length()).toBeGreaterThan(radius);
        expect(camera.quaternion.angleTo(rotation)).toBeLessThan(0.09);
        rotation.copy(camera.quaternion);
      }
      const followEye = origin
        .clone()
        .addScaledVector(
          normal,
          FOLLOW_CAMERA.targetHeight +
            (FOLLOW_CAMERA.height - FOLLOW_CAMERA.targetHeight) * pullback
        )
        .addScaledVector(front, -FOLLOW_CAMERA.back * pullback);
      expect(eye.distanceTo(followEye)).toBeLessThan(1e-8);
      expect(
        look.distanceTo(
          origin.addScaledVector(normal, FOLLOW_CAMERA.targetHeight)
        )
      ).toBeLessThan(1e-8);
      expect(up.distanceTo(front)).toBeLessThan(1e-8);

      // At the reveal, both broken halves should fit even on a portrait screen.
      const shell = new MeteorShell();
      shell.root.position.copy(normal).multiplyScalar(radius + METEOR_RADIUS);
      surfaceRotation(shell.root.quaternion, normal, orbit.forward);
      for (const age of [OPENING_CAMERA.split, OPENING_CAMERA.split + 0.62]) {
        sample(age);
        shell.pose(age);
        shell.root.updateMatrixWorld(true);
        shell.root.traverse((part) => {
          if (!(part instanceof Mesh)) return;
          const positions = part.geometry.getAttribute('position');
          const vertex = new Vector3();
          for (let i = 0; i < positions.count; i++) {
            vertex
              .fromBufferAttribute(positions, i)
              .applyMatrix4(part.matrixWorld)
              .project(camera);
            expect(Math.abs(vertex.x)).toBeLessThan(1);
            expect(Math.abs(vertex.y)).toBeLessThan(1);
          }
        });
      }
      shell.dispose();
    }
  );
});

it('keeps the shell sealed through impact, opens a sightline to the hero, and resets on replay', () => {
  const shell = new MeteorShell();
  const ray = new Raycaster(new Vector3(0, 0, 2), new Vector3(0, 0, -1));
  const blocksHero = (age: number) => {
    shell.pose(age);
    shell.root.updateMatrixWorld(true);
    return ray
      .intersectObject(shell.root)
      .some((hit) => hit.object instanceof Mesh);
  };
  expect(blocksHero(OPENING_CAMERA.release + 0.3)).toBe(true);
  expect(blocksHero(OPENING_CAMERA.split - 0.01)).toBe(true);
  expect(blocksHero(OPENING_CAMERA.split + 0.72)).toBe(false);
  shell.pose(OPENING_CAMERA.duration);
  expect(shell.root.visible).toBe(false);
  expect(blocksHero(OPENING_CAMERA.release + 0.3)).toBe(true);
  expect(shell.root.visible).toBe(true);
  shell.dispose();
});

describe('Survivors opening playback', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('plays the drop at the recorded spawn before the first replay tick', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 15);
    camera.lookAt(0, 0, 0);
    const session = new SurvivorsSession();
    session.ticket = { token: 'ticket', seed: 343 };
    session.start(5, 1, captureGlobeView(camera));

    const expected = rankedRun(343).player;
    const orbit = session.globeView!;
    expect(orbit.normal.distanceTo(expected.n)).toBeLessThan(1e-8);
    expect(orbit.forward.distanceTo(expected.forward)).toBeLessThan(1e-8);
    expect(orbit.eye.length()).toBeCloseTo(15);
    expect(session.opening).toBe(true);
    expect(session.surfaceActive()).toBe(false);
    for (let t = 0; t < OPENING_CAMERA.duration; t += 0.25)
      session.advance(0.25);
    expect(session.opening).toBe(false);
    expect(session.run!.cues.map((cue) => cue.id)).toEqual(['strike']);
    expect(session.run!.player.n).toEqual(expected.n);
    expect(session.replay!.ticks).toBe(0);
    session.advance(1 / 30);
    expect(session.replay!.ticks).toBe(1);
  });

  it('holds the simulation, respects pause, and starts a fresh opening on restart', () => {
    const session = new SurvivorsSession();
    session.start(5, 42);
    const initial = session.run!;
    let fired = false;
    initial.timers.push({
      at: 0.01,
      run: () => {
        fired = true;
      },
    });
    session.advance(0.25);
    session.setPaused(true);
    session.advance(0.25);
    expect(session.openingAge).toBe(0.25);
    session.setPaused(false);
    for (
      let i = 0;
      i < Math.ceil(OPENING_CAMERA.duration * 10) && session.opening;
      i++
    )
      session.advance(0.1);
    expect(session.opening).toBe(false);
    expect(initial.time).toBe(0);
    expect(fired).toBe(false);
    session.advance(1 / 30);
    expect(fired).toBe(true);
    session.start(5, 43);
    expect(session.opening).toBe(true);
    expect(session.openingAge).toBe(0);
  });

  it('lands at the viewed point, fires one impact, and reuses the orbit on retry', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(-12, 5, 4);
    camera.lookAt(0, 0, 0);
    const orbit = captureGlobeView(camera);
    const session = new SurvivorsSession();
    session.start(5, 1, orbit);
    const run = session.run!;
    expect(run.player.n).toEqual({ ...orbit.normal });
    expect(run.player.heading).toEqual({ ...orbit.forward });
    expect(session.surfaceActive()).toBe(false);
    expect(dropDistance(0.75, orbit, 5)).toBeGreaterThan(
      dropDistance(1.5, orbit, 5)
    );
    expect(dropDistance(OPENING_CAMERA.impact, orbit, 5)).toBe(0);
    for (let i = 0; i < 24; i++) session.advance(0.1);
    expect(session.surfaceActive()).toBe(true);
    expect(run.cues.map((cue) => cue.id)).toEqual(['strike']);
    expect(run.time).toBe(0);
    session.start(5, 2);
    expect(session.run!.player.n).toEqual(run.player.n);
    expect(session.surfaceActive()).toBe(false);
    session.skipOpening();
    expect(session.surfaceActive()).toBe(true);
    expect(session.run!.cues).toHaveLength(0);
  });

  it.each(['keyboard', 'stick', 'button'])('can skip with %s', (input) => {
    const session = new SurvivorsSession();
    session.start(5, 42);
    const start = { ...session.run!.player.n };
    session.advance(0.1);
    if (input === 'keyboard') session.keys.add('KeyW');
    if (input === 'stick') session.stick.x = 0.7;
    if (input === 'button') session.skipOpening();
    session.advance(1 / 30);
    expect(session.opening).toBe(false);
    expect(session.openingAge).toBe(0.1);
    session.advance(1 / 30);
    expect(session.run!.time).toBeGreaterThan(0);
    if (input !== 'button') expect(session.run!.player.n).not.toEqual(start);
  });

  it('steers screen-forward after orbiting without turning a stationary hero', () => {
    const session = new SurvivorsSession();
    session.start(5, 42);
    session.skipOpening();
    const run = session.run!;
    const original = { ...run.player.heading };
    const right = new Vector3().copy(run.right);
    session.cameraOrbit.turnTo(Math.PI / 2, 1);
    session.advance(1 / 30);
    expect(run.player.heading).toEqual(original);
    session.keys.add('KeyW');
    session.advance(1 / 30);
    expect(right.dot(run.player.heading)).toBeLessThan(-0.99);
    session.start(5, 43);
    expect(session.cameraOrbit.yaw).toBe(0);
  });

  it('starts in the follow view for reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
    }));
    const session = new SurvivorsSession();
    session.ticket = { token: 'ticket', seed: 42 };
    session.start(5, 42);
    expect(session.opening).toBe(false);
    session.advance(1 / 30);
    expect(session.run!.time).toBeCloseTo(1 / 30);
  });
});
