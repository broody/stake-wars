import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  ENEMY_GROUND_CLEARANCE,
  ENEMY_GROUND_RADIUS,
  enemyGroundRadius,
  EnemySwarmSimulation,
} from './enemySwarm';
import { bakeEnemyRun } from './enemyRunAtlas';
import { CORE_RADIUS, createSectorGeometry } from './sectorGeometry';
import { ENEMY_PREVIEW_TYPES } from './enemyPreviewConfig';

describe('enemy swarms', () => {
  it('spawns 200 distributed walkers with repeatable, varied gaits', () => {
    const swarm = new EnemySwarmSimulation(200, 4187, 0.3528);
    const repeat = new EnemySwarmSimulation(200, 4187, 0.3528);
    expect(swarm.walkers).toHaveLength(200);
    expect(swarm.walkers.map((walker) => walker.phase)).toEqual(
      repeat.walkers.map((walker) => walker.phase)
    );
    expect(new Set(swarm.walkers.map((walker) => walker.pace)).size).toBe(200);
    const sum = new THREE.Vector3();
    swarm.walkers.forEach((walker) => sum.add(walker.normal));
    expect(sum.length()).toBeLessThan(0.2);
    for (let i = 0; i < swarm.walkers.length; i++) {
      for (let j = i + 1; j < swarm.walkers.length; j++) {
        expect(
          swarm.walkers[i].normal.distanceTo(swarm.walkers[j].normal)
        ).toBeGreaterThan(0.2);
      }
    }
  });

  it('moves every Mite without leaving the sphere or losing tangent headings', () => {
    const swarm = new EnemySwarmSimulation(200, 4187, 0.3528);
    const previous = swarm.walkers.map((walker) => walker.normal.clone());
    const distances = new Float64Array(200);
    for (let frame = 0; frame < 1200; frame++) {
      swarm.update(1 / 60);
      for (const [index, walker] of swarm.walkers.entries()) {
        // Measure the surface arc, since a chord undercounts faster strides.
        distances[index] +=
          2 *
          Math.asin(walker.normal.distanceTo(previous[index]) / 2) *
          ENEMY_GROUND_RADIUS;
        previous[index].copy(walker.normal);
        expect(walker.normal.length()).toBeCloseTo(1, 10);
      }
    }
    swarm.walkers.forEach((walker, index) => {
      expect(walker.normal.length()).toBeCloseTo(1, 10);
      expect(walker.forward.length()).toBeCloseTo(1, 10);
      expect(walker.normal.dot(walker.forward)).toBeCloseTo(0, 10);
      // A random route can return to its start; verify distance traveled.
      expect(distances[index]).toBeCloseTo(0.3528 * walker.pace * 20, 6);
    });
  });

  it('shares the movement/animation clock and caps background-tab time jumps', () => {
    const swarm = new EnemySwarmSimulation(200, 4187, 0.3528);
    const start = swarm.walkers[0].normal.clone();
    swarm.update(0);
    expect(swarm.time).toBe(0);
    expect(swarm.walkers[0].normal.equals(start)).toBe(true);
    swarm.update(60);
    expect(swarm.time).toBe(0.05);
    expect(swarm.walkers[0].normal.distanceTo(start)).toBeLessThan(0.005);
  });

  it('keeps the invisible ground just outside the Core and its raised sectors', () => {
    const heights = new Map([
      [37, 0.6],
      [100, 0.2],
    ]);
    const flat = enemyGroundRadius(new Map());
    const raised = enemyGroundRadius(heights);
    expect(flat - CORE_RADIUS).toBeCloseTo(ENEMY_GROUND_CLEARANCE, 10);
    expect(raised - flat).toBeCloseTo(0.6, 10);
    const geometry = createSectorGeometry(1);
    const positions = geometry.getAttribute('position');
    const vertex = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      const radius = CORE_RADIUS + (heights.get(Math.floor(i / 3)) ?? 0);
      vertex.fromBufferAttribute(positions, i).multiplyScalar(radius);
      expect(raised - vertex.length()).toBeGreaterThan(
        ENEMY_GROUND_CLEARANCE - 1e-6
      );
    }
    geometry.dispose();
  });

  it('keeps actor tilt and ground height continuous throughout a run', () => {
    const config = ENEMY_PREVIEW_TYPES.lancers;
    const swarm = new EnemySwarmSimulation(
      100,
      config.seed,
      config.runSpeed * config.scale
    );
    const previous = swarm.walkers.map((walker) => walker.normal.clone());
    const position = new THREE.Vector3();
    let largestTiltStep = 0;
    for (let frame = 0; frame < 600; frame++) {
      swarm.update(1 / 60);
      swarm.walkers.forEach((walker, index) => {
        largestTiltStep = Math.max(
          largestTiltStep,
          previous[index].angleTo(walker.normal)
        );
        previous[index].copy(walker.normal);
        position.copy(walker.normal).multiplyScalar(ENEMY_GROUND_RADIUS);
        expect(position.length()).toBeCloseTo(ENEMY_GROUND_RADIUS, 10);
      });
    }
    // A tall actor must not rock several degrees in one frame at a facet edge.
    expect(THREE.MathUtils.radToDeg(largestTiltStep)).toBeLessThan(0.3);
  });

  it.each([
    {
      type: 'mites' as const,
      file: 'mite',
      triangles: 394,
      duration: 0.5,
      maxHeight: 0.7,
    },
    {
      type: 'lancers' as const,
      file: 'lancer',
      triangles: 722,
      duration: 2 / 3,
      maxHeight: 2,
    },
  ])(
    'bakes $file Run into finite, moving, grounded GPU atlases',
    async ({ file, triangles, duration, maxHeight }) => {
      const bytes = readFileSync(
        new URL(
          `../../../public/models/hollow-legion/${file}.glb`,
          import.meta.url
        )
      );
      const asset = await new GLTFLoader().parseAsync(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ),
        ''
      );
      const sourcePositions: number[][] = [];
      asset.scene.traverse((object) => {
        if (object instanceof THREE.Mesh)
          sourcePositions.push(
            Array.from(object.geometry.getAttribute('position').array)
          );
      });
      expect(
        asset.animations.find((clip) => clip.name === 'Run')?.duration
      ).toBeCloseTo(duration, 6);
      const parts = bakeEnemyRun(
        asset.scene,
        asset.animations.filter((clip) => clip.name === 'Run'),
        { value: 0 }
      );
      expect(parts).toHaveLength(2);
      expect(
        parts.reduce(
          (triangles, part) => triangles + part.geometry.index!.count / 3,
          0
        )
      ).toBe(triangles);
      expect(parts.some((part) => part.material.emissive.r > 0)).toBe(true);
      let maximumMotion = 0;
      for (const part of parts) {
        const pixels = part.texture.image.data as Float32Array;
        const vertices = part.geometry.getAttribute('position').count;
        expect(Array.from(pixels).every(Number.isFinite)).toBe(true);
        expect(part.geometry.getAttribute('skinIndex')).toBeUndefined();
        for (let frame = 0; frame < 24; frame++) {
          for (let vertex = 0; vertex < vertices; vertex++) {
            const offset = (frame * vertices + vertex) * 4;
            expect(pixels[offset + 1]).toBeGreaterThan(0);
            expect(pixels[offset + 1]).toBeLessThan(maxHeight);
            maximumMotion = Math.max(
              maximumMotion,
              Math.abs(pixels[offset + 1] - pixels[vertex * 4 + 1])
            );
          }
        }
        part.geometry.dispose();
        part.material.dispose();
        part.texture.dispose();
      }
      expect(maximumMotion).toBeGreaterThan(0.07);
      const after: number[][] = [];
      asset.scene.traverse((object) => {
        if (object instanceof THREE.Mesh)
          after.push(
            Array.from(object.geometry.getAttribute('position').array)
          );
      });
      expect(after).toEqual(sourcePositions);
    }
  );

  it.each([0, 1, 7, 150])(
    'supports %i Lancers at their authored run speed',
    (count) => {
      const config = ENEMY_PREVIEW_TYPES.lancers;
      const swarm = new EnemySwarmSimulation(
        count,
        config.seed,
        config.runSpeed * config.scale
      );
      expect(swarm.walkers).toHaveLength(count);
      const before = swarm.walkers.map((walker) => walker.normal.clone());
      // A larger shell still needs to match the authored stride's world speed.
      const groundRadius = enemyGroundRadius(new Map([[37, 0.6]]));
      swarm.update(0.025, groundRadius);
      swarm.walkers.forEach((walker, index) => {
        const distance =
          2 *
          Math.asin(walker.normal.distanceTo(before[index]) / 2) *
          groundRadius;
        expect(distance).toBeCloseTo(0.945 * walker.pace * 0.025, 8);
        expect(walker.forward.dot(walker.normal)).toBeCloseTo(0, 10);
      });
    }
  );
});
