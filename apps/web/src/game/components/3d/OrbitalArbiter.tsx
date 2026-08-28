import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useArbiter } from '../../contexts/useArbiter';
import { useSectors } from '../../contexts/SectorContext';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';
import {
  arbiterOrbitAngle,
  arbiterOrbitPrecession,
  positionOnArbiterOrbit,
  tangentOnArbiterOrbit,
  upOnArbiterOrbit,
} from '../../utils/arbiterOrbit';
import {
  ARBITER_INITIAL_ROTATION,
  ARBITER_RADIUS,
  ARBITER_ROTATION_SPEED,
} from '../../utils/arbiterVisuals';

const ORBIT_HOVER_HOLD_MS = 3_000;
const ORBIT_IDLE_COLOR = new THREE.Color(SECTOR_COLORS.neutralGrid);
const ORBIT_HOVER_COLOR = new THREE.Color(SECTOR_COLORS.hover);
const PROJECTION_MAX_DIMENSION = 4.8;
const PROJECTION_DEFAULT_ASPECT_RATIO = 16 / 9;
const PROJECTION_ORBIT_RADIUS = 15;
const PROJECTION_FACE_OFFSET = 0.018;
const PROJECTION_MARK_OFFSET = 0.032;
const PROJECTION_ALIGNMENT_DAMPING = 5;
const PROJECTION_OPACITY_DAMPING = 7;
const PROJECTION_BODY_OPACITY = 0.18;
const PROJECTION_ANIMATION_DURATION = 1.1;
const PROJECTION_BRACKET_PHASE_END = 0.62;
const PROJECTION_FLICKER_KEYFRAMES = [
  [0, 0],
  [0.08, 0.9],
  [0.16, 0.12],
  [0.28, 0.82],
  [0.37, 0.24],
  [0.5, 1],
  [0.62, 0.48],
  [0.78, 1],
  [1, 1],
] as const;
const PROJECTION_MARKS = [
  { x: -1, y: 1, xDirection: 1, yDirection: -1 },
  { x: 1, y: 1, xDirection: -1, yDirection: -1 },
  { x: -1, y: -1, xDirection: 1, yDirection: 1 },
  { x: 1, y: -1, xDirection: -1, yDirection: 1 },
] as const;

function projectionDimensions(width: number, height: number) {
  const aspectRatio =
    Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      ? width / height
      : PROJECTION_DEFAULT_ASPECT_RATIO;

  return aspectRatio >= 1
    ? {
        width: PROJECTION_MAX_DIMENSION,
        height: PROJECTION_MAX_DIMENSION / aspectRatio,
      }
    : {
        width: PROJECTION_MAX_DIMENSION * aspectRatio,
        height: PROJECTION_MAX_DIMENSION,
      };
}

