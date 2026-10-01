import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSectors } from '../../contexts/SectorContext';
import { sectorStakeHeights } from '../../utils/sectorStakeRelief';
import { enemyGroundRadius } from '../../utils/enemySwarm';
import { colors } from '../../../ui/tokens';
import { survivorsSession } from '../../survivors/session';
import type { ViewExtent } from '../../survivors/sim';
import { cross, lerpNormal, vec3, type Vec3 } from '../../survivors/sphere';
import {
  Bolts,
  BulwarkTelegraphs,
  DefeatedBatch,
  DamageNumbers,
  PlaceholderBatch,
  PlayerFrameEffects,
  Pickups,
  RiggedBatch,
  Shards,
  WorldEffects,
} from './CoreSurvivorsParts';
import {
  toVector,
  type FrameContext,
  type Renderer,
} from '../../survivors/renderFrame';

import { SurvivorTrooper } from './SurvivorTrooper';
import { SaberSlashes } from './SaberSlashes';
import { SectorBreaches } from './SectorBreaches';
import { SectorRipples } from './SectorRipples';

import { DeathCamera } from '../../survivors/deathCamera';
import { WardenCharacters } from './WardenCharacters';

const CAMERA_HEIGHT = 3.3;
const CAMERA_BACK = 0.9;
const CAMERA_LEAD = 0.15;

/**
 * Where a screen edge runs past the planet's horizon, spawns stop short of it:
 * near the horizon a Sector is seen edge-on and its flip would not read.
 */
const HORIZON_FRACTION = 0.75;
const edgeRay = new THREE.Ray();
const edgeSphere = new THREE.Sphere(new THREE.Vector3(), 1);
const edgeHit = new THREE.Vector3();
const edgePlayer = new THREE.Vector3();
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
  edgeRay.origin.setFromMatrixPosition(camera.matrixWorld);
  const horizon =
    Math.acos(Math.min(1, radius / edgeRay.origin.length())) *
    radius *
    HORIZON_FRACTION;
  for (const [edge, x, y] of EDGES) {
    edgeRay.direction
      .set(x, y, 0.5)
      .unproject(camera)
      .sub(edgeRay.origin)
      .normalize();
    const hit = edgeRay.intersectSphere(edgeSphere, edgeHit);
    view[edge] = hit
      ? Math.min(horizon, hit.normalize().angleTo(edgePlayer) * radius)
      : horizon;
  }
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
  const { controlView, occupiedSectorIds, sectorCaptureForce } = useSectors();
  const registry = useMemo(() => new Set<Renderer>(), []);
  const groundRadius = useMemo(
    () =>
      enemyGroundRadius(
        sectorStakeHeights(
          controlView === 'staked',
          occupiedSectorIds,
          sectorCaptureForce,
          false
        )
      ),
    [controlView, occupiedSectorIds, sectorCaptureForce]
  );
  const radiusRef = useRef(groundRadius);
  radiusRef.current = groundRadius;
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
  const deathCamera = useRef<DeathCamera | null>(null);
  const lastLook = useRef(new THREE.Vector3());
  const headlight = useRef<THREE.DirectionalLight>(null);

  // Take the camera for the run and give it back afterwards.
  useLayoutEffect(() => {
    const saved = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      up: camera.up.clone(),
    };
    if (!survivorsSession.run) survivorsSession.start(radiusRef.current);
    return () => {
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      camera.up.copy(saved.up);
      camera.updateMatrixWorld(true);
      survivorsSession.run = null;
      survivorsSession.keys.clear();
    };
  }, [camera]);

  useFrame((_, delta) => {
    const run = survivorsSession.run;
    if (!run || !active) return;
    run.groundRadius = groundRadius;
    survivorsSession.advance(delta);
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
    toVector(ahead, forward);
    eye
      .set(normal.x, normal.y, normal.z)
      .multiplyScalar(groundRadius + CAMERA_HEIGHT)
      .addScaledVector(ahead, -CAMERA_BACK);
    look
      .set(normal.x, normal.y, normal.z)
      .multiplyScalar(groundRadius)
      .addScaledVector(ahead, CAMERA_LEAD);
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
    if (run.status !== 'fallen')
      measureView(run.view, camera, normal, groundRadius);
    // A light from the camera keeps the dark Hollow Legion readable on the Core.
    const light = headlight.current;
    if (light) {
      light.position.copy(eye);
      light.target.position.copy(look);
      light.target.updateMatrixWorld();
    }
    const frame: FrameContext = {
      run,
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
      <SectorBreaches registry={registry} />
      <SectorRipples registry={registry} />
      <PlayerFrameEffects registry={registry} />
      <WorldEffects registry={registry} />
      <BulwarkTelegraphs registry={registry} />
      <Suspense fallback={null}>
        <SurvivorTrooper registry={registry} />
        <SaberSlashes registry={registry} />
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
      <PlaceholderBatch model="seeker" capacity={80} registry={registry} />
      <Suspense fallback={null}>
        <WardenCharacters registry={registry} />
      </Suspense>
      <Shards registry={registry} />
      <Bolts registry={registry} />
      <Pickups registry={registry} />
      <DamageNumbers registry={registry} />
    </group>
  );
}
