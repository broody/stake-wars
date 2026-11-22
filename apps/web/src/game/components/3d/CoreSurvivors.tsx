import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { ENEMY_GROUND_RADIUS } from '../../utils/enemySwarm';
import { colors } from '../../../ui/tokens';
import { currentHero, survivorsSession } from '../../survivors/session';
import { survivorAudio } from '../../survivors/audio';
import type { Run } from '../../survivors/sim';
import type { ViewExtent } from '../../survivors/sim';
import { cross, lerpNormal, vec3, type Vec3 } from '../../survivors/sphere';
import {
  Bolts,
  BulwarkTelegraphs,
  DeathArcs,
  DefeatedBatch,
  DamageNumbers,
  Pickups,
  RiggedBatch,
  WorldEffects,
} from './CoreSurvivorsParts';
import {
  ENEMY_TELEGRAPHS,
  toVector,
  type FrameContext,
  type Renderer,
} from '../../survivors/renderFrame';

import { SABER_MODEL, SurvivorTrooper } from './SurvivorTrooper';
import { BOLT_CASTER_MODEL } from '../../utils/boltCasterAnimation';
import { VANGUARD } from '../../utils/vanguardAnimation';
import { SurvivorVanguard } from './SurvivorVanguard';
import { SaberSlashes, TrooperSaberSlashes } from './SaberSlashes';
import { SectorChargeEffects } from './SectorChargeEffects';
import { VanguardEffects } from './VanguardEffects';
import { SectorBreaches } from './SectorBreaches';
import { OrbitalStrikes } from './OrbitalStrikes';
import { SectorRipples } from './SectorRipples';
import { StakePulseField } from './StakePulseField';
import { OrbitShards } from './OrbitShards';
import { SurvivorGroundLight } from './SurvivorGroundLight';

import { SurvivorMeteor } from './SurvivorMeteor';
import {
  captureGlobeView,
  OPENING_CAMERA,
  sampleOpeningCamera,
} from '../../survivors/openingCamera';
import { DeathCamera } from '../../survivors/deathCamera';
import {
  sampleFollowCamera,
  followPullback,
} from '../../survivors/followCamera';
import { VoltTelegraphs } from './VoltTelegraphs';
import { SeekerCharacters } from './SeekerCharacters';
import { WardenCharacters, WardenSlamMarkers } from './WardenCharacters';

/**
 * Where a screen edge runs past the planet's horizon, spawns stop short of it:
 * near the horizon a Sector is seen edge-on and its flip would not read.
 */
const HORIZON_FRACTION = 0.75;
const edgeRay = new THREE.Ray();
const edgeSphere = new THREE.Sphere(new THREE.Vector3(), 1);
const edgeHit = new THREE.Vector3();
const edgePlayer = new THREE.Vector3();
const screenPlayer = new THREE.Vector3();
const EDGES = [
  ['right', 1, 0],
  ['left', -1, 0],
  ['up', 0, 1],
  ['down', 0, -1],
] as const;

/** Ground distance from the player to the middle of each screen edge. */
function measureView(
  view: ViewExtent,
  camera: THREE.Camera,
  player: Vec3,
  radius: number
) {
  edgeSphere.radius = radius;
  toVector(edgePlayer, player);
  screenPlayer.copy(edgePlayer).multiplyScalar(radius).project(camera);
  edgeRay.origin.setFromMatrixPosition(camera.matrixWorld);
  const horizon =
    Math.acos(Math.min(1, radius / edgeRay.origin.length())) *
    radius *
    HORIZON_FRACTION;
  for (const [edge, x, y] of EDGES) {
    edgeRay.direction
      .set(x || screenPlayer.x, y || screenPlayer.y, 0.5)
      .unproject(camera)
      .sub(edgeRay.origin)
      .normalize();
    const hit = edgeRay.intersectSphere(edgeSphere, edgeHit);
    view[edge] = hit
      ? Math.min(horizon, hit.normalize().angleTo(edgePlayer) * radius)
      : horizon;
  }
}

const heard = new THREE.Vector3();