export function OrbitalArbiter({
  isTracking,
  onInspect,
}: {
  isTracking: boolean;
  onInspect: () => void;
}) {
  const { snapshot } = useArbiter();
  const { isProjectionVisible } = useSectors();
  const orbitSystemRef = useRef<THREE.Group>(null);
  const arbiterRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const bodyMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const orbitLineRef = useRef<THREE.LineLoop>(null);
  const orbitMaterialRef = useRef<THREE.LineDashedMaterial>(null);
  const orbitHighlightUntilRef = useRef(0);
  const [isHovered, setIsHovered] = useState(false);
  const orbitPosition = useMemo(() => new THREE.Vector3(), []);
  const orbitGeometry = useMemo(() => {
    const points = Array.from({ length: 161 }, (_, index) => {
      const point = new THREE.Vector3();
      positionOnArbiterOrbit((index / 160) * Math.PI * 2, point);
      return point;
    });
    return new THREE.BufferGeometry().setFromPoints(points);
  }, []);
  const arbiterGeometry = useMemo(
    () => new THREE.TetrahedronGeometry(ARBITER_RADIUS, 0),
    []
  );
  const arbiterEdges = useMemo(
    () => new THREE.EdgesGeometry(arbiterGeometry),
    [arbiterGeometry]
  );
  const arbiterFaceFrameInverse = useMemo(() => {
    const positions = arbiterGeometry.getAttribute('position');
    const normals = arbiterGeometry.getAttribute('normal');
    const first = new THREE.Vector3().fromBufferAttribute(positions, 0);
    const second = new THREE.Vector3().fromBufferAttribute(positions, 1);
    const faceTangent = second.sub(first).normalize();
    const faceNormal = new THREE.Vector3()
      .fromBufferAttribute(normals, 0)
      .normalize();
    const faceUp = new THREE.Vector3()
      .crossVectors(faceNormal, faceTangent)
      .normalize();
    const faceBasis = new THREE.Matrix4().makeBasis(
      faceTangent,
      faceUp,
      faceNormal
    );
    return new THREE.Quaternion().setFromRotationMatrix(faceBasis).invert();
  }, [arbiterGeometry]);
  const bodyProjectionInward = useMemo(() => new THREE.Vector3(), []);
  const bodyProjectionTangent = useMemo(() => new THREE.Vector3(), []);
  const bodyProjectionUp = useMemo(() => new THREE.Vector3(), []);
  const bodyProjectionBasis = useMemo(() => new THREE.Matrix4(), []);
  const bodyProjectionFrame = useMemo(() => new THREE.Quaternion(), []);
  const bodyProjectionTarget = useMemo(() => new THREE.Quaternion(), []);
  const projectionAnimationProgressRef = useRef(0);
  const prefersReducedMotion = useMemo(
    () =>
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false,
    []
  );

  useEffect(
    () => () => {
      arbiterEdges.dispose();
      arbiterGeometry.dispose();
      orbitGeometry.dispose();
    },
    [arbiterEdges, arbiterGeometry, orbitGeometry]
  );

  useEffect(() => {
    orbitLineRef.current?.computeLineDistances();
  }, [orbitGeometry]);

  useFrame(({ clock }, delta) => {
    const elapsedTime = clock.getElapsedTime();
    const angle = arbiterOrbitAngle(elapsedTime, prefersReducedMotion);

    if (orbitSystemRef.current) {
      orbitSystemRef.current.rotation.y = arbiterOrbitPrecession(
        elapsedTime,
        prefersReducedMotion
      );
    }

    if (arbiterRef.current) {
      positionOnArbiterOrbit(angle, orbitPosition);
      arbiterRef.current.position.copy(orbitPosition);
    }

    projectionAnimationProgressRef.current = nextProjectionAnimationProgress(
      projectionAnimationProgressRef.current,
      isProjectionVisible,
      prefersReducedMotion,
      delta
    );
    const isProjectionSequenceActive =
      isProjectionVisible || projectionAnimationProgressRef.current > 0;

    if (bodyRef.current) {
      if (isProjectionSequenceActive) {
        bodyProjectionInward.copy(orbitPosition).normalize().negate();
        tangentOnArbiterOrbit(angle, bodyProjectionTangent);
        bodyProjectionUp
          .crossVectors(bodyProjectionInward, bodyProjectionTangent)
          .normalize();
        bodyProjectionBasis.makeBasis(
          bodyProjectionTangent,
          bodyProjectionUp,
          bodyProjectionInward
        );
        bodyProjectionFrame.setFromRotationMatrix(bodyProjectionBasis);
        bodyProjectionTarget
          .copy(bodyProjectionFrame)
          .multiply(arbiterFaceFrameInverse);

        if (prefersReducedMotion) {
          bodyRef.current.quaternion.copy(bodyProjectionTarget);
        } else {
          bodyRef.current.quaternion.slerp(
            bodyProjectionTarget,
            1 - Math.exp(-delta * PROJECTION_ALIGNMENT_DAMPING)
          );
        }
      } else if (!prefersReducedMotion) {
        bodyRef.current.rotation.x += delta * ARBITER_ROTATION_SPEED.x;
        bodyRef.current.rotation.y += delta * ARBITER_ROTATION_SPEED.y;
        bodyRef.current.rotation.z += delta * ARBITER_ROTATION_SPEED.z;
      }
    }

    if (bodyMaterialRef.current) {
      const targetOpacity = isProjectionSequenceActive
        ? PROJECTION_BODY_OPACITY
        : 1;
      bodyMaterialRef.current.opacity = prefersReducedMotion
        ? targetOpacity
        : THREE.MathUtils.damp(
            bodyMaterialRef.current.opacity,
            targetOpacity,
            PROJECTION_OPACITY_DAMPING,
            delta
          );
      bodyMaterialRef.current.depthWrite =
        bodyMaterialRef.current.opacity > 0.995;
    }

    if (orbitMaterialRef.current) {
      const isOrbitHighlighted =
        isTracking ||
        isHovered ||
        performance.now() < orbitHighlightUntilRef.current;
      const response = 1 - Math.exp(-delta * 9);
      orbitMaterialRef.current.color.lerp(
        isOrbitHighlighted ? ORBIT_HOVER_COLOR : ORBIT_IDLE_COLOR,
        response
      );
      orbitMaterialRef.current.opacity = THREE.MathUtils.damp(
        orbitMaterialRef.current.opacity,
        isOrbitHighlighted ? 0.48 : 0.11,
        9,
        delta
      );
    }
  });

  const handlePointerOver = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    document.body.style.cursor = 'pointer';
    orbitHighlightUntilRef.current = Number.POSITIVE_INFINITY;
    setIsHovered(true);
  };

  const handlePointerOut = () => {
    document.body.style.cursor = '';
    orbitHighlightUntilRef.current = performance.now() + ORBIT_HOVER_HOLD_MS;
    setIsHovered(false);
  };

  const handleClick = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    document.body.style.cursor = '';
    onInspect();
  };

  return (
    <group ref={orbitSystemRef}>
      <lineLoop
        ref={orbitLineRef}
        geometry={orbitGeometry}
        raycast={() => undefined}
      >
        <lineDashedMaterial
          ref={orbitMaterialRef}
          color={SECTOR_COLORS.neutralGrid}
          transparent
          opacity={0.11}
          depthWrite={false}
          dashSize={0.035}
          gapSize={0.12}
        />
      </lineLoop>

      <group ref={arbiterRef}>
        <group
          ref={bodyRef}
          rotation={[
            ARBITER_INITIAL_ROTATION.x,
            ARBITER_INITIAL_ROTATION.y,
            ARBITER_INITIAL_ROTATION.z,
          ]}
        >
          <mesh geometry={arbiterGeometry} raycast={() => undefined}>
            <meshBasicMaterial
              ref={bodyMaterialRef}
              color={SECTOR_COLORS.neutral}
              transparent
              side={THREE.DoubleSide}
            />
          </mesh>

          <lineSegments geometry={arbiterEdges} raycast={() => undefined}>
            <lineBasicMaterial
              color={SECTOR_COLORS.hover}
              transparent
              opacity={0.94}
              toneMapped={false}
            />
          </lineSegments>

          <mesh
            geometry={arbiterGeometry}
            scale={3.5}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
            onClick={handleClick}
          >
            <meshBasicMaterial
              transparent
              opacity={0}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      </group>

      <ArbiterProjection
        imageUrl={snapshot?.billboard?.imageUrl ?? null}
        animationProgressRef={projectionAnimationProgressRef}
        prefersReducedMotion={prefersReducedMotion}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      />
    </group>
  );
}

