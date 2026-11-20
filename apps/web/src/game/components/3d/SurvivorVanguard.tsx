import { useLayoutEffect, useRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { VANGUARD, VanguardAnimation } from '../../utils/vanguardAnimation';
import { BOLT_CASTER_MODEL } from '../../utils/boltCasterAnimation';
import { BladeAfterimage } from '../../survivors/bladeAfterimage';
import { SIM_HZ } from '../../survivors/sim';
import { OPENING_CAMERA } from '../../survivors/openingCamera';
import { poseVanguard } from '../../survivors/poseVanguard';
import { useRenderer, type Renderer } from '../../survivors/renderFrame';

/** The Vanguard as the player: gait from its ground speed, swings from the sim. */
export function SurvivorVanguard({ registry }: { registry: Set<Renderer> }) {
  const { scene, animations } = useGLTF(VANGUARD.url);
  const { scene: gun } = useGLTF(BOLT_CASTER_MODEL);
  const container = useRef<THREE.Group>(null);
  const afterimage = useMemo(() => new BladeAfterimage(), []);
  const weapon = useRef<THREE.Object3D | undefined>(undefined);
  const actor = useRef<VanguardAnimation | undefined>(undefined);
  useLayoutEffect(() => {
    const a = new VanguardAnimation(scene, animations, gun);
    actor.current = a;
    weapon.current = a.root.getObjectByName('weapon');
    // Its soles are at the origin, so it stands on the ground as scaled.
    a.root.scale.setScalar(VANGUARD.scale);
    container.current?.add(a.root);
    return () => {
      afterimage.dispose();
      a.dispose();
      actor.current = undefined;
    };
  }, [scene, animations, gun, afterimage]);
  useRenderer(
    registry,
    ({ run, radius, normal, alpha, openingAge = 0, orbit }) => {
      const group = container.current,
        a = actor.current;
      if (!group || !a) return;
      const impactAge = openingAge - OPENING_CAMERA.impact;
      const brace = orbit
        ? THREE.MathUtils.smoothstep(impactAge, -0.05, 0.11) *
          (1 - THREE.MathUtils.smoothstep(impactAge, 0.48, 1.0))
        : 0;
      poseVanguard(group, a, run, radius, normal, alpha, openingAge, brace);
      afterimage.sample(
        run.time - (1 - alpha) / SIM_HZ,
        run.status === 'fallen' ? undefined : run.player.saberAttack,
        weapon.current
      );
    }
  );
  return (
    <>
      <group ref={container} dispose={null} />
      <primitive object={afterimage.mesh} />
    </>
  );
}
useGLTF.preload(VANGUARD.url);