/** Play the run's queued sounds, panned by where on screen they happened. */
function playCues(run: Run, camera: THREE.Camera, radius: number) {
  const emp = run.cues.some((cue) => cue.id === 'emp');
  for (const cue of run.cues) {
    let pan = 0;
    let gain = 1;
    if (cue.n) {
      heard.set(cue.n.x, cue.n.y, cue.n.z).multiplyScalar(radius);
      heard.project(camera);
      pan = Math.max(-1, Math.min(1, heard.x)) * 0.6;
      // Off-screen events are heard, but quieter than what you can see.
      if (Math.abs(heard.x) > 1.05 || Math.abs(heard.y) > 1.05 || heard.z > 1)
        gain = 0.4;
    }
    // Keep the individual kills underneath the detonation that caused them.
    if (
      emp &&
      (cue.id === 'death' || cue.id === 'death-heavy' || cue.id === 'crit')
    )
      gain *= 0.28;
    survivorAudio.play(cue.id, { pan, gain, rate: cue.rate, at: cue.at });
  }
  run.cues.length = 0;
}

function tangentLerp(out: Vec3, a: Vec3, b: Vec3, t: number, normal: Vec3) {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  const d = out.x * normal.x + out.y * normal.y + out.z * normal.z;
  out.x -= normal.x * d;
  out.y -= normal.y * d;
  out.z -= normal.z * d;
  const length = Math.hypot(out.x, out.y, out.z) || 1;
  out.x /= length;
  out.y /= length;
  out.z /= length;
  return out;
}

