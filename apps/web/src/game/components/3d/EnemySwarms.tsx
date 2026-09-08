import { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSectors } from '../../contexts/SectorContext';
import { sectorStakeHeights } from '../../utils/sectorStakeRelief';
import {
  enemyGroundRadius,
  EnemySwarmSimulation,
} from '../../utils/enemySwarm';
import { bakeEnemyRun } from '../../utils/enemyRunAtlas';
import {
  ENEMY_PREVIEW_TYPES,
  type EnemyPreviewType,
  type EnemySwarmCounts,
} from '../../utils/enemyPreviewConfig';

function EnemyBatch({
  type,
  count,
  seed,
  paused,
  active,
  groundRadius,
}: {
  type: EnemyPreviewType;
  count: number;
  seed: number;
  paused: boolean;
  active: boolean;
  groundRadius: number;
}) {
  const config = ENEMY_PREVIEW_TYPES[type];
  const { scene, animations } = useGLTF(config.modelUrl);
  const group = useRef<THREE.Group>(null);
  const runtime = useRef<{
    simulation: EnemySwarmSimulation;
    batches: THREE.InstancedMesh[];
    time: THREE.IUniform<number>;
  } | null>(null);
  const scratch = useMemo(
    () => ({
      position: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      right: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      matrix: new THREE.Matrix4(),
      scale: new THREE.Vector3().setScalar(config.scale),
    }),
    [config]
  );

  useLayoutEffect(() => {
    const container = group.current;
    if (!container) return;
    const simulation = new EnemySwarmSimulation(
      count,
      config.seed + seed,
      config.runSpeed * config.scale
    );
    const time = { value: 0 };
    const parts = bakeEnemyRun(scene, animations, time);
    const gait = new Float32Array(count * 2);
    simulation.walkers.forEach((walker, index) => {
      gait[index * 2] = walker.phase;
      gait[index * 2 + 1] = walker.pace;
    });
    const batches = parts.map((part, index) => {
      part.geometry.setAttribute(
        'enemyGait',
        new THREE.InstancedBufferAttribute(gait.slice(), 2)
      );
      const batch = new THREE.InstancedMesh(
        part.geometry,
        part.material,
        count
      );
      batch.name = `${config.label} ${index === 0 ? 'armor' : 'sensors'}`;
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // GPU poses and instances span the globe; preserve planet raycasting.
      batch.frustumCulled = false;
      batch.raycast = () => undefined;
      container.add(batch);
      return batch;
    });
    runtime.current = { simulation, batches, time };
    return () => {
      runtime.current = null;
      batches.forEach((batch) => {
        container.remove(batch);
        batch.dispose();
      });
      parts.forEach((part) => {
        part.geometry.dispose();
        part.material.dispose();
        part.texture.dispose();
      });
    };
  }, [scene, animations, config, count, seed]);

  useFrame((_, delta) => {
    const live = runtime.current;
    if (!live || !active) return;
    if (!paused) live.simulation.update(delta, groundRadius);
    live.time.value = live.simulation.time;
    live.simulation.walkers.forEach((walker, index) => {
      scratch.forward
        .copy(walker.forward)
        .projectOnPlane(walker.normal)
        .normalize();
      scratch.right.crossVectors(walker.normal, scratch.forward).normalize();
      scratch.matrix.makeBasis(scratch.right, walker.normal, scratch.forward);
      scratch.rotation.setFromRotationMatrix(scratch.matrix);
      scratch.position.copy(walker.normal).multiplyScalar(groundRadius);
      scratch.matrix.compose(scratch.position, scratch.rotation, scratch.scale);
      for (const batch of live.batches)
        batch.setMatrixAt(index, scratch.matrix);
    });
    for (const batch of live.batches) batch.instanceMatrix.needsUpdate = true;
  });

  return <group ref={group} dispose={null} />;
}

export default function EnemySwarms({
  active,
  counts,
}: {
  active: boolean;
  counts: EnemySwarmCounts;
}) {
  const { camera } = useThree();
  const { controlView, occupiedSectorIds, sectorCaptureForce } = useSectors();
  const [paused, setPaused] = useState(false);
  const [seed, setSeed] = useState(0);
  const fpsLabel = useRef<HTMLOutputElement>(null);
  const stats = useRef({ elapsed: 0, frames: 0 });
  const groundRadius = useMemo(
    () =>
      enemyGroundRadius(
        sectorStakeHeights(
          controlView === 'staked',
          occupiedSectorIds,
          sectorCaptureForce
        )
      ),
    [controlView, occupiedSectorIds, sectorCaptureForce]
  );
  const types = (Object.keys(ENEMY_PREVIEW_TYPES) as EnemyPreviewType[]).filter(
    (type) => counts[type] > 0
  );
  const label = types
    .map((type) => `${counts[type]} ${ENEMY_PREVIEW_TYPES[type].label}`)
    .join(' + ');

  useLayoutEffect(() => {
    camera.position.set(0, 0, 9);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
  }, [camera]);

  useFrame(({ gl }, delta) => {
    if (!active) return;
    stats.current.frames++;
    stats.current.elapsed += delta;
    if (stats.current.elapsed >= 0.5 && fpsLabel.current) {
      fpsLabel.current.textContent = `${Math.round(stats.current.frames / stats.current.elapsed)} FPS`;
      fpsLabel.current.title = `Scene: ${gl.info.render.calls} draws, ${gl.info.render.triangles.toLocaleString()} triangles`;
      stats.current = { frames: 0, elapsed: 0 };
    }
  });

  return (
    <group visible={active}>
      <hemisphereLight args={['#eef2ff', '#9da4b3', 3.5]} />
      <ambientLight intensity={1.2} />
      {types.map((type) => (
        <Suspense key={type} fallback={null}>
          <EnemyBatch
            type={type}
            count={counts[type]}
            seed={seed}
            paused={paused}
            active={active}
            groundRadius={groundRadius}
          />
        </Suspense>
      ))}
      {active && (
        <Html
          fullscreen
          calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
          style={{ pointerEvents: 'none' }}
          zIndexRange={[20, 10]}
        >
          <div className="pointer-events-auto absolute right-4 top-20 border border-neutral-700 bg-black/85 px-3 py-2 font-mono text-[10px] text-neutral-300">
            <div className="mb-2 flex items-center gap-4 tracking-widest">
              <span>
                {label} / {paused ? 'PAUSED' : 'RUNNING'}
              </span>
              <output
                ref={fpsLabel}
                className="text-neutral-500"
                aria-label="Preview frame rate"
              >
                — FPS
              </output>
            </div>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setPaused((value) => !value)}
                className="hover:text-white focus-visible:outline focus-visible:outline-white"
              >
                {paused ? 'Resume swarm' : 'Pause swarm'}
              </button>
              <button
                type="button"
                onClick={() => setSeed((value) => value + 1)}
                className="hover:text-white focus-visible:outline focus-visible:outline-white"
              >
                Reshuffle swarm
              </button>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
