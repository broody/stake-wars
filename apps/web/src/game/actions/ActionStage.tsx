import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { colors } from '../../ui/tokens';
import { catalogGround } from '../catalog/ground';
import { Bolts, RiggedBatch } from '../components/3d/CoreSurvivorsParts';
import { SaberSlashes } from '../components/3d/SaberSlashes';
import { StakePulseField } from '../components/3d/StakePulseField';
import { OrbitShards } from '../components/3d/OrbitShards';
import { OrbitalStrikes } from '../components/3d/OrbitalStrikes';
import { SectorRipples } from '../components/3d/SectorRipples';
import { SectorChargeEffects } from '../components/3d/SectorChargeEffects';
import { VanguardEffects } from '../components/3d/VanguardEffects';
import {
  surfaceRotation,
  toVector,
  type FrameContext,
  type Renderer,
} from '../survivors/renderFrame';
import { lerpNormal, vec3 } from '../survivors/sphere';
import { ENEMY_GROUND_RADIUS } from '../utils/enemySwarm';
import { SECTOR_COLORS } from '../utils/sectorVisuals';
import { VANGUARD, VanguardAnimation } from '../utils/vanguardAnimation';
import { BOLT_CASTER_MODEL } from '../utils/boltCasterAnimation';
import type { ActionSpec } from './actions';
import type { ActionDriver } from './driver';
import { BladeTrail, readAuthored, readGame } from './pose';
import { BladeAfterimage } from '../survivors/bladeAfterimage';
import { poseVanguard } from '../survivors/poseVanguard';
import { authoredLoop, type ClipName } from './timeline';
import type { Transport } from './transport';
import {
  placeCamera,
  type Orbit,
  type Overlays,
  type Source,
  type ViewId,
} from './view';

const RADIUS = ENEMY_GROUND_RADIUS;
/** Samples an authored swing's blade path takes per second. */
const PATH_RATE = 120;

interface StageProps {
  driver: ActionDriver;
  transport: Transport;
  view: ViewId;
  orbit: Orbit;
  overlays: Overlays;
  source: Source;
  /** The clip to play as authored; null keeps the game's composite. */
  clip: ClipName | null;
  framing: ActionSpec['framing'];
  /** Write what the animation is doing to the transport each frame. */
  readout?: boolean;
}

interface Raw {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  weapon?: THREE.Object3D;
  clip: string | null;
}

/** Pose the authored model at `time` into `clip`, over the whole body. */
function poseRaw(raw: Raw, clip: string, time: number) {
  const action = raw.actions.get(clip);
  if (!action) return;
  if (raw.clip !== clip) {
    raw.mixer.stopAllAction();
    action.reset().play();
    action.paused = true;
    raw.clip = clip;
  }
  action.time = time;
  raw.mixer.update(0);
}

/**
 * One action on a patch of the Core: its scripted run advanced to the
 * transport's moment, drawn by the game's own Vanguard animation, slash and
 * effect renderers, and lit like a run.
 */
