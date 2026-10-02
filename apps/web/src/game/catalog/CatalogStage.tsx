import {
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { colors } from '../../ui/tokens';
import {
  Bolts,
  Pickups,
  RiggedBatch,
  Shards,
} from '../components/3d/CoreSurvivorsParts';
import { SurvivorTrooper } from '../components/3d/SurvivorTrooper';
import { VoltTelegraphs } from '../components/3d/VoltTelegraphs';
import { SeekerCharacters } from '../components/3d/SeekerCharacters';
import { WardenCharacters } from '../components/3d/WardenCharacters';
import { createRun, playerRight } from '../survivors/sim';
import { copy, vec3 } from '../survivors/sphere';
import {
  toVector,
  type FrameContext,
  type Renderer,
} from '../survivors/renderFrame';
import { CORE_RADIUS } from '../utils/sectorGeometry';
import { SECTOR_COLORS } from '../utils/sectorVisuals';
import type { CatalogEntry, Layer } from './entries';
import { catalogGround } from './ground';

/** Where survivors stand on the Core, as in a run. */
const GROUND = CORE_RADIUS + 0.006;
const DEFAULT_FRAMING = { distance: 0.7, height: 0.08 };

const LAYERS: Record<Layer, (registry: Set<Renderer>) => ReactNode> = {
  trooper: (registry) => <SurvivorTrooper registry={registry} />,
  mite: (registry) => (
    <>
      <RiggedBatch model="mite" registry={registry} />
      <VoltTelegraphs registry={registry} />
    </>
  ),
  lancer: (registry) => <RiggedBatch model="lancer" registry={registry} />,
  bulwark: (registry) => <RiggedBatch model="bulwark" registry={registry} />,
  seeker: (registry) => <SeekerCharacters registry={registry} />,
  warden: (registry) => <WardenCharacters registry={registry} />,
  pickups: (registry) => <Pickups registry={registry} />,
  bolts: (registry) => <Bolts registry={registry} />,
  shards: (registry) => <Shards registry={registry} />,
};

/**
 * One catalog object on a patch of the Core, lit like a run and drawn by the
 * game's own renderers from a mock run that holds only that object.
 */
export function CatalogStage({ entry }: { entry: CatalogEntry }) {
  const { size } = useThree();
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const light = useRef<THREE.DirectionalLight>(null);
  const registry = useMemo(() => new Set<Renderer>(), []);
  const run = useMemo(() => {
    const run = createRun(7, GROUND);
    entry.setup(run);
    return run;
  }, [entry]);
  const frame = useMemo(
    () => ({ normal: vec3(), forward: vec3(), right: vec3() }),
    []
  );

  // Look down at the object from behind, as the follow camera does.
  useLayoutEffect(() => {
    const view = camera.current;
    if (!view) return;
    const { distance, height } = entry.framing ?? DEFAULT_FRAMING;
    const up = toVector(new THREE.Vector3(), run.player.n);
    const ahead = toVector(new THREE.Vector3(), run.player.forward);
    const target = up.clone().multiplyScalar(GROUND + height);
    view.position
      .copy(target)
      .addScaledVector(up, distance * 0.7)
      .addScaledVector(ahead, -distance * 0.7);
    view.up.copy(up);
    view.lookAt(target);
    light.current?.position.copy(view.position);
    light.current?.target.position.copy(target);
    light.current?.target.updateMatrixWorld();
  }, [run, entry]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    run.time += dt;
    for (const item of run.items) item.age += dt;
    for (const enemy of run.enemies) enemy.age += dt;
    entry.animate?.(run, dt);
    if (!camera.current) return;
    copy(frame.normal, run.player.n);
    copy(frame.forward, run.player.forward);
    playerRight(frame.right, run.player);
    const context: FrameContext = {
      run,
      alpha: 1,
      radius: GROUND,
      camera: camera.current,
      size,
      ...frame,
    };
    for (const render of registry) render(context);
  });

  return (
    <>
      <PerspectiveCamera ref={camera} makeDefault fov={40} near={0.01} />
      <hemisphereLight args={[colors.fg.DEFAULT, colors.fg.muted, 2.4]} />
      <ambientLight intensity={0.9} />
      <directionalLight ref={light} intensity={2.2} color={colors.fg.DEFAULT} />
      <mesh geometry={catalogGround()}>
        <meshBasicMaterial color={SECTOR_COLORS.neutral} />
      </mesh>
      <mesh geometry={catalogGround()} scale={1.002}>
        <meshBasicMaterial
          color={SECTOR_COLORS.neutralGrid}
          wireframe
          transparent
          opacity={0.42}
        />
      </mesh>
      {entry.layers.map((layer) => (
        <Suspense key={layer} fallback={null}>
          {LAYERS[layer](registry)}
        </Suspense>
      ))}
    </>
  );
}
