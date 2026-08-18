import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SECTOR_COLORS } from '../../utils/sectorVisuals';

const ORBIT_RADIUS = 17;
const ORBIT_TILT = THREE.MathUtils.degToRad(56);
const ORBIT_ROLL = THREE.MathUtils.degToRad(-14);
const ORBIT_SPEED = 0.14;
const ORBIT_PRECESSION_SPEED = 0.018;
const START_ANGLE = THREE.MathUtils.degToRad(28);
const ARBITER_RADIUS = 0.62;
const ORBIT_HOVER_HOLD_MS = 3_000;
const ORBIT_IDLE_COLOR = new THREE.Color(SECTOR_COLORS.neutralGrid);
const ORBIT_HOVER_COLOR = new THREE.Color(SECTOR_COLORS.hover);

function positionOnOrbit(angle: number, target: THREE.Vector3) {
  const flatX = Math.cos(angle) * ORBIT_RADIUS;
  const flatY = Math.sin(angle) * ORBIT_RADIUS * Math.cos(ORBIT_TILT);

  target.set(
    flatX * Math.cos(ORBIT_ROLL) - flatY * Math.sin(ORBIT_ROLL),
    flatX * Math.sin(ORBIT_ROLL) + flatY * Math.cos(ORBIT_ROLL),
    Math.sin(angle) * ORBIT_RADIUS * Math.sin(ORBIT_TILT)
  );
}

export function OrbitalArbiter({ onInspect }: { onInspect: () => void }) {
  const orbitSystemRef = useRef<THREE.Group>(null);
  const arbiterRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const orbitLineRef = useRef<THREE.LineLoop>(null);
  const orbitMaterialRef = useRef<THREE.LineDashedMaterial>(null);
  const orbitHighlightUntilRef = useRef(0);
  const [isHovered, setIsHovered] = useState(false);
  const orbitPosition = useMemo(() => new THREE.Vector3(), []);
  const orbitGeometry = useMemo(() => {
    const points = Array.from({ length: 161 }, (_, index) => {
      const point = new THREE.Vector3();
      positionOnOrbit((index / 160) * Math.PI * 2, point);
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
    const angle = prefersReducedMotion
      ? START_ANGLE
      : START_ANGLE + elapsedTime * ORBIT_SPEED;

    if (orbitSystemRef.current && !prefersReducedMotion) {
      orbitSystemRef.current.rotation.y = elapsedTime * ORBIT_PRECESSION_SPEED;
    }

    if (arbiterRef.current) {
      positionOnOrbit(angle, orbitPosition);
      arbiterRef.current.position.copy(orbitPosition);
    }

    if (bodyRef.current && !prefersReducedMotion) {
      bodyRef.current.rotation.x += delta * 0.42;
      bodyRef.current.rotation.y += delta * 0.68;
      bodyRef.current.rotation.z -= delta * 0.18;
    }

    if (orbitMaterialRef.current) {
      const isOrbitHighlighted =
        isHovered || performance.now() < orbitHighlightUntilRef.current;
      const response = 1 - Math.exp(-delta * 9);
      orbitMaterialRef.current.color.lerp(
        isOrbitHighlighted ? ORBIT_HOVER_COLOR : ORBIT_IDLE_COLOR,
        response
      );
      orbitMaterialRef.current.opacity = THREE.MathUtils.damp(
        orbitMaterialRef.current.opacity,
        isOrbitHighlighted ? 0.58 : 0.11,
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
        <group ref={bodyRef} rotation={[0.34, 0.18, -0.22]}>
          <mesh geometry={arbiterGeometry} raycast={() => undefined}>
            <meshBasicMaterial
              color={SECTOR_COLORS.neutral}
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
    </group>
  );
}
