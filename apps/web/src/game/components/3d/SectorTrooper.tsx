import { useEffect, useMemo, useRef, useState } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useSectors } from '../../contexts/SectorContext';
import { sectorStakeHeights } from '../../utils/sectorStakeRelief';
import { enemyGroundRadius } from '../../utils/enemySwarm';
import {
  bindTrooperOrbit,
  TrooperCameraOrbit,
} from '../../utils/trooperCamera';
import {
  TROOPER_MODEL_URL,
  TROOPER_SCALE,
  TROOPER_SOLE_OFFSET,
  TrooperController,
  trooperInput,
  isTypingTarget,
} from '../../utils/trooperController';

import { TrooperAnimation } from '../../utils/trooperAnimation';
import {
  TrooperAim,
  TrooperAimPose,
  TROOPER_MUZZLE_NAME,
} from '../../utils/trooperAim';
import {
  TrooperKeyboard,
  bindTrooperKeyboard,
} from '../../utils/trooperKeyboard';

export default function SectorTrooper({ active }: { active: boolean }) {
  const { scene, animations } = useGLTF(TROOPER_MODEL_URL);
  const { camera, gl } = useThree();
  const { controlView, occupiedSectorIds, sectorCaptureForce } = useSectors();
  const [paused, setPaused] = useState(false);
  const keyboard = useMemo(() => new TrooperKeyboard(), []);
  const group = useRef<THREE.Group>(null);
  const crosshair = useRef<HTMLDivElement>(null);
  const aim = useMemo(() => new TrooperAim(), []);
  const controller = useMemo(() => new TrooperController(), []);
  const orbit = useMemo(() => new TrooperCameraOrbit(), []);
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
  const model = useMemo(() => {
    const model = clone(scene);
    model.name = 'Sector Trooper player';
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.frustumCulled = false;
        object.raycast = () => undefined;
      }
    });
    return model;
  }, [scene]);
  const surfaceAim = useMemo(() => new TrooperAimPose(model), [model]);
  const muzzle = useMemo(() => {
    const marker = model.getObjectByName(TROOPER_MUZZLE_NAME);
    if (!marker)
      throw new Error('Trooper rifle is missing its muzzle attachment');
    return marker;
  }, [model]);
  const runtime = useRef<TrooperAnimation | null>(null);
  const scratch = useMemo(
    () => ({
      left: new THREE.Vector3(),
      matrix: new THREE.Matrix4(),
      target: new THREE.Vector3(),
      position: new THREE.Vector3(),
    }),
    []
  );

  useEffect(() => {
    const position = camera.position.clone();
    const up = camera.up.clone();
    const rotation = camera.quaternion.clone();
    return () => {
      camera.position.copy(position);
      camera.up.copy(up);
      camera.quaternion.copy(rotation);
      camera.updateMatrixWorld();
    };
  }, [camera]);

  useEffect(() => {
    if (!active) return;
    return bindTrooperOrbit(gl.domElement, orbit, (angle) =>
      controller.turn(angle)
    );
  }, [active, gl, orbit, controller]);

  useEffect(() => {
    const animator = new TrooperAnimation(model, animations);
    runtime.current = animator;
    return () => {
      runtime.current = null;
      animator.dispose(model);
      model.traverse((o) => {
        if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
      });
    };
  }, [model, animations]);

  useEffect(() => {
    if (!active || paused) {
      keyboard.clear();
      controller.stop();
      if (!active) return;
      const resume = (event: KeyboardEvent) => {
        if (
          event.code === 'Escape' &&
          !event.repeat &&
          !isTypingTarget(event.target)
        )
          setPaused(false);
      };
      window.addEventListener('keydown', resume);
      return () => window.removeEventListener('keydown', resume);
    }
    return bindTrooperKeyboard(
      keyboard,
      () => controller.stop(),
      () => setPaused(true)
    );
  }, [active, paused, controller, keyboard]);

  useFrame(({ size }, delta) => {
    const live = runtime.current;
    if (!active || !group.current || !live) return;
    const canMove = !paused && keyboard.focused && !document.hidden;
    let firing = false;
    if (canMove) {
      const inputKeys = keyboard.takeFrame();
      firing = inputKeys.has('Space');
      controller.update(delta, groundRadius, {
        ...trooperInput(inputKeys),
        firing,
      });
    }
    surfaceAim.reset();
    live.update(delta, controller, canMove);
    scratch.left
      .crossVectors(controller.normal, controller.forward)
      .normalize();
    scratch.matrix.makeBasis(
      scratch.left,
      controller.normal,
      controller.forward
    );
    group.current.quaternion.setFromRotationMatrix(scratch.matrix);
    group.current.position.copy(controller.normal).multiplyScalar(groundRadius);
    // Authored origin is at the chin; the nested offset puts the soles on ground.
    orbit.update(delta);
    orbit.sample(
      controller.normal,
      controller.forward,
      groundRadius,
      scratch.position,
      scratch.target
    );
    camera.position.copy(scratch.position);
    camera.up.copy(controller.normal);
    camera.lookAt(scratch.target);
    camera.updateMatrixWorld();
    aim.update(
      controller.normal,
      controller.forward,
      groundRadius,
      camera,
      orbit.consumeAimRequest()
    );
    surfaceAim.apply(controller.forward, aim.point, controller.fireWeight);
    aim.setMuzzle(muzzle);
    if (crosshair.current) {
      const visible = firing && aim.project(camera, size.width, size.height);
      crosshair.current.style.visibility = visible ? 'visible' : 'hidden';
      if (visible) {
        crosshair.current.style.transform = `translate(${aim.screen.x - 12}px, ${aim.screen.y - 12}px)`;
        crosshair.current.dataset.hit = aim.hitGround ? 'ground' : 'range';
      }
    }
  });

  return (
    <>
      <group ref={group} scale={TROOPER_SCALE} dispose={null}>
        <primitive object={model} position={[0, TROOPER_SOLE_OFFSET, 0]} />
      </group>
      <hemisphereLight args={['#eef2ff', '#747d8b', 2.4]} />
      {active ? (
        <Html
          fullscreen
          calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}
          style={{ pointerEvents: 'none' }}
          zIndexRange={[20, 10]}
        >
          <div
            ref={crosshair}
            role="img"
            aria-label="Rifle aim crosshair"
            className="pointer-events-none absolute left-0 top-0 text-gold"
            style={{
              visibility: 'hidden',
              width: 24,
              height: 24,
              filter: 'drop-shadow(0 1px 2px #000)',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 1v6M12 17v6M1 12h6M17 12h6"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            </svg>
          </div>
        </Html>
      ) : null}
    </>
  );
}