function ArbiterProjection({
  imageUrl,
  animationProgressRef,
  prefersReducedMotion,
  onPointerOver,
  onPointerOut,
  onClick,
}: {
  imageUrl: string | null;
  animationProgressRef: { current: number };
  prefersReducedMotion: boolean;
  onPointerOver: (event: { stopPropagation: () => void }) => void;
  onPointerOut: () => void;
  onClick: (event: { stopPropagation: () => void }) => void;
}) {
  const projectionRef = useRef<THREE.Group>(null);
  const projectionPosition = useMemo(() => new THREE.Vector3(), []);
  const projectionRadial = useMemo(() => new THREE.Vector3(), []);
  const projectionRight = useMemo(() => new THREE.Vector3(), []);
  const projectionUp = useMemo(() => new THREE.Vector3(), []);
  const projectionOrientation = useMemo(() => new THREE.Matrix4(), []);
  const projectionContentRef = useRef<THREE.Group>(null);
  const projectionImageRef = useRef<THREE.Group>(null);
  const frontRegistrationRef = useRef<THREE.Group>(null);
  const backRegistrationRef = useRef<THREE.Group>(null);
  const backdropMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const frontMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const backMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const emptyTexture = useMemo(createEmptyProjectionTexture, []);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [projectionSize, setProjectionSize] = useState(() =>
    projectionDimensions(PROJECTION_DEFAULT_ASPECT_RATIO, 1)
  );

  useLayoutEffect(() => {
    if (projectionContentRef.current) {
      projectionContentRef.current.visible = false;
    }
  }, []);

  useEffect(() => {
    setTexture(null);
    setProjectionSize(projectionDimensions(PROJECTION_DEFAULT_ASPECT_RATIO, 1));
    if (!imageUrl) return;

    let active = true;
    let loaded: THREE.Texture | null = null;
    const next = new THREE.TextureLoader().load(imageUrl, (value) => {
      if (!active) return value.dispose();
      value.colorSpace = THREE.SRGBColorSpace;
      value.minFilter = THREE.LinearMipmapLinearFilter;
      loaded = value;
      const source = value.image as {
        naturalWidth?: number;
        naturalHeight?: number;
        width?: number;
        height?: number;
      };
      setProjectionSize(
        projectionDimensions(
          source.naturalWidth ?? source.width ?? 0,
          source.naturalHeight ?? source.height ?? 0
        )
      );
      setTexture(value);
    });

    return () => {
      active = false;
      loaded?.dispose();
      if (next !== loaded) next.dispose();
      setTexture(null);
    };
  }, [imageUrl]);

  useEffect(() => () => emptyTexture.dispose(), [emptyTexture]);

  const mirroredTexture = useMemo(() => {
    if (!texture) return null;
    const mirrored = texture.clone();
    mirrored.wrapS = THREE.RepeatWrapping;
    mirrored.repeat.x = -1;
    mirrored.offset.x = 1;
    mirrored.updateMatrix();
    mirrored.needsUpdate = true;
    return mirrored;
  }, [texture]);

  useEffect(() => () => mirroredTexture?.dispose(), [mirroredTexture]);

  useFrame(({ clock }) => {
    const projection = projectionRef.current;
    if (!projection) return;

    const angle = arbiterOrbitAngle(
      clock.getElapsedTime(),
      prefersReducedMotion
    );
    positionOnArbiterOrbit(angle, projectionPosition);
    projectionPosition.setLength(PROJECTION_ORBIT_RADIUS);
    projection.position.copy(projectionPosition);
    projectionRadial.copy(projectionPosition).normalize();
    upOnArbiterOrbit(projectionUp);
    projectionRight.crossVectors(projectionUp, projectionRadial).normalize();
    projectionOrientation.makeBasis(
      projectionRight,
      projectionUp,
      projectionRadial
    );
    projection.quaternion.setFromRotationMatrix(projectionOrientation);

    const animationProgress = animationProgressRef.current;
    const bracketPhase = THREE.MathUtils.clamp(
      animationProgress / PROJECTION_BRACKET_PHASE_END,
      0,
      1
    );
    const bracketExpansion = THREE.MathUtils.smootherstep(bracketPhase, 0, 1);
    const imagePhase = THREE.MathUtils.clamp(
      (animationProgress - PROJECTION_BRACKET_PHASE_END) /
        (1 - PROJECTION_BRACKET_PHASE_END),
      0,
      1
    );
    const imageOpacity = projectionFlickerOpacity(imagePhase);

    if (projectionContentRef.current) {
      projectionContentRef.current.visible = animationProgress > 0;
    }
    setRegistrationMarksExpansion(
      frontRegistrationRef.current,
      bracketExpansion,
      projectionSize.width,
      projectionSize.height
    );
    setRegistrationMarksExpansion(
      backRegistrationRef.current,
      bracketExpansion,
      projectionSize.width,
      projectionSize.height
    );
    if (projectionImageRef.current) {
      projectionImageRef.current.visible = imageOpacity > 0;
    }
    if (backdropMaterialRef.current) {
      backdropMaterialRef.current.opacity = imageOpacity * 0.94;
      backdropMaterialRef.current.depthWrite = imageOpacity > 0.995;
    }
    if (frontMaterialRef.current) {
      frontMaterialRef.current.opacity = imageOpacity;
      frontMaterialRef.current.depthWrite = imageOpacity > 0.995;
    }
    if (backMaterialRef.current) {
      backMaterialRef.current.opacity = imageOpacity;
      backMaterialRef.current.depthWrite = imageOpacity > 0.995;
    }
  });

  const frontTexture = mirroredTexture ?? emptyTexture;
  const backTexture = mirroredTexture ?? emptyTexture;

  return (
    <group ref={projectionRef}>
      <group
        ref={projectionContentRef}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onClick={onClick}
      >
        <group ref={projectionImageRef}>
          <mesh raycast={() => undefined}>
            <planeGeometry
              args={[projectionSize.width + 0.12, projectionSize.height + 0.12]}
            />
            <meshBasicMaterial
              ref={backdropMaterialRef}
              color="#000000"
              transparent
              opacity={0}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0, PROJECTION_FACE_OFFSET]} renderOrder={5}>
            <planeGeometry
              args={[projectionSize.width, projectionSize.height]}
            />
            <meshBasicMaterial
              ref={frontMaterialRef}
              map={frontTexture}
              transparent
              opacity={0}
              depthWrite={false}
              side={THREE.FrontSide}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0, -PROJECTION_FACE_OFFSET]} renderOrder={5}>
            <planeGeometry
              args={[projectionSize.width, projectionSize.height]}
            />
            <meshBasicMaterial
              ref={backMaterialRef}
              map={backTexture}
              transparent
              opacity={0}
              depthWrite={false}
              side={THREE.BackSide}
              toneMapped={false}
            />
          </mesh>
        </group>
        <ProjectionRegistrationMarks
          rootRef={frontRegistrationRef}
          positionZ={PROJECTION_MARK_OFFSET}
          side={THREE.FrontSide}
        />
        <ProjectionRegistrationMarks
          rootRef={backRegistrationRef}
          positionZ={-PROJECTION_MARK_OFFSET}
          side={THREE.BackSide}
        />
        <mesh position={[0, 0, PROJECTION_MARK_OFFSET + 0.005]}>
          <planeGeometry args={[projectionSize.width, projectionSize.height]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

function ProjectionRegistrationMarks({
  rootRef,
  positionZ,
  side,
}: {
  rootRef: RefObject<THREE.Group | null>;
  positionZ: number;
  side: THREE.Side;
}) {
  return (
    <group ref={rootRef} position={[0, 0, positionZ]} raycast={() => undefined}>
      {PROJECTION_MARKS.map(({ x, y, xDirection, yDirection }) => (
        <group key={`${x}:${y}`}>
          <mesh position={[xDirection * 0.08, 0, 0]}>
            <planeGeometry args={[0.17, 0.018]} />
            <meshBasicMaterial
              color={SECTOR_COLORS.hover}
              side={side}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, yDirection * 0.08, 0]}>
            <planeGeometry args={[0.018, 0.17]} />
            <meshBasicMaterial
              color={SECTOR_COLORS.hover}
              side={side}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function setRegistrationMarksExpansion(
  root: THREE.Group | null,
  expansion: number,
  width: number,
  height: number
) {
  if (!root) return;

  const horizontalOffset = width / 2 + 0.035;
  const verticalOffset = height / 2 + 0.035;
  PROJECTION_MARKS.forEach(({ x, y }, index) => {
    root.children[index]?.position.set(
      x * horizontalOffset * expansion,
      y * verticalOffset * expansion,
      0
    );
  });
}

function nextProjectionAnimationProgress(
  current: number,
  isProjectionVisible: boolean,
  prefersReducedMotion: boolean,
  delta: number
) {
  if (prefersReducedMotion) return isProjectionVisible ? 1 : 0;

  return THREE.MathUtils.clamp(
    current +
      (isProjectionVisible ? delta : -delta) / PROJECTION_ANIMATION_DURATION,
    0,
    1
  );
}

function projectionFlickerOpacity(progress: number) {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  for (let index = 1; index < PROJECTION_FLICKER_KEYFRAMES.length; index += 1) {
    const [nextProgress, nextOpacity] = PROJECTION_FLICKER_KEYFRAMES[index];
    if (clamped > nextProgress) continue;

    const [previousProgress, previousOpacity] =
      PROJECTION_FLICKER_KEYFRAMES[index - 1];
    return THREE.MathUtils.lerp(
      previousOpacity,
      nextOpacity,
      (clamped - previousProgress) / (nextProgress - previousProgress)
    );
  }

  return 1;
}

function createEmptyProjectionTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#252525';
  context.setLineDash([8, 10]);
  context.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
  context.setLineDash([]);
  context.fillStyle = '#686868';
  context.font = '18px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('SIGNAL AVAILABLE', canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