export default function CoreSurvivors({ active }: { active: boolean }) {
  const { camera, size } = useThree();
  const registry = useMemo(() => new Set<Renderer>(), []);
  // The run started on mount plays this hero; it only changes with the page.
  const hero = useMemo(currentHero, []);
  // Suspend until the hero's model is in, so a run never starts without it.
  useGLTF(hero === 'trooper' ? SABER_MODEL : VANGUARD.url);
  useGLTF(BOLT_CASTER_MODEL);
  // The run plays on the bare Core, which never raises its Sectors.
  const groundRadius = ENEMY_GROUND_RADIUS;
  const view = useMemo(
    () => ({
      normal: vec3(),
      forward: vec3(),
      right: vec3(),
      eye: new THREE.Vector3(),
      look: new THREE.Vector3(),
      ahead: new THREE.Vector3(),
    }),
    []
  );
  const heroGroup = useRef<THREE.Group>(null);
  const deathCamera = useRef<DeathCamera | null>(null);
  const lastLook = useRef(new THREE.Vector3());
  const headlight = useRef<THREE.DirectionalLight>(null);

  // Browsers only start audio from a gesture; the first key or click will do.
  useEffect(() => {
    const unlock = () => survivorAudio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      survivorAudio.hold(false);
    };
  }, []);

  // Take the camera for the run and give it back afterwards.
  useLayoutEffect(() => {
    const saved = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      up: camera.up.clone(),
    };
    if (!survivorsSession.run)
      survivorsSession.start(
        ENEMY_GROUND_RADIUS,
        undefined,
        captureGlobeView(camera)
      );
    return () => {
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      camera.up.copy(saved.up);
      camera.updateMatrixWorld(true);
      survivorsSession.run = null;
      survivorsSession.globeView = undefined;
      survivorsSession.keys.clear();
    };
  }, [camera]);

  useFrame((_, delta) => {
    const run = survivorsSession.run;
    if (!run || !active) return;
    run.groundRadius = groundRadius;
    survivorsSession.advance(delta);
    const orbit = survivorsSession.opening
      ? survivorsSession.globeView
      : undefined;
    const age = survivorsSession.openingAge;
    const actor = heroGroup.current;
    if (actor) actor.visible = !orbit || age >= OPENING_CAMERA.split;
    const alpha = survivorsSession.alpha;
    const player = run.player;
    const normal = lerpNormal(view.normal, player.prev, player.n, alpha);
    const forward = tangentLerp(
      view.forward,
      player.prevForward,
      player.forward,
      alpha,
      normal
    );
    const right = cross(view.right, forward, normal);
    const { eye, look, ahead } = view;
    // Narrow screens back the camera off along its own line of sight.
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 75;
    const aspect = size.width / Math.max(1, size.height);
    const pullback = followPullback(fov, aspect);
    const cameraOrbit = survivorsSession.cameraOrbit;
    sampleFollowCamera(
      normal,
      forward,
      groundRadius,
      pullback * cameraOrbit.sampleDistance(delta),
      eye,
      look,
      ahead,
      cameraOrbit.yaw,
      cameraOrbit.pitch
    );
    if (run.status === 'fallen') {
      if (!deathCamera.current)
        deathCamera.current = new DeathCamera(
          camera.position,
          lastLook.current,
          camera.up,
          player.n,
          player.heading,
          groundRadius
        );
      deathCamera.current.sample(run.deathAge, eye, look, ahead);
    } else {
      deathCamera.current = null;
      if (orbit)
        sampleOpeningCamera(
          age,
          orbit,
          groundRadius,
          pullback,
          eye,
          look,
          ahead
        );
    }
    if (run.shake > 0 && run.status !== 'fallen') {
      const amount = run.shake * 0.12;
      eye.x += (Math.random() - 0.5) * amount;
      eye.y += (Math.random() - 0.5) * amount;
      eye.z += (Math.random() - 0.5) * amount;
    }
    lastLook.current.copy(look);
    camera.position.copy(eye);
    camera.up.copy(ahead);
    camera.lookAt(look);
    camera.updateMatrixWorld();
    if (
      // Ranked runs and their clips keep the fixed view that spawns read.
      !survivorsSession.replay &&
      !survivorsSession.watchingClip &&
      run.status !== 'fallen' &&
      !survivorsSession.opening
    ) {
      run.view.yaw = cameraOrbit.yaw;
      measureView(run.view, camera, normal, groundRadius);
    }
    survivorAudio.hold(survivorsSession.paused);
    // A level-up or Supply Drop stops the run; drop sounds queued for later.
    if (run.status === 'choosing' || run.status === 'supply')
      survivorAudio.cancelPending();
    playCues(run, camera, groundRadius);
    // A light from the camera keeps the dark Hollow Legion readable on the Core.
    const light = headlight.current;
    if (light) {
      light.position.copy(eye);
      light.target.position.copy(look);
      light.target.updateMatrixWorld();
    }
    const frame: FrameContext = {
      run,
      openingAge: age,
      orbit,
      alpha,
      radius: groundRadius,
      camera,
      size,
      normal,
      forward,
      right,
    };
    for (const render of registry) render(frame);
  });

  return (
    <group visible={active}>
      <hemisphereLight args={[colors.fg.DEFAULT, colors.fg.muted, 2.4]} />
      <ambientLight intensity={0.9} />
      <directionalLight
        ref={headlight}
        intensity={2.2}
        color={colors.fg.DEFAULT}
      />
      <SurvivorMeteor registry={registry} />
      <SurvivorGroundLight registry={registry} />
      <SectorBreaches registry={registry} />
      <SectorRipples registry={registry} />
      <OrbitalStrikes registry={registry} />
      <StakePulseField registry={registry} />
      <WorldEffects registry={registry} />
      <WardenSlamMarkers registry={registry} groundRadius={groundRadius} />
      <SectorChargeEffects registry={registry} />
      <VanguardEffects registry={registry} />
      <DeathArcs registry={registry} />
      <BulwarkTelegraphs registry={registry} />
      {ENEMY_TELEGRAPHS && <VoltTelegraphs registry={registry} />}
      <Suspense fallback={null}>
        <group ref={heroGroup} visible={false}>
          {hero === 'trooper' ? (
            <SurvivorTrooper registry={registry} />
          ) : (
            <SurvivorVanguard registry={registry} />
          )}
        </group>
        {hero === 'trooper' ? (
          <TrooperSaberSlashes registry={registry} />
        ) : (
          <SaberSlashes registry={registry} color={colors.accent.soft} />
        )}
      </Suspense>
      <Suspense fallback={null}>
        <RiggedBatch model="mite" registry={registry} />
        <DefeatedBatch model="mite" registry={registry} />
      </Suspense>
      <Suspense fallback={null}>
        <RiggedBatch model="lancer" registry={registry} />
        <DefeatedBatch model="lancer" registry={registry} />
      </Suspense>
      <Suspense fallback={null}>
        <RiggedBatch model="bulwark" registry={registry} />
        <DefeatedBatch model="bulwark" registry={registry} />
      </Suspense>
      <Suspense fallback={null}>
        <SeekerCharacters registry={registry} />
      </Suspense>
      <Suspense fallback={null}>
        <WardenCharacters registry={registry} />
      </Suspense>
      <OrbitShards registry={registry} />
      <Bolts registry={registry} />
      <Pickups registry={registry} />
      <DamageNumbers registry={registry} />
    </group>
  );
}