export function ActionStage(props: StageProps) {
  const { scene, animations } = useGLTF(VANGUARD.url);
  const { scene: gun } = useGLTF(BOLT_CASTER_MODEL);
  const size = useThree((state) => state.size);
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const light = useRef<THREE.DirectionalLight>(null);
  const gameRoot = useRef<THREE.Group>(null);
  const actorGroup = useRef<THREE.Group>(null);
  const rawGroup = useRef<THREE.Group>(null);
  const world = useRef<THREE.Group>(null);
  const registry = useMemo(() => new Set<Renderer>(), []);
  const afterimage = useMemo(() => new BladeAfterimage(), []);
  const trail = useMemo(() => new BladeTrail(), []);
  const game = useRef<{
    actor: VanguardAnimation;
    weapon?: THREE.Object3D;
  } | null>(null);
  const raw = useRef<Raw | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const state = useRef({
    /** The driver and run the pose last followed. */
    driver: null as ActionDriver | null,
    generation: -1,
    /** Run time of the last pose; poses only move forward. */
    posed: -Infinity,
    twist: 0,
    path: false,
    source: 'game' as Source,
  });
  const scratch = useMemo(
    () => ({
      normal: vec3(),
      up: new THREE.Vector3(),
      heading: new THREE.Vector3(),
      forward: new THREE.Vector3(),
    }),
    []
  );

  useEffect(
    () => () => {
      trail.dispose();
      afterimage.dispose();
    },
    [trail, afterimage]
  );

  useLayoutEffect(() => {
    const group = actorGroup.current;
    if (!group) return;
    const actor = new VanguardAnimation(scene, animations, gun);
    actor.root.scale.setScalar(VANGUARD.scale);
    group.add(actor.root);
    game.current = {
      actor,
      weapon: actor.root.getObjectByName('weapon') ?? undefined,
    };
    // A new model starts its gait fresh, so replay the run into it.
    state.current.driver = null;
    return () => {
      actor.dispose();
      game.current = null;
    };
  }, [scene, animations, gun]);

  useLayoutEffect(() => {
    const group = rawGroup.current;
    if (!group) return;
    const root = clone(scene);
    root.scale.setScalar(VANGUARD.scale);
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.frustumCulled = false;
      object.raycast = () => undefined;
    });
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map(
      animations.map((clip) => [clip.name, mixer.clipAction(clip)])
    );
    group.add(root);
    raw.current = {
      root,
      mixer,
      actions,
      weapon: root.getObjectByName('weapon') ?? undefined,
      clip: null,
    };
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      group.remove(root);
      raw.current = null;
    };
  }, [scene, animations]);

  useFrame((_, delta) => {
    const { driver, transport, view, orbit, overlays, source, clip, framing } =
      latest.current;
    const view3d = camera.current;
    if (!view3d) return;
    transport.advance(Math.min(delta, 0.1));
    const st = state.current;
    const authored = source === 'authored' && clip !== null && !!raw.current;
    // Coming back to the run, or turning the path on, replays the run so the
    // path and the gait are rebuilt from the start of the loop.
    if (
      st.driver !== driver ||
      (!authored && st.source === 'authored') ||
      (overlays.path && !st.path)
    ) {
      driver.reset();
      st.driver = driver;
    }
    st.path = overlays.path;
    st.source = authored ? 'authored' : 'game';
    if (gameRoot.current) gameRoot.current.visible = !authored;
    if (rawGroup.current) rawGroup.current.visible = authored;
    if (world.current) world.current.visible = !authored;

    const subject = { normal: scratch.up, heading: scratch.heading };
    if (!authored && game.current) {
      const { actor, weapon } = game.current;
      const group = actorGroup.current!;
      const pose = (time: number, alpha: number) => {
        if (st.generation !== driver.generation) {
          st.generation = driver.generation;
          st.posed = -Infinity;
          trail.clear(driver);
        }
        if (time <= st.posed) return;
        st.posed = time;
        const run = driver.run;
        lerpNormal(scratch.normal, run.player.prev, run.player.n, alpha);
        st.twist = poseVanguard(
          group,
          actor,
          run,
          RADIUS,
          scratch.normal,
          alpha
        );
        const attack = run.player.saberAttack;
        afterimage.sample(
          time,
          run.status === 'fallen' ? undefined : attack,
          weapon
        );
        if (!overlays.path || !weapon || !attack) return;
        const elapsed = time - attack.startedAt;
        if (elapsed < 0 || elapsed > attack.duration) return;
        group.updateMatrixWorld(true);
        trail.sample(time, weapon);
      };
      const time = driver.runTime(transport.time);
      const alpha = driver.show(time, (at, a, replay) => {
        if (replay || overlays.path) pose(at, a);
      });
      pose(time, alpha);
      trail.sync(time, overlays.path);
      const run = driver.run;
      lerpNormal(scratch.normal, run.player.prev, run.player.n, alpha);
      toVector(scratch.up, scratch.normal);
      // Keep the drill camera on the same side as the runner changes direction.
      toVector(
        scratch.heading,
        driver.spec.kind === 'reversal'
          ? run.player.forward
          : run.player.heading
      );
      toVector(scratch.forward, run.player.forward);
      const frame: FrameContext = {
        run,
        alpha,
        radius: RADIUS,
        camera: view3d,
        size,
        normal: scratch.normal,
        forward: run.player.forward,
        right: run.right,
      };
      for (const render of registry) render(frame);
      if (driver.spec.kind === 'moving-loadout' && view !== 'game') {
        toVector(scratch.up, driver.origin.n);
        toVector(scratch.heading, driver.origin.heading);
      }
      if (latest.current.readout)
        transport.readout = readGame(actor, run, time, st.twist);
    } else if (authored && raw.current && clip) {
      const { origin } = driver;
      toVector(scratch.up, origin.n);
      toVector(scratch.heading, origin.heading);
      toVector(scratch.forward, origin.forward);
      const group = rawGroup.current!;
      group.position.copy(scratch.up).multiplyScalar(RADIUS);
      surfaceRotation(group.quaternion, scratch.up, scratch.heading);
      const { clipTime, loop } = authoredLoop(clip);
      const shown = clipTime(transport.time);
      const r = raw.current;
      if (overlays.path && r.weapon && trail.owner !== clip) {
        // A clip's path doesn't change; sample it whole, once.
        trail.clear(clip);
        group.updateMatrixWorld(true);
        for (let t = 0; t <= loop; t += 1 / PATH_RATE) {
          poseRaw(r, clip, clipTime(t));
          r.root.updateMatrixWorld(true);
          trail.sample(t, r.weapon);
        }
        st.generation = -1;
      }
      poseRaw(r, clip, shown);
      trail.sync(shown, overlays.path && trail.owner === clip);
      if (latest.current.readout) transport.readout = readAuthored(clip, shown);
    }

    const look = placeCamera(
      view3d,
      view,
      orbit,
      framing,
      subject,
      scratch.forward,
      RADIUS,
      size.width / Math.max(1, size.height)
    );
    const headlight = light.current;
    if (headlight) {
      headlight.position.copy(view3d.position);
      headlight.target.position.copy(look);
      headlight.target.updateMatrixWorld();
    }
  });

  const { overlays } = props;
  const kind = props.driver.spec.kind;
  return (
    <>
      <PerspectiveCamera ref={camera} makeDefault near={0.01} />
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
      <group ref={gameRoot}>
        <group ref={actorGroup} dispose={null} />
      </group>
      <group ref={rawGroup} visible={false} dispose={null} />
      <group ref={world}>
        {overlays.effects ? (
          <>
            <primitive object={afterimage.mesh} />
            <SaberSlashes registry={registry} color={colors.accent.soft} />
            <VanguardEffects registry={registry} />
            {(kind === 'bolt-caster' || kind === 'railstorm') && (
              <Bolts registry={registry} />
            )}
            {(kind === 'shards' ||
              kind === 'shard-halo' ||
              kind === 'moving-loadout') && <OrbitShards registry={registry} />}
            {(kind === 'charge' || kind === 'meltdown') && (
              <SectorChargeEffects registry={registry} />
            )}
            {(kind === 'pulse' ||
              kind === 'bastion' ||
              kind === 'moving-loadout') && (
              <StakePulseField registry={registry} />
            )}
            {(kind === 'orbital-strike' || kind === 'chain-barrage') && (
              <>
                <OrbitalStrikes registry={registry} />
                <SectorRipples registry={registry} />
              </>
            )}
          </>
        ) : null}
        {overlays.targets ? (
          <Suspense fallback={null}>
            <RiggedBatch model="mite" registry={registry} />
          </Suspense>
        ) : null}
      </group>
      <primitive object={trail.object} />
    </>
  );
}
