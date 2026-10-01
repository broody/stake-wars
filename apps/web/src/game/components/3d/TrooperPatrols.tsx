import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  TROOPER_MODEL_URL,
  TROOPER_SCALE,
  TROOPER_SOLE_OFFSET,
} from '../../utils/trooperController';
import { TrooperAnimation } from '../../utils/trooperAnimation';
import { TrooperAimPose } from '../../utils/trooperAim';
import { TROOPER_PATROL_COUNT, TrooperPatrol } from '../../utils/trooperPatrol';

export default function TrooperPatrols({
  active,
  groundRadius,
}: {
  active: boolean;
  groundRadius: number;
}) {
  const { scene, animations } = useGLTF(TROOPER_MODEL_URL);
  const group = useRef<THREE.Group>(null);
  const view = useMemo(
    () => ({
      frustum: new THREE.Frustum(),
      matrix: new THREE.Matrix4(),
      bounds: new THREE.Sphere(new THREE.Vector3(), 0.65),
    }),
    []
  );
  const runtime = useRef<
    Array<{
      root: THREE.Group;
      model: THREE.Object3D;
      patrol: TrooperPatrol;
      animation: TrooperAnimation;
      aimPose: TrooperAimPose;
      left: THREE.Vector3;
      matrix: THREE.Matrix4;
      target: THREE.Vector3;
    }>
  >([]);

  useEffect(() => {
    const container = group.current;
    if (!container) return;
    const actors = Array.from({ length: TROOPER_PATROL_COUNT }, (_, index) => {
      const model = clone(scene);
      const root = new THREE.Group();
      root.name = `Autonomous Trooper ${index + 1}`;
      root.scale.setScalar(TROOPER_SCALE);
      model.position.y = TROOPER_SOLE_OFFSET;
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.frustumCulled = false;
          object.raycast = () => undefined;
        }
      });
      root.add(model);
      container.add(root);
      return {
        root,
        model,
        patrol: new TrooperPatrol(index),
        animation: new TrooperAnimation(model, animations),
        aimPose: new TrooperAimPose(model),
        left: new THREE.Vector3(),
        matrix: new THREE.Matrix4(),
        target: new THREE.Vector3(),
      };
    });
    runtime.current = actors;
    return () => {
      runtime.current = [];
      for (const actor of actors) {
        actor.aimPose.reset();
        actor.animation.dispose(actor.model);
        const skeletons = new Set<THREE.Skeleton>();
        actor.model.traverse((o) => {
          if (o instanceof THREE.SkinnedMesh) skeletons.add(o.skeleton);
        });
        skeletons.forEach((skeleton) => skeleton.dispose());
        container.remove(actor.root);
      }
    };
  }, [scene, animations]);

  useFrame(({ camera }, delta) => {
    if (!active || document.hidden) return;
    view.matrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    view.frustum.setFromProjectionMatrix(view.matrix);
    for (const actor of runtime.current) {
      actor.patrol.update(delta, groundRadius);
      const controller = actor.patrol.controller;
      actor.left
        .crossVectors(controller.normal, controller.forward)
        .normalize();
      actor.matrix.makeBasis(actor.left, controller.normal, controller.forward);
      actor.root.quaternion.setFromRotationMatrix(actor.matrix);
      actor.root.position.copy(controller.normal).multiplyScalar(groundRadius);
      view.bounds.center
        .copy(controller.normal)
        .multiplyScalar(groundRadius + 0.33);
      actor.root.visible = view.frustum.intersectsSphere(view.bounds);
      if (!actor.root.visible) continue;
      actor.aimPose.reset();
      actor.animation.update(delta, controller);
      const angle = 1.5 / groundRadius;
      actor.target
        .copy(controller.normal)
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(controller.forward, Math.sin(angle))
        .multiplyScalar(groundRadius + 0.06);
      actor.aimPose.apply(
        controller.forward,
        actor.target,
        controller.fireWeight
      );
    }
  });

  return <group ref={group} visible={active} dispose={null} />;
}
