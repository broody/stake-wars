import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useSectors } from '../../contexts/SectorContext';
import {
  advanceCoreSurfaceFrame,
  rotateSurfaceForward,
  tangentDirection,
} from '../../utils/coreWalk';
import { CORE_RADIUS, createSectorGeometry } from '../../utils/sectorGeometry';
import { sectorStakeHeights } from '../../utils/sectorStakeRelief';

const ROVER_MODEL_URL = '/models/quaternius-ultimate-space/rover-round.gltf';
const FORWARD_SPEED = 1.35;
const REVERSE_SPEED = 0.85;
const DRIVE_ACCELERATION = 3.6;
const COAST_DECELERATION = 4.8;
const STEERING_SPEED = 1.65;
const MAX_WHEEL_STEER_ANGLE = THREE.MathUtils.degToRad(24);
const WHEEL_STEER_RESPONSE = 14;
const CAMERA_DRAG_SENSITIVITY = 0.004;
const DEFAULT_CAMERA_PITCH = 0.55;
const MIN_CAMERA_PITCH = 0.14;
const MAX_CAMERA_PITCH = 1.05;
const CAMERA_DISTANCE = 1.55;
const ROVER_SURFACE_CLEARANCE = 0.025;
const ROVER_SCALE = 0.09;
const ROVER_WHEEL_RADIUS = 0.68 * ROVER_SCALE;
const ROVER_DISH_COMPONENT_MIN_Y = 3.4;
const ROVER_DISH_SPIN_SPEED = 0.55;
const ROVER_DISH_PIVOT = new THREE.Vector3(0, 3.45, -0.06);
const CAMERA_DAMPING = 15;
const CORE_LEAK_SKY_COLOR = '#080604';
const CORE_LEAK_GROUND_COLOR = '#fff0cf';
const CORE_LEAK_LIGHT_INTENSITY = 1.15;
const CORE_LEAK_LIGHT_RESPONSE = 7;

interface SavedCameraState {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  up: THREE.Vector3;
}

function splitRoverDishGeometry(source: THREE.BufferGeometry) {
  const positions = source.getAttribute('position');
  const index = source.getIndex();
  if (!positions || !index) return null;

  const parents = new Int32Array(positions.count);
  const ranks = new Uint8Array(positions.count);
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    parents[vertex] = vertex;
  }

  const findRoot = (vertex: number) => {
    let root = vertex;
    while (parents[root] !== root) root = parents[root];
    while (parents[vertex] !== vertex) {
      const parent = parents[vertex];
      parents[vertex] = root;
      vertex = parent;
    }
    return root;
  };
  const union = (left: number, right: number) => {
    let leftRoot = findRoot(left);
    let rightRoot = findRoot(right);
    if (leftRoot === rightRoot) return;
    if (ranks[leftRoot] < ranks[rightRoot]) {
      [leftRoot, rightRoot] = [rightRoot, leftRoot];
    }
    parents[rightRoot] = leftRoot;
    if (ranks[leftRoot] === ranks[rightRoot]) ranks[leftRoot] += 1;
  };

  const verticesByPosition = new Map<string, number>();
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const positionKey = `${positions.getX(vertex).toFixed(5)},${positions
      .getY(vertex)
      .toFixed(5)},${positions.getZ(vertex).toFixed(5)}`;
    const matchingVertex = verticesByPosition.get(positionKey);
    if (matchingVertex === undefined) {
      verticesByPosition.set(positionKey, vertex);
    } else {
      union(vertex, matchingVertex);
    }
  }

  for (let offset = 0; offset < index.count; offset += 3) {
    const first = index.getX(offset);
    union(first, index.getX(offset + 1));
    union(first, index.getX(offset + 2));
  }

  const componentMinY = new Map<number, number>();
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const root = findRoot(vertex);
    componentMinY.set(
      root,
      Math.min(componentMinY.get(root) ?? Infinity, positions.getY(vertex))
    );
  }
  const dishComponents = new Set(
    [...componentMinY.entries()]
      .filter(([, minY]) => minY > ROVER_DISH_COMPONENT_MIN_Y)
      .map(([root]) => root)
  );
  if (dishComponents.size === 0) return null;

  const bodyIndices: number[] = [];
  const dishIndices: number[] = [];
  for (let offset = 0; offset < index.count; offset += 3) {
    const first = index.getX(offset);
    const target = dishComponents.has(findRoot(first))
      ? dishIndices
      : bodyIndices;
    target.push(first, index.getX(offset + 1), index.getX(offset + 2));
  }

  const bodyGeometry = source.clone();
  bodyGeometry.setIndex(bodyIndices);
  bodyGeometry.computeBoundingBox();
  bodyGeometry.computeBoundingSphere();
  const dishGeometry = source.clone();
  dishGeometry.setIndex(dishIndices);
  dishGeometry.translate(
    -ROVER_DISH_PIVOT.x,
    -ROVER_DISH_PIVOT.y,
    -ROVER_DISH_PIVOT.z
  );
  dishGeometry.computeBoundingBox();
  dishGeometry.computeBoundingSphere();

  return { bodyGeometry, dishGeometry };
}

export function CoreWalkMode({
  active,
  onExit,
}: {
  active: boolean;
  onExit: () => void;
}) {
  const { camera, gl } = useThree();
  const { controlView, occupiedSectorIds, sectorCaptureForce } = useSectors();
  const { scene: roverScene } = useGLTF(ROVER_MODEL_URL);
  const roverRef = useRef<THREE.Group>(null);
  const coreLeakLightRef = useRef<THREE.HemisphereLight>(null);
  const wasActiveRef = useRef(false);
  const justActivatedRef = useRef(false);
  const cameraPitchRef = useRef(DEFAULT_CAMERA_PITCH);
  const cameraYawRef = useRef(0);
  const cameraDragButtonRef = useRef<0 | 2 | null>(null);
  const driveSpeedRef = useRef(0);
  const pressedKeysRef = useRef(new Set<string>());
  const surfaceNormalRef = useRef(new THREE.Vector3(0, 0, 1));
  const surfaceForwardRef = useRef(new THREE.Vector3(0, 1, 0));
  const savedCameraRef = useRef<SavedCameraState>({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    up: new THREE.Vector3(),
  });
  const scratch = useMemo(
    () => ({
      right: new THREE.Vector3(),
      travel: new THREE.Vector3(),
      position: new THREE.Vector3(),
      cameraPosition: new THREE.Vector3(),
      cameraTarget: new THREE.Vector3(),
      cameraForward: new THREE.Vector3(),
      backward: new THREE.Vector3(),
      basis: new THREE.Matrix4(),
      quaternion: new THREE.Quaternion(),
    }),
    []
  );
  const {
    roverModel,
    roverWheels,
    roverFrontSteeringPivots,
    roverDishPivot,
    roverGeneratedGeometries,
  } = useMemo(() => {
    const model = roverScene.clone(true);
    const generatedGeometries: THREE.BufferGeometry[] = [];
    let dishPivot: THREE.Group | null = null;
    const mergedBody = model.getObjectByName('Rover_Round');
    if (mergedBody instanceof THREE.Mesh && mergedBody.parent) {
      const splitGeometry = splitRoverDishGeometry(mergedBody.geometry);
      if (splitGeometry) {
        const assembly = new THREE.Group();
        assembly.name = 'Rover_Round_Assembly';
        assembly.position.copy(mergedBody.position);
        assembly.quaternion.copy(mergedBody.quaternion);
        assembly.scale.copy(mergedBody.scale);

        const stationaryBody = new THREE.Mesh(
          splitGeometry.bodyGeometry,
          mergedBody.material
        );
        stationaryBody.name = 'Rover_Round_Body';
        dishPivot = new THREE.Group();
        dishPivot.name = 'Rover_Round_DishPivot';
        dishPivot.position.copy(ROVER_DISH_PIVOT);
        const dish = new THREE.Mesh(
          splitGeometry.dishGeometry,
          mergedBody.material
        );
        dish.name = 'Rover_Round_Dish';
        dishPivot.add(dish);
        assembly.add(stationaryBody, dishPivot);
        mergedBody.parent.remove(mergedBody);
        model.add(assembly);
        generatedGeometries.push(
          splitGeometry.bodyGeometry,
          splitGeometry.dishGeometry
        );
      }
    }
    const wheels = ['Wheel_1', 'Wheel_2', 'Wheel_3', 'Wheel_4']
      .map((name) => model.getObjectByName(name))
      .filter((wheel): wheel is THREE.Object3D => wheel !== undefined);
    const frontSteeringPivots = ['Wheel_2', 'Wheel_3']
      .map((name) => model.getObjectByName(name))
      .map((wheel) => {
        if (!wheel?.parent) return undefined;

        const pivot = new THREE.Group();
        pivot.name = `${wheel.name}_SteeringPivot`;
        pivot.position.copy(wheel.position);
        wheel.parent.add(pivot);
        pivot.add(wheel);
        wheel.position.set(0, 0, 0);
        return pivot;
      })
      .filter((pivot): pivot is THREE.Group => pivot !== undefined);

    return {
      roverModel: model,
      roverWheels: wheels,
      roverFrontSteeringPivots: frontSteeringPivots,
      roverDishPivot: dishPivot,
      roverGeneratedGeometries: generatedGeometries,
    };
  }, [roverScene]);
  const stakedSectorHeights = useMemo(
    () => sectorStakeHeights(true, occupiedSectorIds, sectorCaptureForce, true),
    [occupiedSectorIds, sectorCaptureForce]
  );
  const occupiedSectorIdSet = useMemo(
    () => new Set(occupiedSectorIds),
    [occupiedSectorIds]
  );
  const terrainPicker = useMemo(() => {
    const geometry = createSectorGeometry(1);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    );
    mesh.updateMatrixWorld(true);
    return {
      mesh,
      raycaster: new THREE.Raycaster(),
      hits: [] as THREE.Intersection[],
    };
  }, []);

  useEffect(
    () => () => {
      terrainPicker.mesh.geometry.dispose();
      const material = terrainPicker.mesh.material;
      if (!Array.isArray(material)) material.dispose();
    },
    [terrainPicker]
  );

  useEffect(
    () => () => {
      roverGeneratedGeometries.forEach((geometry) => geometry.dispose());
    },
    [roverGeneratedGeometries]
  );

  useLayoutEffect(() => {
    roverModel.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
  }, [roverModel]);

  useLayoutEffect(() => {
    if (active && !wasActiveRef.current) {
      savedCameraRef.current.position.copy(camera.position);
      savedCameraRef.current.quaternion.copy(camera.quaternion);
      savedCameraRef.current.up.copy(camera.up);

      surfaceNormalRef.current.copy(camera.position).normalize();
      tangentDirection(
        surfaceForwardRef.current.copy(camera.up),
        surfaceNormalRef.current,
        new THREE.Vector3(0, 1, 0)
      );
      cameraPitchRef.current = DEFAULT_CAMERA_PITCH;
      cameraYawRef.current = 0;
      cameraDragButtonRef.current = null;
      driveSpeedRef.current = 0;
      justActivatedRef.current = true;
    } else if (!active && wasActiveRef.current) {
      camera.position.copy(savedCameraRef.current.position);
      camera.quaternion.copy(savedCameraRef.current.quaternion);
      camera.up.copy(savedCameraRef.current.up);
      camera.updateMatrixWorld(true);
      pressedKeysRef.current.clear();
      cameraDragButtonRef.current = null;
      driveSpeedRef.current = 0;
    }
    wasActiveRef.current = active;
  }, [active, camera]);

  useEffect(() => {
    if (!active) return;
    const pressedKeys = pressedKeysRef.current;

    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT');
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onExit();
        return;
      }
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (!['w', 'a', 's', 'd'].includes(key)) return;
      event.preventDefault();
      pressedKeys.add(key);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      pressedKeys.delete(event.key.toLowerCase());
      if (event.key === 'Shift' && cameraDragButtonRef.current === 0) {
        cameraDragButtonRef.current = null;
      }
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 2 && !(event.button === 0 && event.shiftKey)) return;
      event.preventDefault();
      cameraDragButtonRef.current = event.button;
    };
    const handleMouseMove = (event: MouseEvent) => {
      const dragButton = cameraDragButtonRef.current;
      if (dragButton === null) return;
      const buttonMask = dragButton === 2 ? 2 : 1;
      if (
        !(event.buttons & buttonMask) ||
        (dragButton === 0 && !event.shiftKey)
      ) {
        cameraDragButtonRef.current = null;
        return;
      }
      cameraYawRef.current -= event.movementX * CAMERA_DRAG_SENSITIVITY;
      cameraPitchRef.current = THREE.MathUtils.clamp(
        cameraPitchRef.current - event.movementY * CAMERA_DRAG_SENSITIVITY,
        MIN_CAMERA_PITCH,
        MAX_CAMERA_PITCH
      );
    };
    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === cameraDragButtonRef.current) {
        cameraDragButtonRef.current = null;
      }
    };
    const handleWindowBlur = () => {
      pressedKeys.clear();
      cameraDragButtonRef.current = null;
    };
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    gl.domElement.addEventListener('mousedown', handleMouseDown);
    gl.domElement.addEventListener('contextmenu', preventContextMenu);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      gl.domElement.removeEventListener('mousedown', handleMouseDown);
      gl.domElement.removeEventListener('contextmenu', preventContextMenu);
      pressedKeys.clear();
      cameraDragButtonRef.current = null;
    };
  }, [active, gl, onExit]);

  useEffect(
    () => () => {
      if (!wasActiveRef.current) return;
      camera.position.copy(savedCameraRef.current.position);
      camera.quaternion.copy(savedCameraRef.current.quaternion);
      camera.up.copy(savedCameraRef.current.up);
      camera.updateMatrixWorld(true);
    },
    [camera]
  );

  useFrame((_state, delta) => {
    if (!active || !roverRef.current) {
      if (roverRef.current) roverRef.current.visible = false;
      if (coreLeakLightRef.current) coreLeakLightRef.current.intensity = 0;
      return;
    }

    const cappedDelta = Math.min(delta, 0.05);
    if (roverDishPivot) {
      roverDishPivot.rotation.y += ROVER_DISH_SPIN_SPEED * cappedDelta;
    }
    const keys = pressedKeysRef.current;
    const throttleInput = Number(keys.has('w')) - Number(keys.has('s'));
    const steeringInput = Number(keys.has('d')) - Number(keys.has('a'));
    const normal = surfaceNormalRef.current;
    const forward = surfaceForwardRef.current;
    const targetSpeed =
      throttleInput > 0
        ? FORWARD_SPEED
        : throttleInput < 0
          ? -REVERSE_SPEED
          : 0;
    const acceleration =
      throttleInput === 0 ? COAST_DECELERATION : DRIVE_ACCELERATION;
    const speedDifference = targetSpeed - driveSpeedRef.current;
    driveSpeedRef.current += THREE.MathUtils.clamp(
      speedDifference,
      -acceleration * cappedDelta,
      acceleration * cappedDelta
    );
    const driveSpeed = driveSpeedRef.current;
    const isMoving = Math.abs(driveSpeed) > 0.001;
    const wheelSteerTarget = -steeringInput * MAX_WHEEL_STEER_ANGLE;
    const wheelSteerBlend = 1 - Math.exp(-WHEEL_STEER_RESPONSE * cappedDelta);
    roverFrontSteeringPivots.forEach((pivot) => {
      pivot.rotation.y = THREE.MathUtils.lerp(
        pivot.rotation.y,
        wheelSteerTarget,
        wheelSteerBlend
      );
    });

    if (isMoving) {
      if (steeringInput !== 0) {
        rotateSurfaceForward(
          forward,
          normal,
          -steeringInput * STEERING_SPEED * cappedDelta * Math.sign(driveSpeed)
        );
      }
      scratch.travel.copy(forward).multiplyScalar(Math.sign(driveSpeed));
      advanceCoreSurfaceFrame(
        { normal, forward },
        scratch.travel,
        (Math.abs(driveSpeed) * cappedDelta) / CORE_RADIUS
      );
      const wheelRotation = (-driveSpeed * cappedDelta) / ROVER_WHEEL_RADIUS;
      roverWheels.forEach((wheel) => {
        wheel.rotation.x += wheelRotation;
      });
    }

    terrainPicker.raycaster.set(
      scratch.position.copy(normal).multiplyScalar(2),
      scratch.backward.copy(normal).negate()
    );
    terrainPicker.hits.length = 0;
    terrainPicker.raycaster.intersectObject(
      terrainPicker.mesh,
      false,
      terrainPicker.hits
    );
    const sectorId = terrainPicker.hits[0]?.faceIndex;
    const isOccupiedSector =
      sectorId !== null &&
      sectorId !== undefined &&
      occupiedSectorIdSet.has(sectorId);
    if (coreLeakLightRef.current) {
      coreLeakLightRef.current.position.copy(normal);
      coreLeakLightRef.current.intensity = THREE.MathUtils.damp(
        coreLeakLightRef.current.intensity,
        isOccupiedSector ? CORE_LEAK_LIGHT_INTENSITY : 0,
        CORE_LEAK_LIGHT_RESPONSE,
        cappedDelta
      );
    }
    const terrainHeight =
      controlView === 'staked' && sectorId !== null && sectorId !== undefined
        ? (stakedSectorHeights.get(sectorId) ?? 0)
        : 0;

    const surfaceRadius = CORE_RADIUS + terrainHeight + ROVER_SURFACE_CLEARANCE;
    scratch.position.copy(normal).multiplyScalar(surfaceRadius);
    scratch.right.crossVectors(forward, normal).normalize();
    scratch.backward.copy(forward).negate();
    scratch.basis.makeBasis(scratch.right, normal, scratch.backward);
    scratch.quaternion.setFromRotationMatrix(scratch.basis);

    roverRef.current.visible = true;
    roverRef.current.position.copy(scratch.position);
    roverRef.current.quaternion.copy(scratch.quaternion);

    const pitch = cameraPitchRef.current;
    scratch.cameraForward.copy(forward);
    rotateSurfaceForward(scratch.cameraForward, normal, cameraYawRef.current);
    scratch.cameraTarget
      .copy(scratch.position)
      .addScaledVector(normal, 0.26)
      .addScaledVector(forward, 0.15);
    scratch.cameraPosition
      .copy(scratch.cameraTarget)
      .addScaledVector(
        scratch.cameraForward,
        -Math.cos(pitch) * CAMERA_DISTANCE
      )
      .addScaledVector(normal, Math.sin(pitch) * CAMERA_DISTANCE);

    if (justActivatedRef.current) {
      camera.position.copy(scratch.cameraPosition);
      justActivatedRef.current = false;
    } else {
      camera.position.lerp(
        scratch.cameraPosition,
        1 - Math.exp(-CAMERA_DAMPING * cappedDelta)
      );
    }
    camera.up.copy(normal);
    camera.lookAt(scratch.cameraTarget);
    camera.updateMatrixWorld(true);
  });

  return (
    <>
      <group ref={roverRef}>
        <primitive
          object={roverModel}
          rotation={[0, Math.PI, 0]}
          scale={ROVER_SCALE}
        />
      </group>
      <hemisphereLight
        ref={coreLeakLightRef}
        color={CORE_LEAK_SKY_COLOR}
        groundColor={CORE_LEAK_GROUND_COLOR}
        intensity={0}
        position={[0, 1, 0]}
      />
    </>
  );
}

useGLTF.preload(ROVER_MODEL_URL);
